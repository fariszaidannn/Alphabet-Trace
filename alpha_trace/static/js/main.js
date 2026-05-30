'use strict';

const LETTERS_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const LETTERS_LOWER = 'abcdefghijklmnopqrstuvwxyz'.split('');
const STORAGE_KEY_UPPER = 'alphaTrace_completed_upper';
const STORAGE_KEY_LOWER = 'alphaTrace_completed_lower';

let _currentCase = 'upper'; // 'upper' | 'lower'
let LETTERS = LETTERS_UPPER;

// ── URL params ────────────────────────────────────────────────────────────────
const _params = new URLSearchParams(window.location.search);
const TOLERANCE = parseFloat(_params.get('tol') || '0.04');
const FPS = parseInt(_params.get('fps') || '16', 10);

// ── State ─────────────────────────────────────────────────────────────────────
let _currentIdx = 0;
let _letterData = null;
let _completedUpper = _loadCompleted(STORAGE_KEY_UPPER);
let _completedLower = _loadCompleted(STORAGE_KEY_LOWER);
let _completed = _completedUpper;
let _celebrating = false;
let _fingerX = null;
let _fingerY = null;
let _noHandFrames = 0;
let _rafId = null;
let _tracePath = [];

// ── DOM refs ──────────────────────────────────────────────────────────────────
const videoEl              = document.getElementById('video');
const overlayEl            = document.getElementById('overlay');
const handPromptEl         = document.getElementById('hand-prompt');
const progressBar          = document.getElementById('progress-bar');
const progressPct          = document.getElementById('progress-pct');
const celebration          = document.getElementById('celebration');
const confettiEl           = document.getElementById('confetti-canvas');
const wellDoneEl           = document.getElementById('well-done-label');
const counterEl            = document.getElementById('progress-counter');
const alphabetGrid         = document.getElementById('alphabet-grid');
const infoLetter           = document.getElementById('info-letter');
const infoStroke           = document.getElementById('info-stroke');
const infoHint             = document.getElementById('info-hint');
const camOffOverlay        = document.getElementById('camera-off-overlay');
const camRequestingOverlay = document.getElementById('camera-requesting-overlay');
const camOffLabel          = document.getElementById('cam-off-label');
const btnCamToggle         = document.getElementById('btn-cam-toggle');
const iconCamOn            = document.getElementById('icon-cam-on');
const iconCamOff           = document.getElementById('icon-cam-off');
const camToggleLabel       = document.getElementById('cam-toggle-label');
const btnPermissionWrap    = document.getElementById('btn-permission-wrap');
const btnCamPermission     = document.getElementById('btn-cam-permission');
const btnClear             = document.getElementById('btn-clear');
const btnPrev              = document.getElementById('btn-prev');
const btnNext              = document.getElementById('btn-next');
const caseBadge            = document.getElementById('case-badge');
const shapeAnalysis        = document.getElementById('shape-analysis');
const shapeFeedback        = document.getElementById('shape-feedback');
const shapeLinesCount      = document.getElementById('shape-lines-count');
const shapeCirclesCount    = document.getElementById('shape-circles-count');
const shapeScoreBar        = document.getElementById('shape-score-bar');
const shapeScorePct        = document.getElementById('shape-score-pct');

