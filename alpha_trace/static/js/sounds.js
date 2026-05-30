'use strict';

const Sounds = (() => {
  let _ctx = null;

  function _ctx_() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  // Short bright ping when a dot/waypoint is hit
  function dot() {
    const ctx = _ctx_();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1300, ctx.currentTime + 0.06);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  }

  // Rising arpeggio chime when a letter is completed
  function letterComplete() {
    const ctx   = _ctx_();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.09;
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

      osc.start(t);
      osc.stop(t + 0.55);
    });
  }

  // Triumphant fanfare when all 26 letters are done
  function allDone() {
    const ctx     = _ctx_();
    const fanfare = [
      { freq: 523.25, t: 0.00, dur: 0.20 },
      { freq: 659.25, t: 0.14, dur: 0.20 },
      { freq: 783.99, t: 0.28, dur: 0.20 },
      { freq: 1046.5, t: 0.42, dur: 0.60 },
      { freq:  783.99, t: 0.50, dur: 0.60 },
      { freq:  523.25, t: 0.58, dur: 1.00 },
    ];
    fanfare.forEach(({ freq, t, dur }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'triangle';
      const start = ctx.currentTime + t;
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.28, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      osc.start(start);
      osc.stop(start + dur + 0.05);
    });
  }

  return { dot, letterComplete, allDone };
})();
