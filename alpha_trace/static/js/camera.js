'use strict';

/**
 * Camera module — uses the modern MediaPipe Tasks Vision API (HandLandmarker).
 *
 * Flow:
 *  1. getUserMedia → camera permission
 *  2. Attach stream to <video>
 *  3. Download & init HandLandmarker (WASM + model, ~10MB first load, cached after)
 *  4. rAF loop with detectForVideo()
 */
const Camera = (() => {
  let _video          = null;
  let _onResult       = null;
  let _onStateChange  = null;
  let _fps            = 16;
  let _state          = 'idle';
  let _handLandmarker = null;
  let _stream         = null;
  let _rafId          = null;
  let _lastTime       = 0;

  function _setState(s) {
    _state = s;
    if (_onStateChange) _onStateChange(s);
  }

  /* ── Update the loading overlay label ────────────── */
  function _setLoadingLabel(text) {
    const el = document.getElementById('cam-req-label');
    if (el) el.textContent = text;
  }

  /* ── cleanup ─────────────────────────────────────── */
  function _teardown() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
    if (_video) { _video.srcObject = null; }
  }

  /* ── rAF loop — synchronous detectForVideo ───────── */
  function _startLoop() {
    if (_rafId) cancelAnimationFrame(_rafId);
    const interval = 1000 / _fps;

    function tick(now) {
      _rafId = requestAnimationFrame(tick);
      if (_state !== 'active') return;
      if (now - _lastTime < interval) return;
      if (!_video || _video.readyState < 2) return;
      if (!_handLandmarker) return;

      _lastTime = now;
      try {
        const results = _handLandmarker.detectForVideo(_video, Math.round(now));
        if (!results.landmarks || results.landmarks.length === 0) {
          if (_onResult) _onResult({ detected: false });
          return;
        }
        const tip = results.landmarks[0][8]; // INDEX_FINGER_TIP
        if (_onResult) _onResult({ detected: true, x: tip.x, y: tip.y, confidence: 1.0 });
      } catch (err) {
        console.warn('[Camera] detectForVideo:', err.message);
      }
    }
    _rafId = requestAnimationFrame(tick);
  }

  /* ── Init HandLandmarker (downloads WASM + model) ── */
  async function _initHandLandmarker() {
    if (_handLandmarker) return;

    _setLoadingLabel('Loading hand-tracking model…');
    console.log('[Camera] Loading MediaPipe Tasks Vision…');

    const { FilesetResolver, HandLandmarker } = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs'
    );

    _setLoadingLabel('Initialising WASM runtime…');
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
    );

    _setLoadingLabel('Creating hand detector…');
    _handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    console.log('[Camera] HandLandmarker ready ✓');
  }

  /* ── public: start ─────────────────────────────────── */
  async function start(videoEl, onResult, fps, onStateChange) {
    _video         = videoEl;
    _onResult      = onResult;
    _onStateChange = onStateChange;
    _fps           = fps || 16;

    _teardown();
    _setState('requesting');
    _setLoadingLabel('Waiting for camera permission…');

    try {
      /* 1. Camera permission */
      _stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });

      /* 2. Attach to <video> */
      _setLoadingLabel('Camera ready. Loading AI model…');
      _video.srcObject = _stream;
      await new Promise((resolve, reject) => {
        if (_video.readyState >= 2) { resolve(); return; }
        _video.addEventListener('loadeddata', resolve, { once: true });
        _video.addEventListener('error', reject,       { once: true });
        setTimeout(resolve, 4000);
      });
      await _video.play().catch(() => {});

      /* 3. Init HandLandmarker */
      await _initHandLandmarker();

      /* 4. Done — start tracking */
      _setState('active');
      _startLoop();

    } catch (err) {
      console.error('[Camera] start failed:', err.name, err.message, err);
      _teardown();

      if (
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError' ||
        (err.message && err.message.toLowerCase().includes('permission'))
      ) {
        _setState('denied');
      } else {
        _setState('error');
      }
    }
  }

  function stop()  { _teardown(); _setState('paused'); }
  async function toggle() {
    if (_state === 'active') stop();
    else await start(_video, _onResult, _fps, _onStateChange);
  }
  async function retryPermission() { await start(_video, _onResult, _fps, _onStateChange); }
  function getState()        { return _state; }
  function getVideoElement() { return _video; }

  return { start, stop, toggle, retryPermission, getState, getVideoElement };
})();
