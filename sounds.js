// Soft, cosy sound effects and an optional lo-fi music loop, all made live with Web Audio (no audio files).
(function () {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let musicTimer = null;
  let nextBar = 0;
  let bar = 0;

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

  // Lo-fi loop: warm pad chords plus a music-box melody, about 72 bpm.
  const CHORDS = [
    [174.6, 220.0, 261.6, 329.6], // Fmaj7
    [164.8, 196.0, 246.9, 293.7], // Em7
    [146.8, 174.6, 220.0, 261.6], // Dm7
    [130.8, 164.8, 196.0, 246.9]  // Cmaj7
  ];
  const MELODY = [
    [659, 0, 523, 0, 587, 0, 0, 0],
    [587, 0, 494, 0, 523, 0, 392, 0],
    [523, 0, 440, 0, 0, 0, 587, 0],
    [494, 0, 392, 0, 440, 0, 0, 0]
  ];
  const BAR = 8 * 0.42; // eight soft steps per bar

  function scheduleBar(t) {
    const chord = CHORDS[bar % 4];
    chord.forEach((f) => note(f, t, BAR * 0.98, { type: 'triangle', vol: 0.035, attack: 0.6, dest: musicGain }));
    note(chord[0] / 2, t, BAR * 0.9, { type: 'sine', vol: 0.06, attack: 0.05, dest: musicGain });
    MELODY[bar % 4].forEach((f, i) => {
      if (f) note(f * 2, t + i * 0.42, 0.7, { type: 'sine', vol: 0.03, dest: musicGain });
    });
    bar++;
  }

  function musicLoop() {
    while (nextBar < ctx.currentTime + 1.5) {
      scheduleBar(nextBar);
      nextBar += BAR;
    }
  }

  const music = {
    playing: false,
    start() {
      playbackSession();
      const c = audio(); if (!c || this.playing) return;
      musicGain = c.createGain();
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      musicGain.connect(lp);
      lp.connect(master);
      musicGain.gain.setValueAtTime(0.0001, c.currentTime);
      musicGain.gain.exponentialRampToValueAtTime(1, c.currentTime + 2);
      nextBar = c.currentTime + 0.1;
      bar = 0;
      musicLoop();
      musicTimer = setInterval(musicLoop, 400);
      this.playing = true;
    },
    stop() {
      if (!this.playing) return;
      clearInterval(musicTimer);
      const g = musicGain;
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
      setTimeout(() => g.disconnect(), 1000);
      this.playing = false;
    }
  };

  // Rain: looping filtered noise for the steady patter, plus soft random drips.
  const rain = {
    playing: false,
    nodes: null,
    start() {
      playbackSession();
      const c = audio(); if (!c || this.playing) return;
      const len = c.sampleRate * 3;
      const buf = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let last = 0;
        for (let i = 0; i < len; i++) { last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04; d[i] = last * 3.2; } // brown-ish noise
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.9, c.currentTime + 2);
      src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master);
      src.start();
      const drips = setInterval(() => {
        if (Math.random() < 0.6) note(1800 + Math.random() * 1600, c.currentTime + Math.random() * 0.3, 0.05, { slideTo: 600, vol: 0.02, dest: g });
      }, 180);
      this.nodes = { src: src, g: g, drips: drips };
      this.playing = true;
    },
    stop() {
      if (!this.playing) return;
      const n = this.nodes;
      clearInterval(n.drips);
      n.g.gain.setValueAtTime(n.g.gain.value, ctx.currentTime);
      n.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
      setTimeout(() => { try { n.src.stop(); } catch (e) { /* already stopped */ } n.g.disconnect(); }, 1000);
      this.playing = false;
    }
  };

  // Coming back to the app after locking the phone: wake the audio up again.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); });

  window.Sounds = { sfx: sfx, music: music, rain: rain };
})();
