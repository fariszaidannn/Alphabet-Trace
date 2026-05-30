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

  let _loadingCv = false;

  function _init(filterCanvasEl) {
    _canvas = filterCanvasEl;
    _ctx = filterCanvasEl.getContext('2d', { willReadFrequently: true });
  }

  function _loadOpenCv() {
    if (_loadingCv || _cvReady) return;
    _loadingCv = true;
    console.log('[Filter] Dynamically loading OpenCV.js (approx. 8MB)...');

    const label = document.getElementById('filter-label');
    if (label) label.textContent = 'Loading...';

    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.10.0/opencv.js';
    script.async = true;
    script.type = 'text/javascript';

    script.onload = () => {
      const checkCv = setInterval(() => {
        if (typeof cv !== 'undefined' && cv.runtimeInitialized) {
          clearInterval(checkCv);
          _onOpenCvReady();
        }
      }, 100);
    };

    script.onerror = (err) => {
      console.error('[Filter] Failed to load OpenCV.js:', err);
      _loadingCv = false;
      if (label) label.textContent = 'Error';
    };

    document.body.appendChild(script);
  }

  function _onOpenCvReady() {
    console.log('[Filter] OpenCV.js ready ✓');
    _cvReady = true;
    _loadingCv = false;

    // Restore dropdown label
    const label = document.getElementById('filter-label');
    const activeOpt = document.querySelector('.filter-option.active span');
    if (label && activeOpt) {
      label.textContent = activeOpt.textContent;
    }

    _src = new cv.Mat(480, 640, cv.CV_8UC4);
    _gray = new cv.Mat();
    _dst = new cv.Mat();
    _harris = new cv.Mat();

    if (_mode !== 'normal') _runLoop();
  }

  function setMode(mode) {
    const oldMode = _mode;
    _mode = mode;

    if (mode === 'normal') {
      stop();
      clearOverlay();
    } else {
      if (!_cvReady) {
        _loadOpenCv();
      }
      if (oldMode === 'normal') _runLoop();
    }
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

      try {
        // 1. Draw video frame to filter-canvas to get pixel access
        _ctx.drawImage(video, 0, 0, _canvas.width, _canvas.height);
        
        // 2. Load pixels into OpenCV
        const imgData = _ctx.getImageData(0, 0, 640, 480);
        _src.data.set(imgData.data);
        cv.cvtColor(_src, _gray, cv.COLOR_RGBA2GRAY);

        if (_mode === 'sobel') {
          // X-derivative, Y-derivative, combine
          let gradX = new cv.Mat();
          let gradY = new cv.Mat();
          cv.Sobel(_gray, gradX, cv.CV_8U, 1, 0, 3);
          cv.Sobel(_gray, gradY, cv.CV_8U, 0, 1, 3);
          cv.addWeighted(gradX, 0.5, gradY, 0.5, 0, _dst);
          
          // Show edges on the canvas
          cv.imshow(_canvas, _dst);
          
          gradX.delete(); gradY.delete();
        } 
        else if (_mode === 'harris') {
          // Harris response
          cv.cornerHarris(_gray, _harris, 2, 3, 0.04);
          
          // Show original frame first
          cv.imshow(_canvas, _src);
          
          // Threshold the harris response and draw dots manually
          const data = _harris.data32F;
          const rows = _harris.rows;
          const cols = _harris.cols;
          
          // Optimization: Pre-calculate threshold and use a faster loop
          const maxVal = _getMax(_harris);
          const threshold = 0.01 * maxVal;

          _ctx.fillStyle = '#ff00c8';
          // Step by 4 for performance — still plenty of dots
          for (let y = 0; y < rows; y += 4) {
            const rowOffset = y * cols;
            for (let x = 0; x < cols; x += 4) {
              if (data[rowOffset + x] > threshold) {
                _ctx.beginPath();
                _ctx.arc(x, y, 2.5, 0, 6.28); // 2*PI approx
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
    let result = cv.minMaxLoc(mat);
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
