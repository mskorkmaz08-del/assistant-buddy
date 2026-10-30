// Bear Buddy Planner: plan your day and week with a buddy whose mood follows your progress.
(function () {
  'use strict';

  const STORE_KEY = 'bearbuddy:v1';
  const { sfx, music } = window.Sounds;

  const KINDS = [
    { kind: 'bear', name: 'Biscuit', label: 'Bear', colors: [['#D3A283', 'Caramel'], ['#E8B88F', 'Honey'], ['#A9714F', 'Cocoa'], ['#F2C4CE', 'Strawberry'], ['#DCCDB6', 'Latte']] },
    { kind: 'panda', name: 'Mochi', label: 'Panda', colors: [['#FFFFFF', 'Snow'], ['#FDEFD9', 'Vanilla'], ['#FADDE4', 'Blossom'], ['#E3F1EA', 'Mint'], ['#E6E0F5', 'Lilac']] },
    { kind: 'cat', name: 'Mallow', label: 'Cat', colors: [['#FFFFFF', 'Snow'], ['#F2B47E', 'Ginger'], ['#C9C3CF', 'Grey'], ['#F7D9A8', 'Cream'], ['#E5D4F2', 'Lavender']] }
  ];
  const COSTUMES = [
    { id: 'none', name: 'No outfit', days: 0 },
    { id: 'bow', name: 'Pink bow', days: 0 },
    { id: 'dress', name: 'Party dress', days: 3 },
    { id: 'dino-green', name: 'Green dino suit', days: 5 },
    { id: 'dino-pink', name: 'Pink dino suit', days: 7 }
  ];
  const CATS = [
    { id: 'study', name: 'Study', color: '#ECE4FA', dot: '#6A58B8' },
    { id: 'hobby', name: 'Hobby', color: '#FFF0C9', dot: '#C98A12' },
    { id: 'routine', name: 'Routine', color: '#DDF1E6', dot: '#2F8A5B' },
    { id: 'selfcare', name: 'Self-care', color: '#FCE1E8', dot: '#C2416B' }
  ];
  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---------- storage ----------
  function freshState() {
    return {
      profile: null,
      tasks: [],
      bestStreak: 0,
      notified: {},
      settings: { sound: true, music: false },
      chat: []
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(freshState(), JSON.parse(raw));
    } catch (e) { /* storage blocked: start fresh */ }
    return freshState();
  }
  function saveLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function save() {
    state.dirty = true; // changed on this device since the last sync
    saveLocal();
    pushSoon();
  }

  // ---------- account sync: nickname + password through the Cloudflare helper (ai-worker/) ----------
  const CFG = window.BUDDY_CONFIG || {};
  const SERVER = String(CFG.server || '').replace(/\/+$/, '');
  const AI_URL = CFG.aiEndpoint || SERVER;
  const ACCOUNT_KEY = 'bearbuddy:account';
  const LOCAL_ONLY = ['notified', 'dirty', 'syncedAt']; // per-device bookkeeping, never uploaded
  const sync = { timer: null, busy: false, status: '' };
  let account = null;
  try { account = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null'); } catch (e) { /* storage blocked */ }
  function saveAccount() {
    try { if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account)); else localStorage.removeItem(ACCOUNT_KEY); } catch (e) { /* ignore */ }
  }
  async function api(path, method, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (account) headers.Authorization = 'Bearer ' + account.token;
    const res = await fetch(SERVER + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(data.error || 'Something went wrong. Try again?'); err.status = res.status; throw err; }
    return data;
  }
  function syncData() {
    const d = Object.assign({}, state);
    LOCAL_ONLY.forEach((k) => delete d[k]);
    return d;
  }
  function applyRemote(data, updatedAt) {
    const notified = state.notified || {};
    Object.keys(state).forEach((k) => delete state[k]);
    Object.assign(state, freshState(), data, { notified: notified, dirty: false, syncedAt: updatedAt });
    saveLocal();
  }
  function setSyncStatus(text) {
    sync.status = text;
    const el = document.querySelector('.sync-status');
    if (el) el.textContent = text;
  }
  function signedOutHere() {
    account = null; saveAccount();
    toast('Please sign in again to keep syncing.');
    if (ui.view === 'closet') render();
  }
  function pushSoon() {
    if (!account || !SERVER) return;
    clearTimeout(sync.timer);
    setSyncStatus('Saving…');
    sync.timer = setTimeout(push, 1500);
  }
  async function push() {
    if (!account || !state.profile) return;
    try {
      const r = await api('/data', 'PUT', { data: syncData() });
      state.syncedAt = r.updatedAt; state.dirty = false; saveLocal();
      setSyncStatus('Synced');
    } catch (e) {
      if (e.status === 401) signedOutHere(); else setSyncStatus('Offline. I’ll sync when you’re back online.');
    }
  }
  // Fetch the latest copy from other devices. Newest change wins.
  async function pull() {
    if (!account || !SERVER) return;
    try {
      const r = await api('/data', 'GET');
      if (state.dirty) { push(); return; }
      if (r.data && r.updatedAt > (state.syncedAt || 0)) {
        if (ui.draft || ui.account || ui.tour != null) return; // don't swap data under an open form
        applyRemote(r.data, r.updatedAt);
        render();
      }
      setSyncStatus('Synced');
    } catch (e) {
      if (e.status === 401) signedOutHere(); else setSyncStatus('Offline. I’ll sync when you’re back online.');
    }
  }

  // iPhone/iPad (iPadOS reports itself as a Mac with touch) and whether we run from the Home Screen.
  const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const STANDALONE = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const NEEDS_INSTALL = IS_IOS && !STANDALONE;

  const state = load();
  const ui = { view: state.profile ? 'today' : 'onboard', weekDay: null, draft: null, onboard: { kind: 'bear', colors: {} }, aiBusy: false };

  // ---------- dates ----------
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parse(s) { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function today() { return ymd(new Date()); }
  function weekStart(s) { const d = parse(s); const wd = (d.getDay() + 6) % 7; return addDays(s, -wd); } // Monday
  function prettyDate(s) { const d = parse(s); return DAY_SHORT[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate(); }
  function prettyTime(t) {
    if (!t) return 'Any time';
    const p = t.split(':'); let h = +p[0]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return h + ':' + p[1] + ' ' + ap;
  }

  // ---------- tasks ----------
  function tasksFor(date) {
    const wd = parse(date).getDay();
    return state.tasks
      .filter((t) => t.date === date || (t.repeat && date > t.date && parse(t.date).getDay() === wd))
      .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  }
  function isDone(t, date) { return !!(t.done && t.done[date]); }
  function dayStats(date) {
    const list = tasksFor(date);
    const done = list.filter((t) => isDone(t, date)).length;
    return { total: list.length, done: done };
  }
  function streak() {
    // consecutive days with at least one finished task, ending today (or yesterday if today has none yet)
    let d = today();
    if (dayStats(d).done === 0) d = addDays(d, -1);
    let n = 0;
    while (dayStats(d).done > 0 && n < 3650) { n++; d = addDays(d, -1); }
    return n;
  }
  function refreshBest() {
    const s = streak();
    if (s > state.bestStreak) {
      const before = state.bestStreak;
      state.bestStreak = s;
      const unlocked = COSTUMES.filter((c) => c.days > before && c.days <= s);
      if (unlocked.length) setTimeout(() => toast('New outfit unlocked: ' + unlocked.map((c) => c.name).join(', ') + '!'), 900);
    }
  }
  function mood(date) {
    const st = dayStats(date);
    const hour = new Date().getHours();
    if (st.total === 0) return 'neutral';
    if (st.done === st.total) return 'dancing';
    if (st.done === 0) {
      // only sad in the evening once a planned time has already gone by, or for a past day
      const now = String(hour).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0');
      const missed = tasksFor(date).some((t) => t.time && t.time < now);
      return (date < today() || (hour >= 18 && missed)) ? 'sad' : 'neutral';
    }
    return st.done / st.total >= 0.5 ? 'happy' : 'neutral';
  }
  function moodLine(m, st) {
    const name = esc(state.profile.name || 'friend');
    if (st.total === 0) return 'Hi ' + name + '! Let’s plan something nice for today.';
    if (m === 'dancing') return 'ALL DONE! Dance party time, ' + name + '!';
    if (m === 'happy') return 'Yay, more than halfway! You’re on a roll.';
    if (m === 'sad') return 'I miss you… can we do just one small task together?';
    if (st.done === 0) return 'Ready when you are! Which one first?';
    return 'Nice start! Keep going, I’m cheering for you.';
  }

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function cat(id) { return CATS.find((c) => c.id === id) || CATS[0]; }
  function kindInfo(k) { return KINDS.find((x) => x.kind === k) || KINDS[0]; }
  function buddy(m, size, extra) {
    const p = state.profile;
    return window.Buddy.buddySVG(Object.assign({ kind: p.kind, color: p.color, costume: p.costume, mood: m, size: size, label: p.buddyName + ' feels ' + m }, extra || {}));
  }
  function play(name) { if (state.settings.sound) sfx[name](); }
  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }
  const ICON = {
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21.1l1.4-7L2 9.3l7-.8z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
    music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>',
    mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true" class="inline"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>',
    timer: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
    reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    skip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l10 7-10 7zM19 5v14"/></svg>',
    expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  // cosy room behind the buddy: wooden wall, window with falling snow, a warm lamp and a rug
  function room() {
    let flakes = '';
    for (let i = 0; i < 14; i++) {
      const x = 22 + ((i * 37) % 76);
      flakes += '<circle class="flake" style="animation-delay:-' + (i * 0.7).toFixed(1) + 's" cx="' + x + '" cy="0" r="' + (1.2 + (i % 3) * 0.6) + '" fill="#FFFFFF"/>';
    }
    return '<svg class="room" viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<rect width="360" height="200" fill="#F6D9BF"/>' +
      '<g stroke="#E9C3A2" stroke-width="2">' + [28, 56, 84, 112, 140].map((y) => '<line x1="0" x2="360" y1="' + y + '" y2="' + y + '"/>').join('') + '</g>' +
      '<rect x="0" y="150" width="360" height="50" fill="#D9A77E"/>' +
      '<ellipse cx="180" cy="178" rx="120" ry="16" fill="#F2B7C2" opacity="0.8"/>' +
      '<g transform="translate(14 22)"><rect width="104" height="86" rx="10" fill="#3E4C7A" stroke="#8C5A3E" stroke-width="6"/>' +
      '<clipPath id="win"><rect width="104" height="86" rx="10"/></clipPath><g clip-path="url(#win)">' +
      '<circle cx="78" cy="22" r="10" fill="#FFF3C4"/>' + flakes +
      '<path d="M0 74 Q30 62 60 72 T104 68 V86 H0 Z" fill="#FFFFFF"/></g>' +
      '<path d="M52 0 V86 M0 43 H104" stroke="#8C5A3E" stroke-width="4"/></g>' +
      '<g transform="translate(300 40)"><circle cx="0" cy="40" r="46" fill="#FFE3A3" opacity="0.35"/>' +
      '<path d="M-16 30 L16 30 L10 6 L-10 6 Z" fill="#F7C873" stroke="#8C5A3E" stroke-width="3"/>' +
      '<rect x="-2" y="30" width="4" height="70" fill="#8C5A3E"/></g>' +
      '</svg>';
  }

  // ---------- views ----------
  function header(title, sub) {
    const s = state.settings;
    return '<header class="top"><div><p class="sub">' + sub + '</p><h1>' + title + '</h1></div><div class="top-btns">' +
      '<button class="icon-btn' + (timer.running ? ' on' : '') + '" data-action="focus" aria-label="Focus timer">' + ICON.timer + '</button>' +
      '<button class="icon-btn' + (s.music ? ' on' : '') + '" data-action="music" aria-pressed="' + s.music + '" aria-label="Background music">' + ICON.music + '</button>' +
      '<button class="icon-btn' + (s.sound ? ' on' : '') + '" data-action="sound" aria-pressed="' + s.sound + '" aria-label="Click sounds">' + (s.sound ? ICON.sound : ICON.mute) + '</button>' +
      '</div></header>';
  }
  function nav() {
    const item = (v, icon, label) => '<button class="nav-item' + (ui.view === v ? ' active' : '') + '" data-action="go" data-view="' + v + '"' + (ui.view === v ? ' aria-current="page"' : '') + '>' + icon + '<span>' + label + '</span></button>';
    return '<nav class="nav" aria-label="Main">' + item('today', ICON.sun, 'Today') + item('week', ICON.cal, 'Week') +
      '<button class="nav-add" data-action="add" aria-label="Add task">' + ICON.plus + '</button>' +
      item('closet', ICON.star, 'Buddy') + item('chat', ICON.chat, 'Ask') + '</nav>';
  }
  function taskRow(t, date) {
    const d = isDone(t, date);
    const c = cat(t.cat);
    return '<li class="task' + (d ? ' done' : '') + '">' +
      '<button class="check" data-action="toggle" data-id="' + t.id + '" data-date="' + date + '" aria-pressed="' + d + '" aria-label="' + (d ? 'Mark not done: ' : 'Mark done: ') + esc(t.title) + '">' + ICON.check + '</button>' +
      '<button class="task-main" data-action="edit" data-id="' + t.id + '"><span class="task-title">' + esc(t.title) + '</span>' +
      '<span class="task-meta">' + prettyTime(t.time) + (t.repeat ? ' · every week' : '') + (t.remind ? ' · ' + ICON.bell : '') + '</span></button>' +
      '<span class="tag" style="background:' + c.color + '">' + c.name + '</span></li>';
  }

  function viewOnboard() {
    const o = ui.onboard;
    const k = kindInfo(o.kind);
    const color = o.colors[o.kind] || k.colors[0][0];
    let cards = '';
    KINDS.forEach((x) => {
      const sel = x.kind === o.kind;
      cards += '<button class="pick' + (sel ? ' sel' : '') + '" data-action="pick-kind" data-kind="' + x.kind + '" aria-pressed="' + sel + '">' +
        window.Buddy.buddySVG({ kind: x.kind, color: o.colors[x.kind] || x.colors[0][0], mood: sel ? 'dancing' : 'neutral', size: 96 }) +
        '<b>' + x.name + '</b><span>' + x.label + '</span></button>';
    });
    let sw = '';
    k.colors.forEach((c) => {
      sw += '<button class="swatch' + (c[0] === color ? ' sel' : '') + '" style="background:' + c[0] + '" data-action="pick-color" data-color="' + c[0] + '" aria-pressed="' + (c[0] === color) + '" aria-label="' + c[1] + '"></button>';
    });
    return '<main class="screen onboard"><div class="hello"><h1>Choose your buddy</h1><p>They’ll cheer you on every day. You can change this later.</p></div>' +
      '<div class="picks">' + cards + '</div>' +
      '<fieldset class="card"><legend>Pick ' + k.name + '’s colour</legend><div class="swatches">' + sw + '</div></fieldset>' +
      '<form class="stack" data-form="onboard">' +
      '<label class="field"><span>Rename your buddy (optional)</span><input name="buddyName" maxlength="20" placeholder="' + k.name + '" autocomplete="off"></label>' +
      '<label class="field"><span>What should your buddy call you?</span><input name="name" maxlength="20" placeholder="Your name" autocomplete="given-name"></label>' +
      '<button class="primary" type="submit">Let’s go!</button>' +
      (SERVER && !ui.rebuddy && !account ? '<button class="ghost" type="button" data-action="account" data-mode="signin">I already have an account</button>' : '') +
      '</form></main>';
  }

  function viewToday() {
    const date = today();
    const st = dayStats(date);
    const m = mood(date);
    const list = tasksFor(date);
    const pct = st.total ? Math.round(st.done / st.total * 100) : 0;
    const s = streak();
    let body = '<section class="hero mood-bg-' + m + '">' + room() +
      '<div class="hero-buddy">' + buddy(m, 150) + '</div>' +
      '<div class="bubble">' + moodLine(m, st) + '</div></section>' +
      '<div class="progress card"><div class="bar"><span style="width:' + pct + '%"></span></div>' +
      '<p><b>' + st.done + ' of ' + st.total + '</b> done today · <b>' + s + '</b>-day streak</p></div>' +
      '<div class="section-head"><h2>Today’s plan</h2>' + (list.length ? '<span>Tap the circle to tick off</span>' : '') + '</div>';
    if (list.length) body += '<ul class="tasks">' + list.map((t) => taskRow(t, date)).join('') + '</ul>';
    else body += '<div class="empty card"><p>No plans yet. Add your first task, or ask ' + esc(state.profile.buddyName) + ' to help you plan!</p>' +
      '<div class="row"><button class="primary small" data-action="add">Add a task</button><button class="ghost small" data-action="go" data-view="chat">Help me plan</button></div></div>';
    return header('Hi ' + esc(state.profile.name || 'there') + '!', prettyDate(date)) + '<main class="screen">' + body + '</main>' + nav();
  }

  function viewWeek() {
    const t0 = today();
    const start = weekStart(t0);
    const sel = ui.weekDay || t0;
    let strip = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const st = dayStats(d);
      const mark = st.total === 0 ? '·' : (st.done === st.total ? '★' : st.done + '/' + st.total);
      strip += '<button class="day' + (d === sel ? ' sel' : '') + (d === t0 ? ' now' : '') + '" data-action="pick-day" data-date="' + d + '" aria-pressed="' + (d === sel) + '">' +
        '<span>' + DAY_SHORT[parse(d).getDay()] + '</span><b>' + parse(d).getDate() + '</b><small>' + mark + '</small></button>';
    }
    const list = tasksFor(sel);
    // weekly totals per category
    const totals = {};
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      tasksFor(d).forEach((t) => {
        const c = totals[t.cat] || (totals[t.cat] = { done: 0, total: 0 });
        c.total++; if (isDone(t, d)) c.done++;
      });
    }
    let goals = '';
    CATS.forEach((c) => {
      const x = totals[c.id];
      if (!x) return;
      goals += '<div class="goal"><div class="goal-top"><span>' + c.name + '</span><b>' + x.done + ' of ' + x.total + '</b></div>' +
        '<div class="bar" style="background:' + c.color + '"><span style="width:' + Math.round(x.done / x.total * 100) + '%;background:' + c.dot + '"></span></div></div>';
    });
    const ws = parse(start), we = parse(addDays(start, 6));
    let body = '<div class="days">' + strip + '</div>' +
      '<section class="card day-card"><div class="section-head"><h2>' + (sel === t0 ? 'Today' : prettyDate(sel)) + '</h2><button class="ghost small" data-action="add" data-date="' + sel + '">+ Add</button></div>' +
      (list.length ? '<ul class="tasks">' + list.map((t) => taskRow(t, sel)).join('') + '</ul>' : '<p class="muted">Nothing planned. A free day!</p>') + '</section>';
    if (goals) body += '<section class="card"><h2>This week</h2>' + goals + '</section>';
    body += '<button class="ask-card" data-action="go" data-view="chat">' + buddy('happy', 64, { costume: state.profile.costume }) +
      '<span>Want me to help plan your week?</span><b>Ask ' + esc(state.profile.buddyName) + '</b></button>';
    return header('This week', MONTHS[ws.getMonth()] + ' ' + ws.getDate() + ' – ' + MONTHS[we.getMonth()] + ' ' + we.getDate()) + '<main class="screen">' + body + '</main>' + nav();
  }

  function viewCloset() {
    const p = state.profile;
    const s = streak();
    const best = state.bestStreak;
    const next = COSTUMES.find((c) => c.days > best);
    let items = '';
    COSTUMES.forEach((c) => {
      const open = best >= c.days;
      const sel = p.costume === c.id;
      items += '<button class="outfit' + (sel ? ' sel' : '') + (open ? '' : ' locked') + '" data-action="wear" data-costume="' + c.id + '" aria-pressed="' + sel + '"' + (open ? '' : ' aria-disabled="true"') + '>' +
        window.Buddy.buddySVG({ kind: p.kind, color: p.color, costume: c.id, mood: 'neutral', size: 78 }) +
        '<b>' + c.name + '</b><span>' + (open ? (sel ? 'Wearing' : 'Tap to wear') : ICON.lock + c.days + '-day streak') + '</span></button>';
    });
    // last 7 days chart
    let bars = '';
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today(), -i);
      const st = dayStats(d);
      const h = st.done ? Math.max(10, Math.min(100, st.done * 22)) : 4;
      bars += '<div class="col"><span class="n">' + (st.done || '') + '</span><span class="b' + (i === 0 ? ' now' : '') + '" style="height:' + h + 'px"></span><span class="d">' + DAY_SHORT[parse(d).getDay()][0] + '</span></div>';
    }
    let sw = '';
    kindInfo(p.kind).colors.forEach((c) => {
      sw += '<button class="swatch' + (c[0] === p.color ? ' sel' : '') + '" style="background:' + c[0] + '" data-action="recolor" data-color="' + c[0] + '" aria-pressed="' + (c[0] === p.color) + '" aria-label="' + c[1] + '"></button>';
    });
    const body = '<section class="hero streak-hero">' + room() + '<div class="hero-buddy">' + buddy(s > 0 ? 'dancing' : 'neutral', 130) + '</div>' +
      '<div class="bubble"><b class="big">' + s + '-day streak</b>' + (next ? (next.days - best) + ' more day' + (next.days - best === 1 ? '' : 's') + ' to unlock the ' + next.name.toLowerCase() + '!' : 'You unlocked every outfit!') + '</div></section>' +
      '<section class="card"><h2>Tasks done, last 7 days</h2><div class="chart">' + bars + '</div></section>' +
      '<section class="card"><h2>' + esc(p.buddyName) + '’s closet</h2><div class="outfits">' + items + '</div></section>' +
      accountCard() +
      (NEEDS_INSTALL ? installCard() : '') +
      '<section class="card"><h2>Colour</h2><div class="swatches">' + sw + '</div>' +
      '<div class="row"><button class="ghost small" data-action="tour">Show me around again</button><button class="ghost small" data-action="rebuddy">Choose a different buddy</button><button class="ghost small" data-action="notify">' + ICON.bell + ' Allow reminders</button></div></section>';
    return header(esc(p.buddyName), 'Your buddy') + '<main class="screen">' + body + '</main>' + nav();
  }

  function viewChat() {
    const p = state.profile;
    const online = !!AI_URL;
    let msgs = '';
    if (!state.chat.length) {
      msgs += '<div class="msg bot">Hi ' + esc(p.name || 'friend') + '! Tell me what’s coming up, like tests, homework or hobbies, and I’ll help you make a plan.</div>';
    }
    state.chat.forEach((m, i) => {
      msgs += '<div class="msg ' + m.role + '">' + esc(m.text).replace(/\n/g, '<br>');
      if (m.tasks && m.tasks.length) {
        msgs += '<ul class="suggest">' + m.tasks.map((t) => '<li><b>' + esc(t.title) + '</b> · ' + prettyDate(t.date) + (t.time ? ', ' + prettyTime(t.time) : '') + '</li>').join('') + '</ul>' +
          (m.added ? '<p class="added">Added to your plan!</p>' : '<button class="primary small" data-action="add-suggested" data-i="' + i + '">Add these to my plan</button>');
      }
      msgs += '</div>';
    });
    if (ui.aiBusy) msgs += '<div class="msg bot typing"><span></span><span></span><span></span></div>';
    const chips = ['Plan my study week', 'I have a test on Friday', 'Help me make a morning routine', 'I feel unmotivated'];
    const body = '<div class="chat-buddy">' + buddy(ui.aiBusy ? 'happy' : 'neutral', 70) + '<p>' + (online ? esc(p.buddyName) + ' can use AI to help you plan.' : esc(p.buddyName) + '’s planning tips (works offline).') + '</p></div>' +
      '<div class="msgs" id="msgs">' + msgs + '</div>' +
      '<div class="chips">' + chips.map((c) => '<button class="chip" data-action="ask-chip">' + c + '</button>').join('') + '</div>' +
      '<form class="composer" data-form="chat"><label class="sr" for="ask">Message</label><input id="ask" name="q" maxlength="400" placeholder="Ask ' + esc(p.buddyName) + '…" autocomplete="off"><button class="send" type="submit" aria-label="Send">' + ICON.send + '</button></form>';
    return header('Ask ' + esc(p.buddyName), 'Planning help') + '<main class="screen chat">' + body + '</main>' + nav();
  }

  // ---------- task sheet ----------
  function openSheet(task, date) {
    ui.draft = task ? Object.assign({}, task) : { id: null, title: '', cat: 'study', date: date || (ui.view === 'week' && ui.weekDay) || today(), time: '', remind: true, repeat: false, done: {} };
    renderSheet();
    const input = document.querySelector('#sheet-root input[name=title]');
    if (input) input.focus();
  }
  function closeSheet() { ui.draft = null; document.getElementById('sheet-root').innerHTML = ''; }
  function renderSheet() {
    const t = ui.draft;
    if (!t) return;
    let chips = '';
    CATS.forEach((c) => {
      chips += '<button type="button" class="cat' + (t.cat === c.id ? ' sel' : '') + '" style="background:' + c.color + '" data-action="draft-cat" data-cat="' + c.id + '" aria-pressed="' + (t.cat === c.id) + '">' + c.name + '</button>';
    });
    let days = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(today(), i);
      days += '<option value="' + d + '"' + (d === t.date ? ' selected' : '') + '>' + (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : prettyDate(d)) + '</option>';
    }
    if (t.date < today() || t.date > addDays(today(), 6)) days = '<option value="' + t.date + '" selected>' + prettyDate(t.date) + '</option>' + days;
    const sw = (key, label, hint) => '<button type="button" class="switch" role="switch" aria-checked="' + !!t[key] + '" data-action="draft-flag" data-key="' + key + '"><span><b>' + label + '</b><small>' + hint + '</small></span><i></i></button>';
    document.getElementById('sheet-root').innerHTML =
      '<div class="scrim" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' + (t.id ? 'Edit task' : 'New task') + '">' +
      '<div class="sheet-head"><h2>' + (t.id ? 'Edit task' : 'New task') + '</h2><button class="icon-btn" data-action="close-sheet" aria-label="Close">' + ICON.back + '</button></div>' +
      '<form class="stack" data-form="task">' +
      '<label class="field"><span>Task</span><input name="title" maxlength="80" required placeholder="e.g. Biology flashcards" value="' + esc(t.title) + '" autocomplete="off"></label>' +
      '<fieldset><legend>Type</legend><div class="cats">' + chips + '</div></fieldset>' +
      '<div class="two"><label class="field"><span>Day</span><select name="date">' + days + '</select></label>' +
      '<label class="field"><span>Time</span><input type="time" name="time" value="' + esc(t.time) + '"></label></div>' +
      '<div class="switches card">' + sw('remind', 'Remind me', '15 minutes before') + sw('repeat', 'Repeat every week', 'Same day and time') + '</div>' +
      '<button class="primary" type="submit">' + (t.id ? 'Save' : 'Add to my plan') + '</button>' +
      (t.id ? '<button type="button" class="ghost" data-action="focus" data-id="' + t.id + '">' + ICON.timer + ' Focus on this</button>' +
        '<button type="button" class="danger" data-action="delete">' + ICON.trash + ' Delete task</button>' : '') +
      '</form></div>';
  }
  function openAccount(mode) { closeSheet(); ui.account = mode; ui.accountErr = ''; renderAccount(); const i = document.querySelector('#sheet-root input[name=nick]'); if (i) i.focus(); }
  function closeAccount() { ui.account = null; document.getElementById('sheet-root').innerHTML = ''; }
  function renderAccount() {
    const up = ui.account === 'signup';
    const old = document.querySelector('form[data-form=account]');
    const nick = old ? old.nick.value : '';
    document.getElementById('sheet-root').innerHTML =
      '<div class="scrim" data-action="close-account"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' + (up ? 'Make an account' : 'Sign in') + '">' +
      '<div class="sheet-head"><h2>' + (up ? 'Make an account' : 'Sign in') + '</h2><button class="icon-btn" data-action="close-account" aria-label="Close">' + ICON.back + '</button></div>' +
      '<form class="stack" data-form="account"><p class="hint">' + (up ? 'Pick a nickname and a password. Sign in with them on your other phone or iPad to see the same plan and buddy.' : 'Use the nickname and password you made on your other device.') + '</p>' +
      '<label class="field"><span>Nickname</span><input name="nick" maxlength="20" value="' + esc(nick) + '" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>' +
      '<label class="field"><span>Password</span><input name="pass" type="password" maxlength="100" minlength="4" autocomplete="' + (up ? 'new-password' : 'current-password') + '" required></label>' +
      (ui.accountErr ? '<p class="err" role="alert">' + esc(ui.accountErr) + '</p>' : '') +
      '<button class="primary" type="submit"' + (sync.busy ? ' disabled' : '') + '>' + (sync.busy ? 'One moment…' : up ? 'Create account' : 'Sign in') + '</button>' +
      '<button class="ghost small" type="button" data-action="account" data-mode="' + (up ? 'signin' : 'signup') + '">' + (up ? 'I already have an account' : 'I’m new: make an account') + '</button></form></div>';
  }
  async function submitAccount(f) {
    const up = ui.account === 'signup';
    const name = f.nick.value.trim();
    const password = f.pass.value;
    sync.busy = true; ui.accountErr = ''; renderAccount();
    try {
      const r = await api('/account', 'POST', { action: up ? 'signup' : 'login', name: name, password: password });
      account = { name: r.name, token: r.token }; saveAccount();
      sync.busy = false; closeAccount();
      if (r.data && r.data.profile) {
        applyRemote(r.data, r.updatedAt);
        ui.view = 'today'; ui.rebuddy = false;
        render(); play('celebrate');
        toast('Welcome back, ' + (state.profile.name || r.name) + '! Your plan is here.');
      } else {
        if (state.profile) push();
        render(); play('check');
        toast(up ? 'Account made! Your plan now syncs.' : 'Signed in! Your plan now syncs.');
      }
    } catch (e) {
      sync.busy = false;
      ui.accountErr = e.status ? e.message : 'I couldn’t reach the internet. Try again?';
      renderAccount();
    }
  }
  function accountCard() {
    if (!SERVER) return '';
    if (account) {
      return '<section class="card account"><h2>Your account</h2><p class="hint">Signed in as <b>' + esc(account.name) + '</b>. <span class="sync-status">' + esc(sync.status || 'Synced') + '</span></p>' +
        '<div class="row"><button class="ghost small" data-action="sync-now">Sync now</button><button class="ghost small" data-action="sign-out">Sign out</button></div></section>';
    }
    return '<section class="card account"><h2>Use me on all your devices</h2><p class="hint">Make an account with a nickname and password, then sign in on your phone and iPad to share one plan.</p>' +
      '<div class="row"><button class="primary small" data-action="account" data-mode="signup">Make an account</button><button class="ghost small" data-action="account" data-mode="signin">Sign in</button></div></section>';
  }

  function syncDraftFromForm() {
    const f = document.querySelector('form[data-form=task]');
    if (!f || !ui.draft) return;
    ui.draft.title = f.title.value;
    ui.draft.date = f.date.value;
    ui.draft.time = f.time.value;
  }

  // ---------- AI helper ----------
  function offlineReply(q) {
    const text = q.toLowerCase();
    const t0 = today();
    const at = (n, time, title, c) => ({ title: title, date: addDays(t0, n), time: time, cat: c });
    if (/test|exam|quiz/.test(text)) {
      const subj = (text.match(/(math|science|history|english|biology|chemistry|physics|french|spanish|geography|art)/) || [])[1];
      const s = subj ? subj[0].toUpperCase() + subj.slice(1) : 'Test';
      return { text: 'You’ve got this! Short sessions spread over a few days work better than one long cram. Here’s a gentle plan:', tasks: [
        at(0, '17:00', s + ': list the topics and gather notes', 'study'),
        at(1, '17:00', s + ': 25 min review + make flashcards', 'study'),
        at(2, '17:00', s + ': practice questions', 'study'),
        at(3, '17:00', s + ': quick flashcard round, then rest', 'study')
      ] };
    }
    if (/routine|morning/.test(text)) {
      return { text: 'A cosy morning routine! Keep it short so it’s easy to stick to:', tasks: [
        at(1, '07:00', 'Drink a glass of water', 'selfcare'),
        at(1, '07:10', 'Make the bed', 'routine'),
        at(1, '07:20', 'Pack bag & check timetable', 'routine'),
        at(1, '07:30', 'Breakfast + 2 min stretch', 'selfcare')
      ] };
    }
    if (/unmotivat|tired|sad|stress|lazy|can.?t focus|bored/.test(text)) {
      return { text: 'That’s okay, everyone has those days. Let’s pick ONE tiny task (5 minutes!) and I’ll dance when it’s done. Small wins count. You can also try the 25-5 trick: 25 minutes of focus, then a 5 minute break with a snack or a song. 🧸', tasks: [
        at(0, '', 'Tiny task: 5 minutes on homework', 'study'),
        at(0, '', 'Break: favourite song + stretch', 'selfcare')
      ] };
    }
    // default: a balanced study week
    return { text: 'Here’s a balanced week: a bit of study each day, time for hobbies, and a rest day. Change anything you like!', tasks: [
      at(0, '17:00', 'Homework: 30 minutes', 'study'),
      at(1, '17:00', 'Study: review today’s class notes', 'study'),
      at(1, '19:00', 'Hobby time', 'hobby'),
      at(2, '17:00', 'Homework: 30 minutes', 'study'),
      at(3, '17:00', 'Study: practice questions', 'study'),
      at(3, '19:00', 'Hobby time', 'hobby'),
      at(4, '17:30', 'Plan the weekend', 'routine'),
      at(5, '11:00', 'Self-care: something fun', 'selfcare')
    ] };
  }
  async function askAI(q) {
    if (!AI_URL) return offlineReply(q);
    const history = state.chat.slice(-10).map((m) => ({ role: m.role === 'me' ? 'user' : 'model', text: m.text }));
    const res = await fetch(AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, today: today(), buddy: state.profile.buddyName, name: state.profile.name })
    });
    if (res.status === 501) return offlineReply(q); // the helper is online but has no AI key
    if (!res.ok) throw new Error('AI error ' + res.status);
    const data = await res.json();
    const tasks = (data.tasks || []).filter((t) => t && t.title && /^\d{4}-\d{2}-\d{2}$/.test(t.date)).slice(0, 12)
      .map((t) => ({ title: String(t.title).slice(0, 80), date: t.date, time: /^\d{2}:\d{2}$/.test(t.time || '') ? t.time : '', cat: CATS.some((c) => c.id === t.cat) ? t.cat : 'study' }));
    return { text: String(data.reply || '').slice(0, 2000), tasks: tasks };
  }
  async function sendChat(q) {
    q = q.trim();
    if (!q || ui.aiBusy) return;
    state.chat.push({ role: 'me', text: q });
    ui.aiBusy = true;
    render();
    let r;
    try { r = await askAI(q); } catch (e) { r = Object.assign(offlineReply(q), { text: 'I couldn’t reach my AI brain right now, so here’s my own idea:\n' + offlineReply(q).text }); }
    ui.aiBusy = false;
    state.chat.push({ role: 'bot', text: r.text, tasks: r.tasks });
    state.chat = state.chat.slice(-30);
    save();
    play('pop');
    render();
  }

  // ---------- reminders ----------
  function checkReminders() {
    if (!state.profile) return;
    const now = new Date();
    const date = ymd(now);
    tasksFor(date).forEach((t) => {
      if (!t.remind || !t.time || isDone(t, date)) return;
      const p = t.time.split(':');
      const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +p[0], +p[1]);
      const mins = (due - now) / 60000;
      const key = t.id + '@' + date;
      if (mins <= 15 && mins > -5 && !state.notified[key]) {
        state.notified[key] = true;
        save();
        const msg = state.profile.buddyName + ': "' + t.title + '" at ' + prettyTime(t.time) + '. You can do it!';
        toast(msg);
        play('chime');
        try {
          if ('Notification' in window && Notification.permission === 'granted') new Notification('Bear Buddy', { body: msg, icon: 'icon-192.png' });
        } catch (e) { /* some browsers only allow notifications from a service worker */ }
      }
    });
  }

  // ---------- confetti ----------
  function confetti() {
    const cv = document.getElementById('confetti');
    if (!cv || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = cv.getContext('2d');
    cv.width = innerWidth; cv.height = innerHeight;
    const colors = ['#F1648E', '#FBE28A', '#8CC46B', '#7A63C9', '#5EB9EE', '#F6BF78'];
    const bits = Array.from({ length: 90 }, () => ({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.4, r: 4 + Math.random() * 5, vy: 2 + Math.random() * 3, vx: -1.5 + Math.random() * 3, a: Math.random() * 6, c: colors[Math.floor(Math.random() * colors.length)] }));
    let frames = 0;
    (function tick() {
      c.clearRect(0, 0, cv.width, cv.height);
      bits.forEach((b) => { b.y += b.vy; b.x += b.vx; b.a += 0.1; c.fillStyle = b.c; c.save(); c.translate(b.x, b.y); c.rotate(b.a); c.fillRect(-b.r, -b.r / 2, b.r * 2, b.r); c.restore(); });
      if (++frames < 160) requestAnimationFrame(tick); else c.clearRect(0, 0, cv.width, cv.height);
    })();
  }

  // ---------- focus timer (pomodoro) ----------
  const MODES = {
    focus: { label: 'Focus', min: 25, mood: 'neutral', line: 'Let’s focus together. You’ve got this!' },
    short: { label: 'Break', min: 5, mood: 'happy', line: 'Break time! Stretch, sip some water.' },
    long: { label: 'Long break', min: 15, mood: 'dancing', line: 'Long break, you earned it!' }
  };
  const timer = { mode: 'focus', left: 25 * 60000, endAt: 0, running: false, taskId: null, round: 0, tick: null, lock: null };
  const RING = 2 * Math.PI * 128;

  const FOCUS_SOUNDS = [['off', 'Quiet'], ['rain', 'Rain'], ['lofi', 'Lo-fi'], ['youtube', 'YouTube lo-fi']];
  function focusSound() { return state.settings.focusSound || 'off'; }
  // plays the chosen focus sound; the YouTube player lives outside #app so re-renders don't restart it
  function applyFocusSound(on) {
    const s = on ? focusSound() : 'off';
    if (s === 'rain') window.Sounds.rain.start(); else window.Sounds.rain.stop();
    if (s === 'lofi') music.start(); else if (!state.settings.music) music.stop();
    const yt = document.getElementById('yt-root');
    const id = (window.BUDDY_CONFIG && window.BUDDY_CONFIG.youtubeId) || 'jfKfPfyJRdk';
    if (s === 'youtube') {
      if (!yt.innerHTML) {
        yt.innerHTML = '<iframe title="Lo-fi music from YouTube" src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&playsinline=1" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin"></iframe>' +
          '<a href="https://www.youtube.com/watch?v=' + encodeURIComponent(id) + '" target="_blank" rel="noopener">Open on YouTube</a>';
      }
      yt.hidden = false;
    } else {
      yt.innerHTML = '';
      yt.hidden = true;
    }
  }
  function focusCount(date) { return (state.focus && state.focus[date]) || 0; }
  function fmtLeft(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function timerLeft() { return timer.running ? timer.endAt - Date.now() : timer.left; }

  function viewFocus() {
    const m = MODES[timer.mode];
    const task = state.tasks.find((t) => t.id === timer.taskId);
    const done = focusCount(today());
    let dots = '';
    const filled = timer.round % 4 === 0 && timer.round > 0 && timer.mode === 'long' ? 4 : timer.round % 4;
    for (let i = 0; i < 4; i++) dots += '<span class="dot' + (i < filled ? ' on' : '') + '"></span>';
    const tabs = Object.keys(MODES).map((k) => '<button class="mode' + (k === timer.mode ? ' sel' : '') + '" data-action="focus-mode" data-mode="' + k + '" aria-pressed="' + (k === timer.mode) + '">' + MODES[k].label + '</button>').join('');
    const todayTasks = tasksFor(today()).filter((t) => !isDone(t, today()));
    const pick = '<label class="focus-task"><span class="sr">Focusing on</span><select id="focus-task" data-change="focus-task">' +
      '<option value="">Just focusing</option>' + todayTasks.concat(task && !todayTasks.includes(task) ? [task] : []).map((t) => '<option value="' + t.id + '"' + (t.id === timer.taskId ? ' selected' : '') + '>' + esc(t.title) + '</option>').join('') + '</select></label>';
    return '<main class="focus-screen mode-' + timer.mode + '">' +
      '<div class="focus-top"><button class="icon-btn soft" data-action="focus-close" aria-label="Close timer">' + ICON.close + '</button>' +
      '<div class="modes" role="group" aria-label="Timer mode">' + tabs + '</div>' +
      '<button class="icon-btn soft" data-action="fullscreen" aria-label="Full screen">' + ICON.expand + '</button></div>' +
      '<div class="ring-wrap"><svg class="ring" viewBox="0 0 280 280" aria-hidden="true"><circle cx="140" cy="140" r="128" class="ring-bg"/>' +
      '<circle cx="140" cy="140" r="128" class="ring-fg" id="ring-fg" stroke-dasharray="' + RING.toFixed(1) + '" stroke-dashoffset="0" transform="rotate(-90 140 140)"/></svg>' +
      '<div class="ring-buddy" id="ring-buddy">' + buddy(timer.running ? m.mood : 'neutral', 130) + '</div></div>' +
      '<p class="focus-time" id="focus-time" role="timer" aria-live="off">' + fmtLeft(timerLeft()) + '</p>' +
      '<p class="focus-line">' + m.line + '</p>' +
      (timer.askDone && task && !isDone(task, today()) ? '<button class="ghost small" data-action="toggle" data-id="' + task.id + '" data-date="' + today() + '">' + ICON.check + ' Finished \u201c' + esc(task.title) + '\u201d? Tick it off</button>' : pick) +
      '<div class="focus-ctrls"><button class="icon-btn soft big-ctrl" data-action="focus-reset" aria-label="Restart timer">' + ICON.reset + '</button>' +
      '<button class="play" data-action="focus-toggle" aria-label="' + (timer.running ? 'Pause' : 'Start') + '">' + (timer.running ? ICON.pause : ICON.play) + '</button>' +
      '<button class="icon-btn soft big-ctrl" data-action="focus-skip" aria-label="Skip to next">' + ICON.skip + '</button></div>' +
      '<div class="sounds" role="group" aria-label="Focus sound">' + FOCUS_SOUNDS.map((s) => '<button class="snd' + (focusSound() === s[0] ? ' sel' : '') + '" data-action="focus-sound" data-sound="' + s[0] + '" aria-pressed="' + (focusSound() === s[0]) + '">' + s[1] + '</button>').join('') + '</div>' +
      '<div class="focus-foot"><div class="dots" aria-label="Rounds before a long break">' + dots + '</div><span>' + done + ' focus session' + (done === 1 ? '' : 's') + ' today</span></div>' +
      '</main>';
  }
  function paintTimer() {
    const left = timerLeft();
    const total = MODES[timer.mode].min * 60000;
    const el = document.getElementById('focus-time');
    if (el) el.textContent = fmtLeft(left);
    const ring = document.getElementById('ring-fg');
    if (ring) ring.setAttribute('stroke-dashoffset', (RING * (1 - Math.max(0, left) / total)).toFixed(1));
    document.title = timer.running ? fmtLeft(left) + ' · ' + MODES[timer.mode].label : 'Bear Buddy Planner';
  }
  function setMode(mode) {
    timer.mode = mode;
    timer.left = MODES[mode].min * 60000;
    timer.running = false;
    clearInterval(timer.tick);
    releaseLock();
  }
  async function keepAwake() {
    try { if ('wakeLock' in navigator) timer.lock = await navigator.wakeLock.request('screen'); } catch (e) { /* not allowed here */ }
  }
  function releaseLock() { try { if (timer.lock) timer.lock.release(); } catch (e) { /* ignore */ } timer.lock = null; }
  function startTimer() {
    timer.endAt = Date.now() + timer.left;
    timer.running = true;
    clearInterval(timer.tick);
    timer.tick = setInterval(() => { if (timerLeft() <= 0) finishTimer(); else paintTimer(); }, 250);
    keepAwake();
  }
  function pauseTimer() {
    timer.left = Math.max(0, timer.endAt - Date.now());
    timer.running = false;
    clearInterval(timer.tick);
    releaseLock();
  }
  function finishTimer() {
    const wasFocus = timer.mode === 'focus';
    clearInterval(timer.tick);
    timer.running = false;
    releaseLock();
    let msg;
    if (wasFocus) {
      state.focus = state.focus || {};
      state.focus[today()] = focusCount(today()) + 1;
      timer.round++;
      timer.askDone = !!timer.taskId;
      save();
      play('celebrate');
      confetti();
      msg = 'Focus done! Time for a ' + (timer.round % 4 === 0 ? 'long' : 'short') + ' break.';
      setMode(timer.round % 4 === 0 ? 'long' : 'short');
    } else {
      play('chime');
      msg = 'Break over! Ready for another focus round?';
      setMode('focus');
    }
    toast(msg);
    try { if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('Bear Buddy', { body: msg, icon: 'icon-192.png' }); } catch (e) { /* ignore */ }
    if (ui.view === 'focus') render();
  }

  // ---------- tutorial: the chosen buddy shows you around ----------
  // On iPhone/iPad, reminders and full screen only work once the app is added to the Home Screen.
  function installCard() {
    return '<section class="card install"><h2>Put me on your Home Screen</h2>' +
      '<ol><li>Tap the <b>Share</b> button ' + ICON.share + ' in Safari.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Open me from the new icon. Then reminders and full screen work!</li></ol></section>';
  }

  function tourSteps() {
    const b = esc(state.profile.buddyName);
    const n = esc(state.profile.name || 'friend');
    return [
      { view: 'today', mood: 'dancing', text: 'Hi ' + n + '! I’m ' + b + ', your planning buddy. Let me show you around!' },
      { view: 'today', target: '.hero', mood: 'happy', text: 'This is me! I get happy when you finish tasks and dance when the whole day is done. If nothing gets done by evening, I get a little sad…' },
      { view: 'today', target: '.nav-add', mood: 'neutral', text: 'Tap the + to add a task. Pick a type, a day and a time, and I’ll remind you 15 minutes before.' },
      { view: 'today', target: '.progress', mood: 'happy', text: 'Tap the circle next to a task to tick it off. This bar fills up and your streak grows every day you finish something.' },
      { view: 'week', target: '.days', mood: 'neutral', text: 'This is your week. Tap any day to see it or add plans. A star means that day is all done!' },
      { view: 'closet', target: '.outfits', mood: 'dancing', text: 'Keep your streak going to unlock outfits for me: a party dress, then dino suits!' },
      { view: 'chat', target: '.chips', mood: 'happy', text: 'Stuck? Ask me to plan a study week or get ready for a test, and add my plan with one tap.' },
      { view: 'today', target: '[data-action=focus]', mood: 'neutral', text: 'Need to study? Open the focus timer: 25 minutes of focus, then a break. You can add rain or lo-fi sounds too.' },
      { view: 'today', target: '[data-action=music]', mood: 'happy', text: 'Turn cosy music and click sounds on or off up here.' },
      NEEDS_INSTALL ? { view: 'closet', target: '.install', mood: 'happy', text: 'On iPhone or iPad, add me to your Home Screen with Safari’s Share button. Then I can send reminders and go full screen!' } : null,
      { view: 'today', mood: 'dancing', text: 'That’s everything! Let’s plan something nice today. I’m cheering for you!' }
    ].filter(Boolean);
  }
  function startTour() { ui.tour = 0; ui.tourShown = -1; render(); }
  function endTour() {
    ui.tour = null;
    state.tutorialDone = true;
    save();
    document.getElementById('tour-root').innerHTML = '';
    ui.view = 'today';
    render();
  }
  function renderTour() {
    const root = document.getElementById('tour-root');
    if (ui.tour == null || !state.profile) { root.innerHTML = ''; return; }
    const steps = tourSteps();
    const st = steps[ui.tour];
    const el = st.target && document.querySelector(st.target);
    let spot = '';
    let cardPos = 'mid';
    if (el) {
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      const pad = 8;
      spot = '<div class="tour-spot" style="left:' + (r.left - pad) + 'px;top:' + (r.top - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px"></div>';
      cardPos = r.top + r.height / 2 > innerHeight / 2 ? 'top' : 'bottom';
    }
    const fresh = ui.tourShown !== ui.tour;
    ui.tourShown = ui.tour;
    let dots = '';
    steps.forEach((x, i) => { dots += '<span class="' + (i === ui.tour ? 'on' : '') + '"></span>'; });
    const last = ui.tour === steps.length - 1;
    root.innerHTML = '<div class="tour' + (el ? '' : ' dim') + '" role="dialog" aria-modal="true" aria-label="App tour">' + spot +
      '<div class="tour-card ' + cardPos + (fresh ? ' pop' : '') + '">' +
      '<div class="tour-buddy">' + buddy(st.mood, 92) + '</div>' +
      '<div class="tour-body"><p>' + st.text + '</p>' +
      '<div class="tour-nav"><div class="tour-dots" aria-label="Step ' + (ui.tour + 1) + ' of ' + steps.length + '">' + dots + '</div>' +
      (ui.tour > 0 ? '<button class="ghost small" data-action="tour-back">Back</button>' : '<button class="ghost small" data-action="tour-skip">Skip</button>') +
      '<button class="primary small" data-action="tour-next">' + (last ? 'Let’s go!' : 'Next') + '</button></div></div></div></div>';
    if (fresh && state.settings.sound) sfx.pop();
  }
  function goTourStep(i) {
    ui.tour = i;
    const st = tourSteps()[i];
    if (ui.view !== st.view) { ui.view = st.view; }
    render();
    window.scrollTo(0, 0);
    renderTour();
  }

  // ---------- render + events ----------
  function render() {
    const app = document.getElementById('app');
    const views = { onboard: viewOnboard, today: viewToday, week: viewWeek, closet: viewCloset, chat: viewChat, focus: viewFocus };
    if (!state.profile) ui.view = 'onboard';
    app.innerHTML = views[ui.view]();
    app.dataset.view = ui.view;
    const msgs = document.getElementById('msgs');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    if (ui.view === 'focus') paintTimer();
    renderTour();
  }

  const actions = {
    go(el) { ui.view = el.dataset.view; play('tap'); render(); window.scrollTo(0, 0); },
    add(el) { play('pop'); openSheet(null, el.dataset.date); },
    edit(el) { play('tap'); const t = state.tasks.find((x) => x.id === el.dataset.id); if (t) openSheet(t); },
    toggle(el) {
      const t = state.tasks.find((x) => x.id === el.dataset.id);
      if (!t) return;
      const date = el.dataset.date;
      timer.askDone = false;
      t.done = t.done || {};
      if (t.done[date]) { delete t.done[date]; play('uncheck'); } else { t.done[date] = true; play('check'); }
      const st = dayStats(date);
      refreshBest();
      save();
      render();
      if (t.done[date] && st.total && st.done === st.total) { play('celebrate'); confetti(); }
    },
    'pick-kind'(el) { ui.onboard.kind = el.dataset.kind; play('pop'); render(); },
    'pick-color'(el) { ui.onboard.colors[ui.onboard.kind] = el.dataset.color; play('tap'); render(); },
    'pick-day'(el) { ui.weekDay = el.dataset.date; play('tap'); render(); },
    wear(el) {
      const c = COSTUMES.find((x) => x.id === el.dataset.costume);
      if (state.bestStreak < c.days) { play('uncheck'); toast('Reach a ' + c.days + '-day streak to unlock the ' + c.name.toLowerCase() + '!'); return; }
      state.profile.costume = c.id; save(); play('pop'); render();
    },
    recolor(el) { state.profile.color = el.dataset.color; save(); play('tap'); render(); },
    rebuddy() { ui.onboard = { kind: state.profile.kind, colors: {} }; ui.view = 'onboard'; ui.rebuddy = true; play('tap'); app().innerHTML = viewOnboard(); },
    music() {
      state.settings.music = !state.settings.music; save();
      if (state.settings.music) music.start(); else music.stop();
      render();
    },
    sound() { state.settings.sound = !state.settings.sound; save(); play('tap'); render(); },
    notify() {
      if (NEEDS_INSTALL) { toast('First add me to your Home Screen (Share, then Add to Home Screen), then open me from there and tap this again.'); return; }
      if (!('Notification' in window)) { toast('This browser can’t show notifications, but I’ll still remind you in the app.'); return; }
      Notification.requestPermission().then((p) => toast(p === 'granted' ? 'Reminders are on!' : 'Okay! I’ll remind you inside the app instead.'));
    },
    'close-sheet'() { closeSheet(); },
    account(el) { play('tap'); openAccount(el.dataset.mode); },
    'close-account'() { closeAccount(); },
    'sync-now'() { play('tap'); setSyncStatus('Syncing…'); if (state.dirty) push(); else pull(); },
    'sign-out'() {
      api('/logout', 'POST').catch(() => {});
      account = null; saveAccount(); play('uncheck'); render();
      toast('Signed out. Your plan stays on this device.');
    },
    'tour-next'() { const n = tourSteps().length; if (ui.tour >= n - 1) { endTour(); play('celebrate'); confetti(); } else goTourStep(ui.tour + 1); },
    'tour-back'() { if (ui.tour > 0) goTourStep(ui.tour - 1); },
    'tour-skip'() { endTour(); },
    tour() { play('pop'); ui.view = 'today'; render(); goTourStep(0); },
    focus(el) {
      if (el.dataset.id) { timer.taskId = el.dataset.id; closeSheet(); }
      ui.back = ui.view === 'focus' ? 'today' : ui.view;
      ui.view = 'focus';
      play('pop');
      render();
      applyFocusSound(true);
    },
    'focus-close'() {
      applyFocusSound(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      ui.view = ui.back || 'today';
      play('tap');
      render();
    },
    'focus-mode'(el) { setMode(el.dataset.mode); play('tap'); render(); },
    'focus-toggle'() {
      timer.askDone = false;
      if (timer.running) { pauseTimer(); play('tap'); } else { startTimer(); play('pop'); }
      render();
    },
    'focus-reset'() { setMode(timer.mode); play('uncheck'); render(); },
    'focus-skip'() { if (timer.running) pauseTimer(); timer.left = 0; play('tap'); finishTimer(); },
    'focus-sound'(el) { state.settings.focusSound = el.dataset.sound; save(); play('tap'); applyFocusSound(true); render(); },
    fullscreen() {
      const d = document.documentElement;
      if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
      const req = d.requestFullscreen || d.webkitRequestFullscreen;
      if (req) Promise.resolve(req.call(d)).catch(() => toast('Full screen isn’t available here. Add the app to your home screen for full screen.'));
      else toast('On iPhone, add the app to your home screen to use it full screen.');
    },
    'draft-cat'(el) { syncDraftFromForm(); ui.draft.cat = el.dataset.cat; play('tap'); renderSheet(); },
    'draft-flag'(el) { syncDraftFromForm(); ui.draft[el.dataset.key] = !ui.draft[el.dataset.key]; play('tap'); renderSheet(); },
    delete() {
      state.tasks = state.tasks.filter((x) => x.id !== ui.draft.id);
      save(); closeSheet(); play('uncheck'); render(); toast('Task deleted');
    },
    'ask-chip'(el) { play('tap'); sendChat(el.textContent); },
    'add-suggested'(el) {
      const m = state.chat[+el.dataset.i];
      if (!m || m.added) return;
      m.tasks.forEach((t) => state.tasks.push({ id: uid(), title: t.title, cat: t.cat, date: t.date, time: t.time, remind: !!t.time, repeat: false, done: {} }));
      m.added = true;
      save(); play('celebrate'); render(); toast(m.tasks.length + ' tasks added to your plan!');
    }
  };
  function app() { return document.getElementById('app'); }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = actions[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el); }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target;
    e.preventDefault();
    if (f.dataset.form === 'account') { submitAccount(f); return; }
    if (f.dataset.form === 'onboard') {
      const k = kindInfo(ui.onboard.kind);
      const prev = state.profile || {};
      state.profile = {
        name: f.name.value.trim() || prev.name || '',
        buddyName: f.buddyName.value.trim() || (ui.rebuddy && prev.kind === k.kind ? prev.buddyName : k.name),
        kind: k.kind,
        color: ui.onboard.colors[k.kind] || k.colors[0][0],
        costume: prev.costume || 'bow'
      };
      ui.rebuddy = false;
      ui.view = 'today';
      save(); play('celebrate'); render();
      if (!state.tutorialDone) setTimeout(() => goTourStep(0), 600);
    } else if (f.dataset.form === 'task') {
      syncDraftFromForm();
      const d = ui.draft;
      d.title = d.title.trim();
      if (!d.title) { f.title.focus(); return; }
      if (d.id) {
        const i = state.tasks.findIndex((x) => x.id === d.id);
        if (i >= 0) state.tasks[i] = d;
      } else {
        d.id = uid();
        state.tasks.push(d);
      }
      save(); closeSheet(); play('check'); render();
      toast(d.remind && d.time ? 'Added! I’ll remind you 15 minutes before.' : 'Added to your plan!');
    } else if (f.dataset.form === 'chat') {
      const q = f.q.value;
      f.q.value = '';
      sendChat(q);
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (ui.draft) closeSheet(); if (ui.account) closeAccount(); });
  window.addEventListener('resize', () => { if (ui.tour != null) renderTour(); });
  document.addEventListener('change', (e) => {
    if (e.target.dataset.change === 'focus-task') timer.taskId = e.target.value || null;
  });

  // music can only start after a tap, so resume it on the first interaction if it was left on
  if (state.settings.music) {
    const resume = () => { if (state.settings.music) music.start(); document.removeEventListener('pointerdown', resume); };
    document.addEventListener('pointerdown', resume);
  }

  render();
  checkReminders();
  setInterval(checkReminders, 30000);
  // redraw at midnight / when coming back to the tab so moods and dates stay right
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !ui.draft && !ui.account) { render(); pull(); } });
  // keep devices in step: check for changes now and then, and send unsaved ones
  pull();
  setInterval(() => { if (!document.hidden) pull(); }, 60000);
  window.addEventListener('online', () => { if (state.dirty) push(); else pull(); });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // expose for tests
  window.__buddyApp = { state: state, render: render, ui: ui, pull: pull };
})();