let _allLetters = null;

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const r = await fetch('static/letters.json');
    _allLetters = await r.json();
  } catch (e) {
    console.error('Failed to load letters.json', e);
  }

  _buildAlphabetGrid();
  _updateCounter();
  _loadLetter(_currentIdx);
  _startRenderLoop();

  Camera.start(videoEl, _onTrackResult, FPS, _onCameraState);

  btnCamToggle.addEventListener('click', () => Camera.toggle());
  btnCamPermission.addEventListener('click', () => Camera.retryPermission());
  btnClear.addEventListener('click', () => {
    CanvasRenderer.clearTrail();
    Validator.reset && Validator.reset();
  });

  document.getElementById('btn-prev').addEventListener('click', () => _goTo(_currentIdx - 1));
  document.getElementById('btn-next').addEventListener('click', () => _goTo(_currentIdx + 1));
  document.getElementById('btn-reset').addEventListener('click', _resetProgress);

  // ── Case tab wiring ───────────────────────────────────────────────────────
  document.querySelectorAll('.case-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (_celebrating) return;
      const c = tab.dataset.case;
      if (c === _currentCase) return;
      _switchCase(c);
    });
  });

  // ── Filter dropdown wiring ────────────────────────────────────────────────
  const filterBtn   = document.getElementById('filter-dropdown-btn');
  const filterMenu  = document.getElementById('filter-dropdown-menu');
  const filterIcon  = document.getElementById('filter-icon');

  filterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const expanded = filterBtn.getAttribute('aria-expanded') === 'true';
    filterBtn.setAttribute('aria-expanded', String(!expanded));
    filterMenu.classList.toggle('hidden', expanded);
  });

  filterMenu.querySelectorAll('.filter-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const mode = opt.dataset.mode;
      filterMenu.querySelectorAll('.filter-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      filterIcon.textContent = opt.textContent.trim().split(' ')[0];
      const label = document.getElementById('filter-label');
      if (label) {
        label.textContent = opt.querySelector('span').textContent;
      }
      filterBtn.setAttribute('aria-expanded', 'false');
      filterMenu.classList.add('hidden');
      FilterEngine.setMode(mode);
    });
  });

  document.addEventListener('click', () => {
    filterBtn.setAttribute('aria-expanded', 'false');
    filterMenu.classList.add('hidden');
  });

  FilterEngine.start(document.getElementById('filter-canvas'));
}

// ── Alphabet grid ─────────────────────────────────────────────────────────────
function _buildAlphabetGrid() {
  alphabetGrid.innerHTML = '';
  LETTERS.forEach((ch, i) => {
    const pill = document.createElement('div');
    pill.className = 'pill' + (_completed[i] ? ' done' : '') + (i === _currentIdx ? ' active' : '');
    pill.textContent = ch;
    pill.dataset.idx = i;
    pill.addEventListener('click', () => _goTo(i));
    alphabetGrid.appendChild(pill);
  });
}

function _refreshGrid() {
  const pills = alphabetGrid.querySelectorAll('.pill');
  pills.forEach((pill, i) => {
    pill.className = 'pill' + (_completed[i] ? ' done' : '') + (i === _currentIdx ? ' active' : '');
  });
}

// ── Letter loading ────────────────────────────────────────────────────────────
function _loadLetter(idx) {
  if (idx < 0) idx = 0;
  if (idx >= LETTERS.length) idx = LETTERS.length - 1;
  _currentIdx = idx;

  btnPrev.disabled = _currentIdx === 0;
  btnNext.disabled = _currentIdx === LETTERS.length - 1;

  const ch = LETTERS[idx];
  infoLetter.textContent = ch;
  shapeAnalysis.classList.add('hidden');
  _tracePath = [];
  FilterEngine.clearOverlay();

  const data = _allLetters ? _allLetters[ch] : null;
  if (data) {
    _letterData = data;
    infoStroke.textContent = `Stroke 1 of ${data.stroke_count}`;
    infoHint.textContent = data.hint;
    CanvasRenderer.setLetter(data);
    Validator.init(data.waypoints, TOLERANCE, _onWaypointHit, _onLetterComplete);
    _celebrating = false;
    _refreshGrid();
  }
}

function _goTo(idx) {
  if (_celebrating) return;
  _loadLetter(idx);
}

