'use strict';

const FilterEngine = (() => {
  let _mode     = 'normal';
  let _interval = null;
  let _canvas   = null;
  let _ctx      = null;
  let _busy     = false;
  let _slowCount = 0;

  function _init(filterCanvasEl) {
    _canvas = filterCanvasEl;
    _ctx    = filterCanvasEl.getContext('2d');
  }

  function setMode(mode) {
    _mode = mode;
    _slowCount = 0;
    if (mode === 'normal') clearOverlay();
  }

  function getMode() { return _mode; }

  function clearOverlay() {
    if (_ctx && _canvas) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  }

  function _captureFrame() {
    const video = Camera.getVideoElement();
    if (!video || video.readyState < 2) return null;
    const tmp = document.createElement('canvas');
    tmp.width = 640; tmp.height = 480;
    tmp.getContext('2d').drawImage(video, 0, 0, 640, 480);
    return tmp.toDataURL('image/jpeg', 0.65);
  }

  function _runLoop() {
    // Disabled for static hosting (GitHub Pages)
  }

  function _revertToNormal() {
    _mode = 'normal';
    clearOverlay();
    document.querySelectorAll('.filter-option').forEach(o => {
      o.classList.toggle('active', o.dataset.mode === 'normal');
    });
    const icon = document.getElementById('filter-icon');
    if (icon) icon.textContent = '🎥';
    const btn = document.getElementById('filter-dropdown-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    const menu = document.getElementById('filter-dropdown-menu');
    if (menu) menu.classList.add('hidden');
    _showSlowToast();
  }

  function _showSlowToast() {
    const t = document.createElement('div');
    t.textContent = '⚡ Filter disabled (device too slow)';
    t.style.cssText = [
      'position:fixed', 'bottom:20px', 'left:50%', 'transform:translateX(-50%)',
      'background:#c1121f', 'color:#fff', 'padding:10px 20px',
      'border-radius:10px', 'font-weight:700', 'z-index:999',
      'font-family:Nunito,sans-serif',
    ].join(';');
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  function start(filterCanvasEl) {
    _init(filterCanvasEl);
    _runLoop();
  }

  function stop() {
    if (_interval) { clearInterval(_interval); _interval = null; }
    clearOverlay();
  }

  return { start, stop, setMode, getMode, clearOverlay };
})();
