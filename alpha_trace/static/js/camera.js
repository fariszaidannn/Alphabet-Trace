'use strict';

/**
 * Camera module — uses the MODERN MediaPipe Tasks Vision API (HandLandmarker).
 *
 * This replaces the legacy @mediapipe/hands library which had issues with
 * async send() calls and WASM initialisation on GitHub Pages.
 *
 * The modern API:
 *  1. Downloads WASM + model fully before processing any frames
 *  2. Uses synchronous detectForVideo() — no overlapping async calls
 *  3. Is actively maintained by Google
 */
const Camera = (() => {
  let _video         = null;
  let _onResult      = null;
  let _onStateChange = null;
  let _fps           = 16;
  let _state         = 'idle';
  let _handLandmarker = null;
  let _stream        = null;
  let _rafId         = null;
  let _lastTime      = 0;

  function _setState(s) {
    _state = s;
    if (_onStateChange) _onStateChange(s);
  }

  /* ── cleanup ───────────────────────────────────────── */
  function _teardown() {
    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    if (_stream) {
      _stream.getTracks().forEach((t) => t.stop());
      _stream = null;
    }
    if (_video) {
      _video.srcObject = null;
    }
  }

  /* ── rAF loop — synchronous detectForVideo, throttled ── */
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
        const results = _handLandmarker.detectForVideo(_video, now);

        if (!results.landmarks || results.landmarks.length === 0) {
          if (_onResult) _onResult({ detected: false });
          return;
        }

        // landmarks[0] = first hand, [8] = INDEX_FINGER_TIP
        const tip = results.landmarks[0][8];
        if (_onResult) {
          _onResult({ detected: true, x: tip.x, y: tip.y, confidence: 1.0 });
        }
      } catch (err) {
        // Log but don't crash the loop
        console.warn('[Camera] detectForVideo error:', err.message);
      }
    }
    _rafId = requestAnimationFrame(tick);
  }

  /* ── Initialise HandLandmarker (downloads WASM + model) ── */
  async function _initHandLandmarker() {
    if (_handLandmarker) return; // already initialised

    console.log('[Camera] Loading MediaPipe Tasks Vision…');

    const { FilesetResolver, HandLandmarker } = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs'
    );

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
    );

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

    try {
      /* 1. Camera permission */
      _stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });

      /* 2. Attach stream to <video> */
      _video.srcObject = _stream;
      await new Promise((resolve, reject) => {
        if (_video.readyState >= 2) { resolve(); return; }
        _video.addEventListener('loadeddata', resolve, { once: true });
        _video.addEventListener('error', reject,       { once: true });
        setTimeout(resolve, 4000);
      });
      await _video.play().catch(() => {});

      /* 3. Initialise HandLandmarker (first time: downloads ~10 MB of WASM + model) */
      await _initHandLandmarker();

      /* 4. Go */
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
      } else if (
        err.name === 'NotFoundError' ||
        err.name === 'DevicesNotFoundError'
      ) {
        _setState('error');
      } else {
        _setState('error');
      }
    }
  }

  function stop() { _teardown(); _setState('paused'); }

  async function toggle() {
    if (_state === 'active') stop();
    else await start(_video, _onResult, _fps, _onStateChange);
  }

  async function retryPermission() {
    await start(_video, _onResult, _fps, _onStateChange);
  }

  function getState()        { return _state; }
  function getVideoElement() { return _video; }

  return { start, stop, toggle, retryPermission, getState, getVideoElement };
})();