// ── Tracking callback ─────────────────────────────────────────────────────────
function _onTrackResult(result) {
  if (result.error || !result.detected) {
    _fingerX = null;
    _fingerY = null;
    _noHandFrames++;
    if (_noHandFrames > 10) handPromptEl.classList.remove('hidden');
    return;
  }
  _noHandFrames = 0;
  handPromptEl.classList.add('hidden');

  // Mirror the x coordinate to match the mirrored video
  _fingerX = 1 - result.x;
  _fingerY = result.y;

  if (!_celebrating) {
    _tracePath.push({ x: _fingerX, y: _fingerY });
    Validator.check(_fingerX, _fingerY);
    const prog = Validator.progress();
    progressBar.style.width = (prog.pct * 100).toFixed(1) + '%';
    progressPct.textContent = Math.round(prog.pct * 100) + ' %';

    if (Validator.isComplete()) {
      _onLetterComplete();
    }
  }
}

// ── Camera state handler ──────────────────────────────────────────────────────
function _onCameraState(state) {
  // Overlays
  camOffOverlay.classList.toggle('hidden',        state === 'active' || state === 'requesting');
  camRequestingOverlay.classList.toggle('hidden', state !== 'requesting');

  // Label inside camera-off overlay
  if (state === 'paused' || state === 'idle') camOffLabel.textContent = 'Camera is off';
  if (state === 'denied')  camOffLabel.textContent = 'Camera access denied';
  if (state === 'error')   camOffLabel.textContent = 'Camera unavailable';

  // Toggle button appearance
  const isOn = state === 'active';
  const isRequesting = state === 'requesting';
  btnCamToggle.classList.toggle('cam-on',        isOn);
  btnCamToggle.classList.toggle('cam-off-state', !isOn && !isRequesting);
  btnCamToggle.disabled = isRequesting;
  btnCamToggle.title = isOn ? 'Turn camera off' : isRequesting ? 'Waiting for permission…' : 'Turn camera on';
  iconCamOn.classList.toggle('hidden',  !isOn);
  iconCamOff.classList.toggle('hidden', isOn);
  camToggleLabel.textContent = isOn ? 'Camera on' : isRequesting ? 'Starting…' : 'Camera off';

  // Permission-retry button: show only when denied
  btnPermissionWrap.style.display = state === 'denied' ? 'flex' : 'none';

  // Clear finger when camera goes off
  if (state !== 'active') {
    _fingerX = null;
    _fingerY = null;
    handPromptEl.classList.add('hidden');
    _noHandFrames = 0;
  }
}

// ── Waypoint hit feedback ─────────────────────────────────────────────────────
function _onWaypointHit(idx) {
  Sounds.dot();
}

// ── Letter complete ───────────────────────────────────────────────────────────
let _completionTriggered = false;

function _onLetterComplete() {
  if (_celebrating || _completionTriggered) return;
  _completionTriggered = true;
  _celebrating = true;

  _completed[_currentIdx] = true;
  _saveCompleted();
  _updateCounter();
  _refreshGrid();

  // Sound + flash
  Sounds.letterComplete();
  CanvasRenderer.flashLetterComplete();

  // Show celebration UI
  celebration.classList.remove('hidden');
  Celebrate.fire(confettiEl);

  // Check all done
  if (_completed.every(Boolean)) {
    setTimeout(_showAllDone, 2800);
    return;
  }

  // Auto-advance
  setTimeout(() => {
    Celebrate.stop(confettiEl);
    celebration.classList.add('hidden');
    progressBar.style.width = '0%';
    progressPct.textContent = '0 %';
    _completionTriggered = false;
    _celebrating = false;
    _loadLetter(_currentIdx + 1 < LETTERS.length ? _currentIdx + 1 : 0);
  }, 2500);
}

// ── Shape analysis display ────────────────────────────────────────────────────
function _showShapeAnalysis(result) {
  shapeAnalysis.classList.remove('hidden');
  shapeFeedback.textContent = result.feedback;
  shapeLinesCount.textContent = result.lines_detected;
  shapeCirclesCount.textContent = result.circles_detected;
  const pct = Math.round(result.shape_score * 100);
  shapeScoreBar.style.width = pct + '%';
  shapeScorePct.textContent = pct + '%';
}

