'use strict';

const Camera = (() => {
  const _captureCanvas = document.createElement('canvas');
  _captureCanvas.width = 640;
  _captureCanvas.height = 480;
  const _captureCtx = _captureCanvas.getContext('2d');

  let _video = null;
  let _interval = null;
  let _inFlight = false;
  let _onResult = null;
  let _onStateChange = null;
  let _fps = 16;
  // States: 'idle' | 'requesting' | 'active' | 'paused' | 'denied' | 'error'
  let _state = 'idle';

  function _setState(s) {
    _state = s;
    if (_onStateChange) _onStateChange(s);
  }

  async function start(videoEl, onResult, fps, onStateChange) {
    _video = videoEl;
    _onResult = onResult;
    _onStateChange = onStateChange;
    _fps = fps || 16;
    await _requestCamera();
  }

  async function _requestCamera() {
    _setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      _video.srcObject = stream;
      await _video.play();
      _interval = setInterval(_captureAndSend, Math.round(1000 / _fps));
      _setState('active');
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        _setState('denied');
      } else {
        _setState('error');
      }
    }
  }

  function stop() {
    if (_interval) { clearInterval(_interval); _interval = null; }
    if (_video && _video.srcObject) {
      _video.srcObject.getTracks().forEach(t => t.stop());
      _video.srcObject = null;
    }
    _setState('paused');
  }

  async function toggle() {
    if (_state === 'active') {
      stop();
    } else if (_state === 'paused' || _state === 'idle' || _state === 'error') {
      await _requestCamera();
    }
    // 'denied' is handled by retryPermission
  }

  async function retryPermission() {
    // Navigating away and back forces the browser to re-prompt in most cases.
    // We just call getUserMedia again — some browsers will re-prompt.
    if (_interval) { clearInterval(_interval); _interval = null; }
    if (_video && _video.srcObject) {
      _video.srcObject.getTracks().forEach(t => t.stop());
      _video.srcObject = null;
    }
    await _requestCamera();
  }

  function getState() { return _state; }

  function _captureAndSend() {
    if (_inFlight || !_video || _video.readyState < 2) return;
    _inFlight = true;
    _captureCtx.drawImage(_video, 0, 0, 640, 480);
    const frame = _captureCanvas.toDataURL('image/jpeg', 0.7);

    fetch('/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frame }),
    })
      .then(r => r.json())
      .then(data => { _inFlight = false; if (_onResult) _onResult(data); })
      .catch(() => { _inFlight = false; });
  }

  function getVideoElement() { return _video; }

  return { start, stop, toggle, retryPermission, getState, getVideoElement };
})();
