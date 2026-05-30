'use strict';

/**
 * Camera module — manages getUserMedia + feeds frames to MediaPipe Hands.
 * Does NOT depend on camera_utils.js — we own the full stream lifecycle so
 * permission errors are always caught and the retry button works reliably.
 */
const Camera = (() => {
  let _video         = null;
  let _onResult      = null;
  let _onStateChange = null;
  let _fps           = 16;
  let _state         = 'idle';
  let _hands         = null;
  let _stream        = null;   // the MediaStream we own
  let _loopId        = null;   // setInterval handle for frame sending

  /* ── State management ───────────────────────────────── */
  function _setState(s) {
    _state = s;
    if (_onStateChange) _onStateChange(s);
  }

  /* ── MediaPipe Hands factory ────────────────────────── */
  function _initHands() {
    const h = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    h.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    h.onResults((results) => {
      if (
        !results.multiHandLandmarks ||
        results.multiHandLandmarks.length === 0
      ) {
        if (_onResult) _onResult({ detected: false });
        return;
      }
      const tip = results.multiHandLandmarks[0][8]; // INDEX_FINGER_TIP
      if (_onResult) _onResult({ detected: true, x: tip.x, y: tip.y, confidence: 1.0 });
    });
    return h;
  }

  /* ── Clean up existing stream / loop ────────────────── */
  function _teardown() {
    if (_loopId) {
      clearInterval(_loopId);
      _loopId = null;
    }
    if (_stream) {
      _stream.getTracks().forEach(t => t.stop());
      _stream = null;
    }
    if (_video) {
      _video.srcObject = null;
    }
  }

  /* ── Frame loop ─────────────────────────────────────── */
  function _startLoop() {
    if (_loopId) clearInterval(_loopId);
    const ms = Math.max(16, Math.round(1000 / _fps));
    _loopId = setInterval(async () => {
      if (_state !== 'active') return;
      if (!_video || _video.readyState < 2) return;
      if (!_hands) return;
      try {
        await _hands.send({ image: _video });
      } catch (_) {
        // swallow transient MediaPipe errors (e.g. during tab switch)
      }
    }, ms);
  }

  /* ── Public: start ──────────────────────────────────── */
  async function start(videoEl, onResult, fps, onStateChange) {
    _video         = videoEl;
    _onResult      = onResult;
    _onStateChange = onStateChange;
    _fps           = fps || 16;

    _teardown();           // stop any previous session cleanly
    _setState('requesting');

    try {
      /* 1. Request camera — this is the call the browser prompts the user for */
      _stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width:  { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });

      /* 2. Attach stream to <video> and wait for it to be ready */
      _video.srcObject = _stream;
      if (_video.readyState < 1) {
        await new Promise((resolve, reject) => {
          _video.addEventListener('loadedmetadata', resolve, { once: true });
          _video.addEventListener('error', reject,          { once: true });
        });
      }
      // Attempt autoplay (may be a no-op if already playing via autoplay attr)
      await _video.play().catch(() => {});

      /* 3. Init MediaPipe Hands (create once, reuse on subsequent calls) */
      if (!_hands) {
        _hands = _initHands();
      }

      /* 4. Start the frame-sending loop */
      _setState('active');
      _startLoop();

    } catch (err) {
      console.error('[Camera] start failed:', err.name, err.message);
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
        _setState('error');   // no camera hardware found
      } else {
        _setState('error');
      }
    }
  }

  /* ── Public: stop ───────────────────────────────────── */
  function stop() {
    _teardown();
    _setState('paused');
  }

  /* ── Public: toggle ─────────────────────────────────── */
  async function toggle() {
    if (_state === 'active') {
      stop();
    } else {
      // Always do a full restart — covers denied, paused, error states
      await start(_video, _onResult, _fps, _onStateChange);
    }
  }

  /* ── Public: retryPermission (Allow-camera button) ──── */
  async function retryPermission() {
    await start(_video, _onResult, _fps, _onStateChange);
  }

  function getState()        { return _state; }
  function getVideoElement() { return _video; }

  return { start, stop, toggle, retryPermission, getState, getVideoElement };
})();