// ── Render loop ───────────────────────────────────────────────────────────────
function _startRenderLoop() {
  const wrapper = document.getElementById('canvas-wrapper');

  // init MUST come before the first resize call
  CanvasRenderer.init(overlayEl);

  function sizeCanvas() {
    CanvasRenderer.resize(wrapper.clientWidth, wrapper.clientHeight);
  }
  sizeCanvas();
  window.addEventListener('resize', sizeCanvas);

  function loop() {
    if (!_celebrating) {
      CanvasRenderer.draw(_fingerX, _fingerY, Validator.getHitArray());
    }
    _rafId = requestAnimationFrame(loop);
  }
  loop();
}

// ── Case switching ────────────────────────────────────────────────────────────
function _switchCase(c) {
  _currentCase = c;
  LETTERS = c === 'upper' ? LETTERS_UPPER : LETTERS_LOWER;
  _completed = c === 'upper' ? _completedUpper : _completedLower;

  document.querySelectorAll('.case-tab').forEach(t => {
    const isActive = t.dataset.case === c;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', String(isActive));
  });

  caseBadge.textContent = c === 'upper' ? 'ABC' : 'abc';
  caseBadge.className = 'case-badge ' + (c === 'upper' ? 'upper-badge' : 'lower-badge');

  _currentIdx = 0;
  _completionTriggered = false;
  _celebrating = false;
  celebration.classList.add('hidden');
  progressBar.style.width = '0%';
  progressPct.textContent = '0 %';
  shapeAnalysis.classList.add('hidden');
  CanvasRenderer.clearTrail();
  _buildAlphabetGrid();
  _updateCounter();
  _loadLetter(0);
}

// ── Progress persistence ──────────────────────────────────────────────────────
function _loadCompleted(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return new Array(26).fill(false);
}

function _saveCompleted() {
  const key = _currentCase === 'upper' ? STORAGE_KEY_UPPER : STORAGE_KEY_LOWER;
  sessionStorage.setItem(key, JSON.stringify(_completed));
}

function _updateCounter() {
  const n = _completed.filter(Boolean).length;
  counterEl.textContent = `★ ${n} / 26 letters`;
}

function _resetProgress() {
  _completed.fill(false);
  if (_currentCase === 'upper') _completedUpper = _completed;
  else _completedLower = _completed;
  _saveCompleted();
  _updateCounter();
  _refreshGrid();
  _completionTriggered = false;
  _celebrating = false;
  celebration.classList.add('hidden');
  progressBar.style.width = '0%';
  progressPct.textContent = '0 %';
  _loadLetter(0);
}

// ── All-done screen ───────────────────────────────────────────────────────────
function _showAllDone() {
  Celebrate.stop(confettiEl);
  celebration.classList.add('hidden');
  Sounds.allDone();

  const isUpper = _currentCase === 'upper';
  const overlay = document.createElement('div');
  overlay.id = 'all-done-overlay';
  overlay.innerHTML = `
    <h1>🎉 Amazing!</h1>
    <p>You traced all 26 ${isUpper ? 'uppercase' : 'lowercase'} letters!</p>
    ${!isUpper ? '' : '<p style="font-size:1rem;color:#a8dadc;margin-top:-10px">Try the lowercase set next!</p>'}
    <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
      <button class="btn-nav" onclick="document.getElementById('all-done-overlay').remove(); window._app_reset();">
        Play again
      </button>
      ${isUpper ? `<button class="btn-nav" style="background:#2a9d8f" onclick="document.getElementById('all-done-overlay').remove(); window._app_switch_lower();">
        Try lowercase →
      </button>` : ''}
    </div>`;
  document.body.appendChild(overlay);
}

window._app_reset = function () {
  _resetProgress();
};

window._app_switch_lower = function () {
  _switchCase('lower');
};

// ── Start ─────────────────────────────────────────────────────────────────────
init();
