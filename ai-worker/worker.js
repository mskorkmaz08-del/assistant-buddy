// Cloudflare Worker that lets the app talk to Google Gemini without putting the API key on the website.
// Secrets/vars (set in the Cloudflare dashboard): GEMINI_API_KEY (secret), ALLOWED_ORIGIN (e.g. https://yourname.github.io),
// MODEL (optional, defaults to gemini-2.5-flash).
// Sign-in and sync between devices also needs a KV namespace bound as BUDDY_KV.
// Feedback (ideas, uncomfortable things, errors) becomes GitHub issues: GITHUB_TOKEN (secret, Issues read/write
// on the repo only) and GITHUB_REPO (e.g. yourname/assistant-buddy). Without them, feedback is kept in BUDDY_KV.

const SYSTEM = `You are a cute, kind planning buddy (a little bear, panda or cat) inside a planner app for teenage girls.
Help them plan study, homework, hobbies, routines and self-care. Be warm, encouraging and short (max ~90 words).
Never shame them. Keep everything age-appropriate. If someone mentions feeling very sad, unsafe, or hurting themselves,
gently encourage them to talk to a trusted adult (parent, teacher, school counsellor) or a local helpline, and do not give other advice on that.
Do not ask for personal details like address, school name, or phone number.
When it helps, suggest up to 8 concrete tasks with real dates (YYYY-MM-DD, counting from the given "today") and optional times (HH:MM, 24h).
Category must be one of: study, hobby, routine, selfcare.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    tasks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          date: { type: 'STRING' },
          time: { type: 'STRING' },
          cat: { type: 'STRING', enum: ['study', 'hobby', 'routine', 'selfcare'] }
        },
        required: ['title', 'date', 'cat']
      }
    }
  },
  required: ['reply']
};

function cors(env, origin) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.length === 0 || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin || '*' : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin'
  };
}

// ---------- accounts: nickname + password, one saved copy of the planner per account ----------
const NICK = /^[\p{L}\p{N}_.-]{3,20}$/u;
const MAX_DATA = 400000; // bytes; a year of tasks is far smaller

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, headers) });
}
function hex(buf) { return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256);
  return hex(bits);
}
function same(a, b) { // constant-time compare
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function whoIs(request, env) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('Authorization') || '');
  return m ? env.BUDDY_KV.get('token:' + m[1]) : null;
}

async function account(request, env, headers) {
  if (!env.BUDDY_KV) return json({ error: 'Sync is not set up yet.' }, 501, headers);
  const url = new URL(request.url);

  if (url.pathname === '/account' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400, headers); }
    const name = String(body.name || '').trim();
    const password = String(body.password || '');
    if (!NICK.test(name)) return json({ error: 'Nicknames are 3 to 20 letters or numbers.' }, 400, headers);
    if (password.length < 4 || password.length > 100) return json({ error: 'Passwords need at least 4 characters.' }, 400, headers);
    const key = 'user:' + name.toLowerCase();
    const user = await env.BUDDY_KV.get(key, 'json');
    if (body.action === 'signup') {
      if (user) return json({ error: 'That nickname is taken. Try another, or sign in.' }, 409, headers);
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      await env.BUDDY_KV.put(key, JSON.stringify({ name: name, salt: salt, hash: await hashPassword(password, salt), data: null, updatedAt: 0 }));
    } else if (!user || !same(user.hash, await hashPassword(password, user.salt))) {
      return json({ error: 'Nickname or password is wrong.' }, 401, headers);
    }
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    await env.BUDDY_KV.put('token:' + token, name.toLowerCase());
    return json({ token: token, name: user ? user.name : name, data: user ? user.data : null, updatedAt: user ? user.updatedAt : 0 }, 200, headers);
  }

  if (url.pathname === '/data') {
    const who = await whoIs(request, env);
    if (!who) return json({ error: 'Please sign in again.' }, 401, headers);
    const key = 'user:' + who;
    const user = await env.BUDDY_KV.get(key, 'json');
    if (!user) return json({ error: 'Please sign in again.' }, 401, headers);
    if (request.method === 'GET') return json({ data: user.data, updatedAt: user.updatedAt }, 200, headers);
    if (request.method === 'PUT') {
      const text = await request.text();
      if (text.length > MAX_DATA) return json({ error: 'Too much data.' }, 413, headers);
      let body;
      try { body = JSON.parse(text); } catch (e) { return json({ error: 'Bad request' }, 400, headers); }
      if (!body.data || typeof body.data !== 'object') return json({ error: 'Bad request' }, 400, headers);
      user.data = body.data;
      user.updatedAt = Date.now();
      await env.BUDDY_KV.put(key, JSON.stringify(user));
      return json({ updatedAt: user.updatedAt }, 200, headers);
    }
  }

  if (url.pathname === '/logout' && request.method === 'POST') {
    const m = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('Authorization') || '');
    if (m) await env.BUDDY_KV.delete('token:' + m[1]);
    return json({ ok: true }, 200, headers);
  }
  return new Response('Not found', { status: 404, headers });
}

// ---------- feedback from the app's Settings page ----------
const KINDS = { idea: 'Idea', uncomfortable: 'Uncomfortable', error: 'Error' };
async function feedback(request, env, headers) {
  if (request.method !== 'POST') return new Response('Not found', { status: 404, headers });
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400, headers); }
  const kind = KINDS[body.kind] ? body.kind : 'idea';
  const text = String(body.text || '').trim().slice(0, 2000);
  if (!text) return json({ error: 'Empty message' }, 400, headers);
  // a gentle limit so a stuck button can't flood the repo
  if (env.BUDDY_KV) {
    const ip = request.headers.get('CF-Connecting-IP') || 'x';
    const key = 'rate:' + ip + ':' + new Date().toISOString().slice(0, 13);
    const n = +(await env.BUDDY_KV.get(key) || 0);
    if (n >= 20) return json({ error: 'Too many messages, try later.' }, 429, headers);
    await env.BUDDY_KV.put(key, String(n + 1), { expirationTtl: 7200 });
  }
  const from = String(body.from || 'someone').slice(0, 30);
  const d = body.details && typeof body.details === 'object' ? body.details : {};
  const details = ['App version: ' + String(d.version || '?').slice(0, 20), 'Device: ' + String(d.device || '?').slice(0, 200),
    'Screen: ' + String(d.screen || '?').slice(0, 20), 'Installed on home screen: ' + (d.installed ? 'yes' : 'no'), 'Theme: ' + String(d.theme || '?').slice(0, 10)];
  const errors = Array.isArray(d.errors) ? d.errors.slice(0, 5).map((x) => '- `' + String(x).slice(0, 300).replace(/`/g, "'") + '`') : [];
  const issueBody = '> ' + text.replace(/\n/g, '\n> ') + '\n\nFrom: ' + from + ' · ' + String(body.at || new Date().toISOString()).slice(0, 30) +
    '\n\n<details><summary>Technical details</summary>\n\n' + details.join('\n') + (errors.length ? '\n\nRecent errors:\n' + errors.join('\n') : '') + '\n</details>';
  const title = '[' + KINDS[kind] + '] ' + text.split('\n')[0].slice(0, 70);
  if (env.GITHUB_TOKEN && env.GITHUB_REPO) {
    const res = await fetch('https://api.github.com/repos/' + env.GITHUB_REPO + '/issues', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.GITHUB_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'bear-buddy-worker', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title, body: issueBody, labels: [kind] })
    });
    if (!res.ok) return json({ error: 'Could not save right now.' }, 502, headers);
    return json({ ok: true }, 200, headers);
  }
  if (env.BUDDY_KV) {
    await env.BUDDY_KV.put('feedback:' + Date.now() + ':' + kind, JSON.stringify({ title: title, body: issueBody }));
    return json({ ok: true }, 200, headers);
  }
  return json({ error: 'Feedback is not set up yet.' }, 501, headers);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = cors(env, origin);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(origin)) return new Response('Forbidden', { status: 403, headers });
    const path = new URL(request.url).pathname;
    if (path === '/account' || path === '/data' || path === '/logout') return account(request, env, headers);
    if (path === '/feedback') return feedback(request, env, headers);
    if (request.method !== 'POST') return new Response('Not found', { status: 404, headers });

    if (!env.GEMINI_API_KEY) return json({ error: 'AI is not set up yet.' }, 501, headers);
    let body;
    try { body = await request.json(); } catch (e) { return new Response('Bad request', { status: 400, headers }); }
    const messages = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    const contents = messages
      .filter((m) => m && typeof m.text === 'string')
      .map((m) => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text.slice(0, 1000) }] }));
    if (!contents.length) return new Response('Bad request', { status: 400, headers });

    const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today || '') ? body.today : new Date().toISOString().slice(0, 10);
    const who = 'Today is ' + today + '. Your name is ' + String(body.buddy || 'Buddy').slice(0, 20) + '. The user\'s name is ' + String(body.name || 'friend').slice(0, 20) + '.';
    const model = env.MODEL || 'gemini-2.5-flash';
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM + '\n' + who }] },
        contents: contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 800, responseMimeType: 'application/json', responseSchema: SCHEMA }
      })
    });
    if (!res.ok) return new Response(JSON.stringify({ error: 'upstream ' + res.status }), { status: 502, headers: Object.assign({ 'Content-Type': 'application/json' }, headers) });
    const data = await res.json();
    let out = { reply: 'Hmm, let me think about that again!', tasks: [] };
    try {
      const text = data.candidates[0].content.parts.map((p) => p.text || '').join('');
      out = JSON.parse(text);
    } catch (e) { /* keep the fallback reply */ }
    return new Response(JSON.stringify({ reply: out.reply || '', tasks: Array.isArray(out.tasks) ? out.tasks : [] }), {
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers)
    });
  }
};
