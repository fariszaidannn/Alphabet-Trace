'use strict';

const Celebrate = (() => {
  let _raf = null;
  let _particles = [];

  function _randomRange(a, b) { return a + Math.random() * (b - a); }

  function _spawnParticles(canvas) {
    const count = 60;
    _particles = [];
    for (let i = 0; i < count; i++) {
      _particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: _randomRange(-8, 8),
        vy: _randomRange(-14, -2),
        radius: _randomRange(4, 10),
        color: ['#e9c46a', '#f4a261', '#e76f51', '#2a9d8f', '#52b788', '#a8dadc', '#ff6b9d'][Math.floor(Math.random() * 7)],
        alpha: 1,
        gravity: _randomRange(0.3, 0.6),
        spin: _randomRange(-0.15, 0.15),
        angle: _randomRange(0, Math.PI * 2),
      });
    }
  }

  function _tick(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    _particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.alpha -= 0.018;
      p.angle += p.spin;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillRect(-p.radius / 2, -p.radius / 2, p.radius, p.radius);
      ctx.restore();
    });
    _particles = _particles.filter(p => p.alpha > 0);
    if (_particles.length > 0) {
      _raf = requestAnimationFrame(() => _tick(ctx, canvas));
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function fire(canvasEl) {
    if (_raf) cancelAnimationFrame(_raf);
    const ctx = canvasEl.getContext('2d');
    canvasEl.width = canvasEl.offsetWidth;
    canvasEl.height = canvasEl.offsetHeight;
    _spawnParticles(canvasEl);
    _tick(ctx, canvasEl);
  }

  function stop(canvasEl) {
    if (_raf) cancelAnimationFrame(_raf);
    _raf = null;
    _particles = [];
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  }

  return { fire, stop };
})();
