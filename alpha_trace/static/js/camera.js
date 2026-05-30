'use strict';

const Camera = (() => {
  let _video       = null;
  let _onResult    = null;
  let _onStateChange = null;
  let _fps         = 16;
  let _state       = 'idle';
  let _hands       = null;
  let _camera      = null;

  function _setState(s) {
    _state = s;
    if (_onStateChange) _onStateChange(s);
  }

  // Build a fresh MediaPipe Hands instance
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
      if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        if (_onResult) _onResult({ detected: false });
        return;
      }
      const tip = results.multiHandLandmarks[0][8]; // INDEX_FINGER_TIP
      if (_onResult) _onResult({ detected: true, x: tip.x, y: tip.y, confidence: 1.0 });
    });
    return h;
  }

  async function start(videoEl, onResult, fps, onStateChange) {
    _video          = videoEl;
    _onResult       = onResult;
    _onStateChange  = onStateChange;
    _fps            = fps || 16;

    _setState('requesting');

    // Stop any existing camera stream before reinitialising
    if (_camera) {
      try { _camera.stop(); } catch (_) {}
      _camera = null;
    }

    _hands = _initHands();

    try {
      // First explicitly ask for camera permission so we can catch NotAllowedError
      // before handing off to MediaPipe's camera utility.
      await navigator.mediaDevices.getUserMedia({ video: true });

      _camera = new camera_utils.Camera(_video, {
        onFrame: async () => {
          if (_state === 'active') {
            await _hands.send({ image: _video });
          }
        },
        width: 640,
        height: 480
      });
      await _camera.start();
      _setState('active');
    } catch (err) {
      console.error('Camera start error:', err.name, err.message);
      // Distinguish between denied permission and any other failure
      if (
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError' ||
        err.message?.toLowerCase().includes('permission')
      ) {
        _setState('denied');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        _setState('error');          // no camera hardware
      } else {
        _setState('error');
      }
    }
  }

  function stop() {
    if (_camera) {
      try { _camera.stop(); } catch (_) {}
    }
    _setState('paused');
  }

  async function toggle() {
    if (_state === 'active') {
      stop();
    } else {
      // If previously denied we need to fully restart (not just unpause)
      if (_state === 'denied' || !_camera) {
        await start(_video, _onResult, _fps, _onStateChange);
      } else {
        try {
          await _camera.start();
          _setState('active');
        } catch (err) {
          console.error('Camera resume error:', err);
          _setState('error');
        }
      }
    }
  }

  // Called when the user clicks "Allow camera" after a denial
  async function retryPermission() {
    await start(_video, _onResult, _fps, _onStateChange);
  }

  function getState()        { return _state; }
  function getVideoElement() { return _video; }

  return { start, stop, toggle, retryPermission, getState, getVideoElement };
})();
