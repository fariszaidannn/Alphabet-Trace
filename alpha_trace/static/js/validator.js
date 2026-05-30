'use strict';

const Validator = (() => {
  let _waypoints = [];
  let _hit = [];
  let _nextIdx = 0;
  let _tolerance = 0.04;
  let _onWaypointHit = null;
  let _onComplete = null;

  function init(waypoints, tolerance, onWaypointHit, onComplete) {
    _waypoints = waypoints;
    _hit = new Array(waypoints.length).fill(false);
    _nextIdx = 0;
    _tolerance = tolerance;
    _onWaypointHit = onWaypointHit;
    _onComplete = onComplete;
  }

  function reset() {
    _hit = new Array(_waypoints.length).fill(false);
    _nextIdx = 0;
  }

  function check(fx, fy) {
    if (_nextIdx >= _waypoints.length) return;
    const windowEnd = Math.min(_nextIdx + 3, _waypoints.length);
    for (let i = _nextIdx; i < windowEnd; i++) {
      if (!_hit[i]) {
        const { x, y } = _waypoints[i];
        const dist = Math.hypot(fx - x, fy - y);
        if (dist <= _tolerance) {
          _hit[i] = true;
          if (_onWaypointHit) _onWaypointHit(i);
          while (_nextIdx < _waypoints.length && _hit[_nextIdx]) _nextIdx++;
        }
      }
    }
  }

  function progress() {
    const hit = _hit.filter(Boolean).length;
    return { hit, total: _waypoints.length, pct: _waypoints.length ? (hit / _waypoints.length) : 0 };
  }

  function isComplete() {
    return progress().pct >= 1.0;
  }

  function getHitArray() { return _waypoints.length ? [..._hit] : []; }

  return { init, reset, check, progress, isComplete, getHitArray };
})();
