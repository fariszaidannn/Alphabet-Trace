'use strict';

const Camera = (() => {
  let _video = null;
  let _onResult = null;
  let _onStateChange = null;
  let _fps = 16;
  let _state = 'idle';
  let _hands = null;
  let _camera = null;

  function _setState(s) {
    _state = s;
    if (_onStateChange) _onStateChange(s);
  }

  async function start(videoEl, onResult, fps, onStateChange) {
    _video = videoEl;
    _onResult = onResult;
    _onStateChange = onStateChange;
    _fps = fps || 16;

    _setState('requesting');

    // Initialize MediaPipe Hands
    _hands = new Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    });

    _hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    _hands.onResults((results) => {
      if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        if (_onResult) _onResult({ detected: false });
        return;
      }

      const landmarks = results.multiHandLandmarks[0];
      const tip = landmarks[8]; // INDEX_FINGER_TIP
      
      if (_onResult) {
        _onResult({
          detected: true,
          x: tip.x,
          y: tip.y,
          confidence: 1.0 // MediaPipe Hands JS doesn't easily expose individual score here
        });
      }
    });

    try {
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
      console.error('Camera start error:', err);
      _setState('error');
    }
  }

  function stop() {
    if (_camera) {
      _camera.stop();
    }
    _setState('paused');
  }

  async function toggle() {
    if (_state === 'active') {
      stop();
    } else {
      if (_camera) {
        await _camera.start();
        _setState('active');
      }
    }
  }

  async function retryPermission() {
    await start(_video, _onResult, _fps, _onStateChange);
  }

  function getState() { return _state; }
  function getVideoElement() { return _video; }

  return { start, stop, toggle, retryPermission, getState, getVideoElement };
})();
