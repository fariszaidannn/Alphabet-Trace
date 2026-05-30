'use strict';

const CanvasRenderer = (() => {
  let _canvas = null;
  let _ctx = null;
  let _letterData = null;
  let _trailPoints = [];
  const TRAIL_LEN = 30;

  function init(canvasEl) {
    _canvas = canvasEl;
    _ctx = canvasEl.getContext('2d');
  }

  function resize(w, h) {
    if (!_canvas) return;
    _canvas.width = w;
    _canvas.height = h;
  }

  function setLetter(letterData) {
    _letterData = letterData;
    _trailPoints = [];
  }

  function clearTrail() {
    _trailPoints = [];
  }

  // Map normalised waypoint coords (0-1) to canvas pixels.
  // Matches the centred square layout used by _svgPathToPath2D.
  function _toCanvas(nx, ny) {
    const margin = 40;
    const scale = Math.min(
      (_canvas.width  - margin * 2) / 200,
      (_canvas.height - margin * 2) / 200
    );
    const offX = (_canvas.width  - scale * 200) / 2;
    const offY = (_canvas.height - scale * 200) / 2;
    return { cx: offX + nx * scale * 200, cy: offY + ny * scale * 200 };
  }

  function _drawLetterGuide(hitArray) {
    if (!_letterData) return;
    const { svg_path, waypoints } = _letterData;

    const filterActive = typeof FilterEngine !== 'undefined' && FilterEngine.getMode() !== 'normal';

    // --- Draw SVG letter path as a scaled stroked path ---
    const margin = 40;
    const scale = Math.min(
      (_canvas.width - margin * 2) / 200,
      (_canvas.height - margin * 2) / 200
    );
    const offX = (_canvas.width  - scale * 200) / 2;
    const offY = (_canvas.height - scale * 200) / 2;

    _ctx.save();
    _ctx.strokeStyle = filterActive
      ? 'rgba(100, 180, 255, 0.75)'
      : 'rgba(100, 180, 255, 0.35)';
    _ctx.lineWidth = 28 * scale;
    _ctx.lineCap = 'round';
    _ctx.lineJoin = 'round';
    _ctx.setLineDash([18 * scale, 10 * scale]);

    const path2d = _svgPathToPath2D(svg_path, scale, offX, offY);
    _ctx.stroke(path2d);
    _ctx.setLineDash([]);
    _ctx.restore();

    const r = 10;
    const fontSize = Math.max(8, r * 1.1);

    // --- Draw waypoint markers ---
    waypoints.forEach((wp, i) => {
      const { cx, cy } = _toCanvas(wp.x, wp.y);
      _ctx.beginPath();
      _ctx.arc(cx, cy, r, 0, Math.PI * 2);
      if (hitArray && hitArray[i]) {
        _ctx.fillStyle = '#e9c46a';
        _ctx.shadowColor = '#e9c46a';
        _ctx.shadowBlur = 16;
      } else {
        _ctx.fillStyle = filterActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.25)';
        _ctx.shadowBlur = 0;
      }
      _ctx.fill();
      _ctx.shadowBlur = 0;

      // Number label — use dark ink on white circles (filter mode or hit), white on transparent
      _ctx.fillStyle = (hitArray && hitArray[i]) || filterActive ? '#1a1a2e' : 'rgba(255,255,255,0.7)';
      _ctx.font = `bold ${fontSize}px Nunito`;
      _ctx.textAlign = 'center';
      _ctx.textBaseline = 'middle';
      _ctx.fillText(i + 1, cx, cy);
    });

    // Start arrow (green arrow at start_point)
    if (_letterData.start_point) {
      const sp = _letterData.start_point;
      const { cx, cy } = _toCanvas(sp.x, sp.y);
      _ctx.save();
      _ctx.fillStyle = '#52b788';
      _ctx.shadowColor = '#52b788';
      _ctx.shadowBlur = 14;
      _ctx.font = 'bold 22px serif';
      _ctx.textAlign = 'center';
      _ctx.textBaseline = 'middle';
      _ctx.fillText('▶', cx - 24, cy);
      _ctx.shadowBlur = 0;
      _ctx.restore();
    }
  }

  function _drawTrail() {
    if (_trailPoints.length < 2) return;
    _ctx.save();
    _ctx.lineCap = 'round';
    _ctx.lineJoin = 'round';
    for (let i = 1; i < _trailPoints.length; i++) {
      const alpha = i / _trailPoints.length;
      _ctx.strokeStyle = `rgba(255, 80, 180, ${alpha * 0.85})`;
      _ctx.lineWidth = 6 + alpha * 6;
      _ctx.beginPath();
      _ctx.moveTo(_trailPoints[i - 1].x, _trailPoints[i - 1].y);
      _ctx.lineTo(_trailPoints[i].x, _trailPoints[i].y);
      _ctx.stroke();
    }
    _ctx.restore();
  }

  function _drawFingerDot(cx, cy) {
    _ctx.save();
    _ctx.beginPath();
    _ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    _ctx.fillStyle = 'rgba(255, 80, 180, 0.75)';
    _ctx.shadowColor = '#ff50b4';
    _ctx.shadowBlur = 20;
    _ctx.fill();
    _ctx.strokeStyle = '#fff';
    _ctx.lineWidth = 2.5;
    _ctx.stroke();
    _ctx.shadowBlur = 0;
    _ctx.restore();
  }

  function draw(fingerX, fingerY, hitArray) {
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    _drawLetterGuide(hitArray);
    _drawTrail();
    if (fingerX !== null && fingerY !== null) {
      // finger coords are normalised 0-1; convert to canvas px
      const { cx, cy } = _toCanvas(fingerX, fingerY);
      _trailPoints.push({ x: cx, y: cy });
      if (_trailPoints.length > TRAIL_LEN) _trailPoints.shift();
      _drawFingerDot(cx, cy);
    }
  }

  function flashLetterComplete() {
    if (!_letterData) return;
    const { svg_path } = _letterData;
    const margin = 40;
    const scale = Math.min(
      (_canvas.width  - margin * 2) / 200,
      (_canvas.height - margin * 2) / 200
    );
    const offX2 = (_canvas.width  - scale * 200) / 2;
    const offY2 = (_canvas.height - scale * 200) / 2;

    _ctx.save();
    _ctx.strokeStyle = '#e9c46a';
    _ctx.lineWidth = 28 * scale;
    _ctx.lineCap = 'round';
    _ctx.lineJoin = 'round';
    _ctx.globalAlpha = 0.9;
    _ctx.shadowColor = '#e9c46a';
    _ctx.shadowBlur = 40;
    const path2d = _svgPathToPath2D(svg_path, scale, offX2, offY2);
    _ctx.stroke(path2d);
    _ctx.shadowBlur = 0;
    _ctx.restore();
  }

  // Minimal SVG path parser (supports M, L, C commands)
  function _svgPathToPath2D(d, scale, offX, offY) {
    const path2d = new Path2D();
    const tokens = d.replace(/([MLCQZmlcqz])/g, ' $1 ').trim().split(/[\s,]+/);
    let i = 0;
    let cmd = null;
    while (i < tokens.length) {
      const t = tokens[i];
      if (/^[MLCQZmlcqz]$/.test(t)) { cmd = t; i++; continue; }
      const n = (s) => parseFloat(tokens[i++]) * scale + (s === 'x' ? offX : offY);
      if (cmd === 'M' || cmd === 'm') {
        path2d.moveTo(n('x'), n('y'));
      } else if (cmd === 'L' || cmd === 'l') {
        path2d.lineTo(n('x'), n('y'));
      } else if (cmd === 'C' || cmd === 'c') {
        const x1 = n('x'), y1 = n('y'), x2 = n('x'), y2 = n('y'), x = n('x'), y = n('y');
        path2d.bezierCurveTo(x1, y1, x2, y2, x, y);
      } else if (cmd === 'Q' || cmd === 'q') {
        const cpx = n('x'), cpy = n('y'), x = n('x'), y = n('y');
        path2d.quadraticCurveTo(cpx, cpy, x, y);
      } else if (cmd === 'Z' || cmd === 'z') {
        path2d.closePath(); i++;
      } else {
        i++;
      }
    }
    return path2d;
  }

  return { init, resize, setLetter, clearTrail, draw, flashLetterComplete };
})();
