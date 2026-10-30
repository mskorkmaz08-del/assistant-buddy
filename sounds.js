// Soft, cosy sound effects, an optional lo-fi music loop and rain, all made live with Web Audio (no audio files).
(function () {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let musicTimer = null;

  // On iPhone the ring/silent switch mutes web audio unless the page asks for media playback.
  function playbackSession() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
  }

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state !== 'running') ctx.resume(); // iOS also uses an 'interrupted' state after calls or app switches
    return ctx;
  }

  // One soft note: sine/triangle with a quick attack and gentle fade.
  function note(freq, start, dur, opts) {
    const o = opts || {};
    const c = ctx;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, start);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, start + dur);
    const peak = o.vol || 0.2;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(o.dest || master);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  const sfx = {
    tap() { const c = audio(); if (!c) return; note(520, c.currentTime, 0.09, { slideTo: 300, vol: 0.12 }); },
    pop() { const c = audio(); if (!c) return; note(380, c.currentTime, 0.12, { slideTo: 760, vol: 0.14, type: 'triangle' }); },
    check() {
      const c = audio(); if (!c) return;
      const t = c.currentTime;
      note(784, t, 0.18, { vol: 0.14, type: 'triangle' });
      note(1175, t + 0.08, 0.3, { vol: 0.12, type: 'triangle' });
    },
    uncheck() { const c = audio(); if (!c) return; note(440, c.currentTime, 0.14, { slideTo: 330, vol: 0.1 }); },
    celebrate() {
      const c = audio(); if (!c) return;
      const t = c.currentTime;
      [523, 659, 784, 1047, 1319].forEach((f, i) => note(f, t + i * 0.09, 0.45, { vol: 0.12, type: 'triangle' }));
    },
    chime() {
      const c = audio(); if (!c) return;
      const t = c.currentTime;
      note(988, t, 0.6, { vol: 0.12 });
      note(1319, t + 0.15, 0.8, { vol: 0.1 });
    }
  };

  // Lo-fi hip hop loop: dusty electric-piano jazz chords, a soft swung boom-bap beat,
  // round bass, an occasional lazy melody note and a gentle tape wobble.
  const BPM = 74;
  const STEP = 60 / BPM / 4; // one 16th note
  const SWING = 0.18;        // late off-beat 16ths for that lazy feel
  // ii-V-I-vi in C: Dm9, G13, Cmaj9, Am9. Each chord: bass root + piano voicing (Hz).
  const PROG = [
    { bass: 73.42, keys: [174.61, 261.63, 329.63, 440.00] }, // Dm9:  F C E A
    { bass: 98.00, keys: [174.61, 246.94, 329.63, 440.00] }, // G13:  F B E A
    { bass: 65.41, keys: [164.81, 246.94, 293.66, 392.00] }, // Cmaj9: E B D G
    { bass: 55.00, keys: [196.00, 261.63, 329.63, 493.88] }  // Am9:  G C E B
  ];
  const SCALE = [392.00, 440.00, 523.25, 587.33, 659.25]; // C pentatonic, mid register
  // 16-step patterns (1 = hit). Kick and snare: classic laid-back boom-bap.
  const KICK = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0];
  const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
  const HAT = [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0];

  let noiseBuf = null;
  let wobble = null;
  let drumBus = null;
  let step = 0;
  let nextStep = 0;

  function noise() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // Electric-piano note: warm fundamental, soft octave and a quick bell "tine", all wobbling a little.
  function keys(freq, t, dur, vol) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(musicGain);
    [[1, 'sine', 1], [2, 'sine', 0.18], [7.1, 'sine', 0.05]].forEach((p, i) => {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = p[1];
      o.frequency.value = freq * p[0];
      o.detune.value = (Math.random() - 0.5) * 8;
      wobble.connect(o.detune);
      og.gain.setValueAtTime(p[2], t);
      if (i === 2) og.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + dur + 0.05);
    });
  }
  function bass(freq, t, dur) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function kick(t, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g); g.connect(drumBus);
    o.start(t); o.stop(t + 0.45);
  }
  function hiss(t, dur, vol, type, freq, q) {
    const s = ctx.createBufferSource();
    s.buffer = noise();
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(drumBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  function snare(t) {
    hiss(t, 0.22, 0.22, 'bandpass', 1900, 0.8);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.1);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g); g.connect(drumBus);
    o.start(t); o.stop(t + 0.16);
  }

  function scheduleStep(i, t) {
    const s = i % 16;
    const bar = Math.floor(i / 16);
    const chord = PROG[bar % 4];
    const human = () => (Math.random() - 0.5) * 0.012;
    if (KICK[s]) kick(t + human(), s === 0 ? 0.55 : 0.42);
    if (SNARE[s]) snare(t + 0.01 + human());
    if (HAT[s]) hiss(t + human(), s % 4 === 2 ? 0.05 : 0.035, (s % 2 ? 0.035 : 0.06) * (0.7 + Math.random() * 0.3), 'highpass', 7000);
    if (s === 0) {
      // lazy strum, a touch behind the beat
      chord.keys.forEach((f, k) => keys(f, t + 0.02 + k * 0.022, STEP * 15, 0.055));
      bass(chord.bass, t, STEP * 6);
    }
    if (s === 10) bass(chord.bass * (bar % 2 ? 1.5 : 1), t, STEP * 5);
    if (s === 11 && bar % 2) chord.keys.slice(1).forEach((f, k) => keys(f, t + k * 0.018, STEP * 5, 0.03));
    // a few soft melody notes every other bar
    if (bar % 2 === 1 && (s === 2 || s === 6 || s === 13) && Math.random() < 0.6) {
      keys(SCALE[Math.floor(Math.random() * SCALE.length)], t + human(), STEP * 6, 0.03);
    }
  }

  function musicLoop() {
    while (nextStep < ctx.currentTime + 0.4) {
      const late = step % 2 ? SWING * STEP : 0;
      scheduleStep(step, nextStep + late);
      nextStep += STEP;
      step++;
    }
  }

  const music = {
    playing: false,
    start() {
      playbackSession();
      const c = audio(); if (!c || this.playing) return;
      musicGain = c.createGain();
      // warm, slightly muffled, gently saturated: the "dusty tape" sound
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.5;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 35;
      const sat = c.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(1.6 * x) / Math.tanh(1.6); }
      sat.curve = curve;
      musicGain.connect(sat); sat.connect(lp); lp.connect(hp); hp.connect(master);
      drumBus = c.createGain(); drumBus.gain.value = 0.8; drumBus.connect(musicGain);
      // tape wobble: slow pitch drift on the piano
      const lfo = c.createOscillator(); lfo.frequency.value = 0.45;
      wobble = c.createGain(); wobble.gain.value = 9; // cents
      lfo.connect(wobble); lfo.start();
      this.lfo = lfo;
      musicGain.gain.setValueAtTime(0.0001, c.currentTime);
      musicGain.gain.exponentialRampToValueAtTime(0.9, c.currentTime + 2);
      nextStep = c.currentTime + 0.1;
      step = 0;
      musicLoop();
      musicTimer = setInterval(musicLoop, 100);
      this.playing = true;
    },
    stop() {
      if (!this.playing) return;
      clearInterval(musicTimer);
      const g = musicGain;
      const lfo = this.lfo;
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
      setTimeout(() => { g.disconnect(); try { lfo.stop(); } catch (e) { /* already stopped */ } }, 1000);
      this.playing = false;
    }
  };

  // Rain: a soft wash of pink noise, a layer of tiny drop patter, a low body,
  // slow gusts, and now and then a gentle roll of thunder far away.
  function makeBuffer(seconds, fill) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) fill(buf.getChannelData(ch), len);
    return buf;
  }
  function pinkFill(d, len) { // Paul Kellet's pink noise filter
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  }
  function brownFill(d, len) { let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } }
  function patterFill(d, len) { // hundreds of tiny noisy drop hits per second, each a few milliseconds long
    const sr = ctx.sampleRate;
    const drops = Math.floor(len / sr * 380);
    for (let k = 0; k < drops; k++) {
      const at = Math.floor(Math.random() * len);
      const amp = Math.pow(Math.random(), 3) * 0.6;
      const dur = Math.floor(sr * (0.002 + Math.random() * 0.006));
      for (let j = 0; j < dur && at + j < len; j++) d[at + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / (dur / 4));
    }
  }
  let rainBufs = null;
  function loop(buf, chain, gain) {
    const s = ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    let node = s;
    chain.forEach((f) => { node.connect(f); node = f; });
    const g = ctx.createGain(); g.gain.value = gain;
    node.connect(g);
    s.start(0, Math.random() * buf.duration);
    return { src: s, out: g };
  }
  const filt = (type, freq, q) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q; return f; };
  function thunder(dest) {
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = rainBufs.brown;
    const lp = filt('lowpass', 140, 0.5);
    lp.frequency.setValueAtTime(220, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 7);
    const g = ctx.createGain();
    const peak = 0.35 + Math.random() * 0.35;
    g.gain.setValueAtTime(0.0001, t);
    // a slow rolling swell with a couple of bumps, then a long fade: far away, never a crack
    g.gain.exponentialRampToValueAtTime(peak * 0.5, t + 0.8);
    g.gain.exponentialRampToValueAtTime(peak, t + 1.8 + Math.random());
    g.gain.exponentialRampToValueAtTime(peak * 0.6, t + 3.2);
    g.gain.exponentialRampToValueAtTime(peak * 0.8, t + 4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 9);
    s.connect(lp); lp.connect(g); g.connect(dest);
    s.start(t, Math.random() * 2); s.stop(t + 9.5);
  }
  const rain = {
    playing: false,
    nodes: null,
    start() {
      playbackSession();
      const c = audio(); if (!c || this.playing) return;
      if (!rainBufs) rainBufs = { pink: makeBuffer(6, pinkFill), patter: makeBuffer(5, patterFill), brown: makeBuffer(10, brownFill) };
      const bus = c.createGain();
      bus.gain.setValueAtTime(0.0001, c.currentTime);
      bus.gain.exponentialRampToValueAtTime(1, c.currentTime + 2.5);
      bus.connect(master);
      const wash = loop(rainBufs.pink, [filt('highpass', 250), filt('lowpass', 5500)], 0.9);
      const patter = loop(rainBufs.patter, [filt('highpass', 1200), filt('lowpass', 7000)], 0.5);
      const body = loop(rainBufs.brown, [filt('lowpass', 500)], 0.35);
      // gusts: the wash gets a little heavier and lighter over ~15 seconds
      const lfo = c.createOscillator(); lfo.frequency.value = 0.065;
      const depth = c.createGain(); depth.gain.value = 0.25;
      lfo.connect(depth); depth.connect(wash.out.gain); lfo.start();
      [wash, patter, body].forEach((l) => l.out.connect(bus));
      const self = this;
      function nextThunder() { self.nodes.thunder = setTimeout(() => { if (self.playing) { thunder(bus); nextThunder(); } }, 20000 + Math.random() * 30000); }
      this.nodes = { bus: bus, srcs: [wash.src, patter.src, body.src, lfo], thunder: null };
      this.playing = true;
      nextThunder();
    },
    stop() {
      if (!this.playing) return;
      const n = this.nodes;
      clearTimeout(n.thunder);
      n.bus.gain.setValueAtTime(n.bus.gain.value, ctx.currentTime);
      n.bus.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
      setTimeout(() => { n.srcs.forEach((s) => { try { s.stop(); } catch (e) { /* already stopped */ } }); n.bus.disconnect(); }, 1000);
      this.playing = false;
    }
  };

  // Coming back to the app after locking the phone: wake the audio up again.
  // Leaving the app (home button, app switcher, closing the tab) pauses all sound; coming back resumes it.
  function pauseAll() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseAll();
    else if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  });
  window.addEventListener('pagehide', pauseAll);

  window.Sounds = { sfx: sfx, music: music, rain: rain };
})();
