'use strict';

/**
 * FilterEngine — uses OpenCV.js (WebAssembly) to apply Sobel and Harris filters.
 * Replaces the Python backend dependencies for static hosting on GitHub Pages.
 */
const FilterEngine = (() => {
  let _mode = 'normal';
  let _rafId = null;
  let _canvas = null;
  let _ctx = null;
  let _cvReady = false;

  // Mats for reuse to avoid memory fragmentation/leaks
  let _src = null;
  let _gray = null;
  let _dst = null;
  let _harris = null;

  // Track allocated Mat dimensions so we can re-create when canvas resizes
  let _matW = 0;
  let _matH = 0;

  let _loadingCv = false;
  let _cvLoadTimer = null;  // timeout handle for CDN failure detection

  function _init(filterCanvasEl) {
    _canvas = filterCanvasEl;
    _ctx = filterCanvasEl.getContext('2d', { willReadFrequently: true });
  }

  function _getLabel() {
    return document.getElementById('filter-label');
  }

  function _loadOpenCv() {
    if (_loadingCv || _cvReady) return;
    _loadingCv = true;
    console.log('[Filter] Dynamically loading OpenCV.js (approx. 8MB)...');

    const label = _getLabel();
    if (label) label.textContent = 'Loading…';

    const script = document.createElement('script');
    // Use jsDelivr mirror — more reliable than docs.opencv.org
    script.src = 'https://cdn.jsdelivr.net/npm/opencv.js@1.2.1/opencv.js';
    script.async = true;
    script.type = 'text/javascript';

    // Bug fix #3: 15-second timeout in case CDN is unreliable
    _cvLoadTimer = setTimeout(() => {
      console.error('[Filter] OpenCV.js load timed out after 15s.');
      _loadingCv = false;
      script.remove();
      const lbl = _getLabel();
      if (lbl) lbl.textContent = 'Unavailable';
      // Revert to Normal so user isn't stuck
      setMode('normal');
    }, 15000);

    script.onload = () => {
      const checkCv = setInterval(() => {
        if (typeof cv !== 'undefined' && cv.runtimeInitialized) {
          clearInterval(checkCv);
          _onOpenCvReady();
        }
      }, 100);
    };

    script.onerror = (err) => {
      clearTimeout(_cvLoadTimer);
      _cvLoadTimer = null;
      console.error('[Filter] Failed to load OpenCV.js:', err);
      _loadingCv = false;
      const lbl = _getLabel();
      if (lbl) lbl.textContent = 'Error';
    };

    document.body.appendChild(script);
  }

  function _onOpenCvReady() {
    clearTimeout(_cvLoadTimer);
    _cvLoadTimer = null;
    console.log('[Filter] OpenCV.js ready ✓');
    _cvReady = true;
    _loadingCv = false;

    // Restore dropdown label
    const label = _getLabel();
    const activeOpt = document.querySelector('.filter-option.active span:not([data-icon])');
    if (label && activeOpt) {
      label.textContent = activeOpt.textContent;
    }

    // Allocate Mats at actual canvas dimensions (Bug fix #2)
    _allocateMats();

    // Bug fix #1: only start loop here, not prematurely in setMode
    if (_mode !== 'normal') _runLoop();
  }

  // Bug fix #2: allocate/re-allocate Mats at real canvas size
  function _allocateMats() {
    const w = _canvas ? _canvas.width  : 640;
    const h = _canvas ? _canvas.height : 480;

    if (_matW === w && _matH === h) return; // already correct size

    // Free old Mats if they exist
    if (_src)    { _src.delete();    _src    = null; }
    if (_gray)   { _gray.delete();   _gray   = null; }
    if (_dst)    { _dst.delete();    _dst    = null; }
    if (_harris) { _harris.delete(); _harris = null; }

    _src    = new cv.Mat(h, w, cv.CV_8UC4);
    _gray   = new cv.Mat();
    _dst    = new cv.Mat();
    _harris = new cv.Mat();

    _matW = w;
    _matH = h;
  }

  function setMode(mode) {
    const oldMode = _mode;
    _mode = mode;

    if (mode === 'normal') {
      stop();
      clearOverlay();

      // Bug fix #5: reset loading state + label when reverting to Normal
      if (_loadingCv) {
        _loadingCv = false;
        clearTimeout(_cvLoadTimer);
        _cvLoadTimer = null;
        const label = _getLabel();
        if (label) label.textContent = 'Filter';
      }
      return;
    }

    if (!_cvReady) {
      _loadOpenCv();
      // Bug fix #1: do NOT call _runLoop here — wait for _onOpenCvReady
      return;
    }

    // cv is ready: start loop only when actually switching away from normal
    if (oldMode === 'normal' || _rafId === null) _runLoop();
  }

  function getMode() { return _mode; }

  function clearOverlay() {
    if (_ctx && _canvas) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  }

  function _runLoop() {
    if (_rafId) cancelAnimationFrame(_rafId);

    function loop() {
      if (_mode === 'normal') {
        _rafId = null;
        return;
      }

      _rafId = requestAnimationFrame(loop);
      if (!_cvReady) return;

      const video = Camera.getVideoElement();
      if (!video || video.readyState < 2) return;

      // Bug fix #2: re-allocate Mats if canvas size changed
      _allocateMats();

      const w = _canvas.width;
      const h = _canvas.height;

      try {
        // 1. Draw video frame to filter-canvas to get pixel access
        _ctx.drawImage(video, 0, 0, w, h);

        // 2. Load pixels into OpenCV
        const imgData = _ctx.getImageData(0, 0, w, h);
        _src.data.set(imgData.data);
        cv.cvtColor(_src, _gray, cv.COLOR_RGBA2GRAY);

        if (_mode === 'sobel') {
          // Bug fix #4: guarantee Mat cleanup even on exception
          let gradX = null;
          let gradY = null;
          try {
            gradX = new cv.Mat();
            gradY = new cv.Mat();
            cv.Sobel(_gray, gradX, cv.CV_8U, 1, 0, 3);
            cv.Sobel(_gray, gradY, cv.CV_8U, 0, 1, 3);
            cv.addWeighted(gradX, 0.5, gradY, 0.5, 0, _dst);
            cv.imshow(_canvas, _dst);
          } finally {
            if (gradX) gradX.delete();
            if (gradY) gradY.delete();
          }
        }
        else if (_mode === 'harris') {
          // Harris response
          cv.cornerHarris(_gray, _harris, 2, 3, 0.04);

          // Show original frame first
          cv.imshow(_canvas, _src);

          // Threshold the harris response and draw dots manually
          const data   = _harris.data32F;
          const rows   = _harris.rows;
          const cols   = _harris.cols;

          const maxVal   = _getMax(_harris);
          const threshold = 0.01 * maxVal;

          _ctx.fillStyle = '#ff00c8';
          // Step by 4 for performance — still plenty of dots
          for (let y = 0; y < rows; y += 4) {
            const rowOffset = y * cols;
            for (let x = 0; x < cols; x += 4) {
              if (data[rowOffset + x] > threshold) {
                _ctx.beginPath();
                _ctx.arc(x, y, 2.5, 0, 6.28);
                _ctx.fill();
              }
            }
          }
        }
      } catch (err) {
        console.warn('[Filter] Loop error:', err);
      }
    }
    _rafId = requestAnimationFrame(loop);
  }

  function _getMax(mat) {
    const result = cv.minMaxLoc(mat);
    return result.maxVal;
  }

  function start(filterCanvasEl) {
    _init(filterCanvasEl);
    if (_mode !== 'normal') _runLoop();
  }

  function stop() {
    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    clearOverlay();
  }

  function isReady() { return _cvReady; }

  return { start, stop, setMode, getMode, clearOverlay, isReady };
})();
