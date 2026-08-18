/**
 * number-scrubber.js — Figma-style numeric value scrubber
 *
 * Adds horizontal drag-to-adjust behavior to numeric input labels/icons in the
 * properties panel. Drag left/right on a label/icon to scrub the value.
 *
 * Figma-inspired behavior:
 *   - Incremental delta accumulation (immune to panel position jumps)
 *   - Edge wrap: custom DOM cursor wraps to opposite side when hitting screen edge
 *   - Global interaction lock: all other interactions suppressed during scrub
 *   - Linear per-field step sizing (no exponential growth)
 *
 * Public API:
 *   NumberScrubber.init()   — call once after DOM is ready (binds + auto-refresh hook)
 *   NumberScrubber.refresh() — safe to call repeatedly; idempotent rebind
 */
'use strict';

window.NumberScrubber = (function () {

  // ── Config ──────────────────────────────────────────────────────────────────
  var SHIFT_MULTIPLIER = 8;       // hold Shift for fine-grained control (÷8)
  var EDGE_MARGIN      = 5;       // px from edge before wrapping triggers

  // ── Per-field linear step config ───────────────────────────────────────────
  var FIELD_CONFIG = {
    'pp-w':           { pxPerUnit: 1,   decimals: 0 },
    'pp-h':           { pxPerUnit: 1,   decimals: 0 },
    'pp-x':           { pxPerUnit: 1,   decimals: 0 },
    'pp-y':           { pxPerUnit: 1,   decimals: 0 },
    'pp-radius':      { pxPerUnit: 1,   decimals: 0 },
    'pp-opacity':     { pxPerUnit: 400, decimals: 2 },
    'pp-pad-h':       { pxPerUnit: 1,   decimals: 0 },
    'pp-pad-v':       { pxPerUnit: 1,   decimals: 0 },
    'pp-pad-t':       { pxPerUnit: 1,   decimals: 0 },
    'pp-pad-r':       { pxPerUnit: 1,   decimals: 0 },
    'pp-pad-b':       { pxPerUnit: 1,   decimals: 0 },
    'pp-pad-l':       { pxPerUnit: 1,   decimals: 0 },
    'pp-margin-h':    { pxPerUnit: 1,   decimals: 0 },
    'pp-margin-v':    { pxPerUnit: 1,   decimals: 0 },
    'pp-mt':          { pxPerUnit: 1,   decimals: 0 },
    'pp-mr':          { pxPerUnit: 1,   decimals: 0 },
    'pp-mb':          { pxPerUnit: 1,   decimals: 0 },
    'pp-ml':          { pxPerUnit: 1,   decimals: 0 },
    'pp-pl':          { pxPerUnit: 1,   decimals: 0 },
    'pp-pt':          { pxPerUnit: 1,   decimals: 0 },
    'pp-pr':          { pxPerUnit: 1,   decimals: 0 },
    'pp-pb':          { pxPerUnit: 1,   decimals: 0 },
    'pp-line-height':   { pxPerUnit: 80, decimals: 2 },
    'pp-letter-spacing':{ pxPerUnit: 100,decimals: 2 },
    'pp-gap':         { pxPerUnit: 2,   decimals: 0 },
    'pp-grid-cols':   { pxPerUnit: 30,  decimals: 0 },
    'pp-grid-rows':   { pxPerUnit: 30,  decimals: 0 },
    'ppshf-width':    { pxPerUnit: 1,   decimals: 0 },
    'ppshf-x':        { pxPerUnit: 1,   decimals: 0 },
    'ppshf-y':        { pxPerUnit: 1,   decimals: 0 },
    'ppshf-blur':     { pxPerUnit: 1,   decimals: 0 },
    'ppshf-spread':   { pxPerUnit: 1,   decimals: 0 },
    'ppsf-width':     { pxPerUnit: 1,   decimals: 0 }
  };
  var DEFAULT_CONFIG = { pxPerUnit: 2, decimals: 1 };

  // ── State ───────────────────────────────────────────────────────────────────
  var _active      = false;
  var _startVal    = 0;
  var _inputEl     = null;
  var _triggerEl   = null;
  var _lastX       = 0;        // previous frame clientX (for incremental delta)
  var _totalDx     = 0;        // accumulated drag distance (pixels)
  var _fieldCfg    = null;     // active field's config

  // Virtual cursor state (DOM-based replacement for real cursor during scrub)
  var _cursorX     = 0;        // virtual cursor X (can be outside viewport bounds)
  var _cursorY     = 0;        // virtual cursor Y (tracks real mouse Y)
  var _cursorEl    = null;     // DOM element used as fake cursor
  var _overlay     = null;     // fullscreen interaction lock overlay
  var _rafId       = null;     // requestAnimationFrame id for cursor rendering

  var _boundTriggers = new Set();
  var _isScrubbing  = false;

  // Viewport dimensions (cached)
  var _vw = window.innerWidth;
  var _vh = window.innerHeight;

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    _bindAll();
    window.addEventListener('resize', function () {
      _vw = window.innerWidth;
      _vh = window.innerHeight;
    });
  }

  function refresh() {
    if (_isScrubbing) return;
    _unbindAll();
    _bindAll();
  }

  // ── Bind / Unbind ──────────────────────────────────────────────────────────
  function _bindAll() {
    var panel = document.getElementById('pp-panel');
    if (!panel) return;

    var selectors = [
      '#pp-w',       '#pp-h',
      '#pp-radius',  '#pp-opacity',
      '#pp-pad-h',   '#pp-pad-v',
      '#pp-pad-t',   '#pp-pad-r',   '#pp-pad-b',   '#pp-pad-l',
      '#pp-pl',      '#pp-pt',      '#pp-pr',      '#pp-pb',
      '#pp-margin-h','#pp-margin-v',
      '#pp-mt',      '#pp-mr',      '#pp-mb',      '#pp-ml',
      '#pp-line-height', '#pp-letter-spacing',
      '#pp-gap',
      '#pp-grid-cols', '#pp-grid-rows',
      '#ppshf-width',
      '#ppshf-x',    '#ppshf-y',    '#ppshf-blur',  '#ppshf-spread',
      '#ppsf-width',
      '#pp-x',       '#pp-y'
    ];

    selectors.forEach(function (selector) {
      var inp = document.querySelector(selector);
      if (!inp || inp.disabled) return;

      var wrap = inp.closest('.pp-inline-input');
      if (!wrap) return;

      var trigger = wrap.querySelector('.pp-inline-label');
      if (!trigger) trigger = wrap.querySelector('.pp-inline-icon');
      if (!trigger || _boundTriggers.has(trigger)) return;

      _boundTriggers.add(trigger);
      _makeScrubbable(trigger, inp);
    });
  }

  function _unbindAll() {
    _boundTriggers.forEach(function (el) {
      el.classList.remove('pp-scrubbable', 'pp-scrubbing');
      var clone = el.cloneNode(true);
      if (el.parentNode) el.parentNode.replaceChild(clone, el);
    });
    _boundTriggers.clear();
    _abortDrag();
  }

  // ── Make scrubbable ────────────────────────────────────────────────────────
  function _makeScrubbable(triggerEl, inputEl) {
    triggerEl.classList.add('pp-scrubbable');
    triggerEl.addEventListener('mousedown', _onMouseDown, true);
  }

  // ── Virtual Cursor (DOM cursor + hidden system cursor) ─────────────────────

  /** Create the ew-resize arrow cursor element */
  function _createCursorEl() {
    var el = document.createElement('div');
    el.id = 'pp-virtual-cursor';
    // SVG: double-headed horizontal arrow (ew-resize style)
    el.innerHTML =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M7 12L3 8m0 0l4-4M3 8h18M17 12l4 4m0 0l-4-4m4 4H3" ' +
              'stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    el.style.cssText =
      'position:fixed;z-index:2147483647;pointer-events:none;' +
      'width:24px;height:24px;display:flex;align-items:center;justify-content:center;' +
      'transform:translate(-50%,-50%);will-change:transform;';
    document.body.appendChild(el);
    return el;
  }

  /**
   * Create fullscreen overlay that:
   *   1. Hides system cursor (cursor:none)
   *   2. Captures all mouse events (pointer-events:auto)
   *   3. Shows our DOM cursor instead
   */
  function _createOverlay() {
    if (_overlay) return;

    // Create the virtual cursor first
    _cursorEl = _createCursorEl();

    // Create fullscreen overlay with hidden system cursor
    _overlay = document.createElement('div');
    _overlay.id = 'pp-scrub-overlay';
    _overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
      'z-index:999999;cursor:none!important;' +           // ← hide system cursor!
      'background:transparent;pointer-events:none;';
    document.body.appendChild(_overlay);

    // Enable pointer-events after paint so it starts capturing
    requestAnimationFrame(function () {
      if (_overlay) _overlay.style.pointerEvents = 'auto';
    });

    // Start rAF loop for smooth virtual cursor positioning
    _startCursorLoop();
  }

  function _removeOverlay() {
    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    if (_cursorEl && _cursorEl.parentNode) {
      _cursorEl.parentNode.removeChild(_cursorEl);
    }
    _cursorEl = null;
    if (_overlay && _overlay.parentNode) {
      _overlay.parentNode.removeChild(_overlay);
    }
    _overlay = null;
  }

  /** rAF loop: position virtual cursor at (_cursorX, _cursorY) each frame */
  function _startCursorLoop() {
    (function loop() {
      if (!_active) return;
      if (_cursorEl) {
        _cursorEl.style.left = _cursorX + 'px';
        _cursorEl.style.top  = _cursorY + 'px';
      }
      _rafId = requestAnimationFrame(loop);
    })();
  }

  // ── Mouse Down ──────────────────────────────────────────────────────────────
  function _onMouseDown(e) {
    var triggerEl = e.currentTarget;
    var wrap = triggerEl.closest('.pp-inline-input');
    if (!wrap) return;
    var inputEl = wrap.querySelector('.pp-inline-val, input[type="text"], input[type="number"]');
    if (!inputEl || inputEl.disabled) return;

    e.preventDefault();
    e.stopPropagation();

    var val = parseFloat(inputEl.value);
    if (isNaN(val)) val = 0;
    var cfg = FIELD_CONFIG[inputEl.id] || DEFAULT_CONFIG;

    _active      = true;
    _isScrubbing = true;
    _cursorX     = e.clientX;   // virtual cursor starts at real mouse position
    _cursorY     = e.clientY;
    _lastX       = e.clientX;
    _totalDx     = 0;
    _startVal    = val;
    _inputEl     = inputEl;
    _triggerEl   = triggerEl;
    _fieldCfg    = cfg;

    triggerEl.classList.add('pp-scrubbing');
    document.body.classList.add('pp-scrubbing-cursor');

    inputEl.blur();
    document.addEventListener('dragstart', _preventDefault);

    // Create overlay + virtual cursor (hides system cursor)
    _createOverlay();

    // Attach listeners
    document.addEventListener('mousemove', _onMouseMove, { passive: false });
    document.addEventListener('mouseup',   _onMouseUp);
    window.addEventListener('mousemove', _onMouseMove, { passive: false });
    window.addEventListener('mouseup',   _onWindowMouseUp);
    window.addEventListener('blur', _onWindowBlur);
  }

  function _preventDefault(e) { e.preventDefault(); }

  // ── Mouse Move (incremental delta + edge wrap + virtual cursor) ─────────────
  function _onMouseMove(e) {
    if (!_active || !_inputEl || !_fieldCfg) return;

    e.preventDefault();
    e.stopPropagation();

    // Update virtual cursor Y from real mouse (only X is "virtual" / can wrap)
    _cursorY = e.clientY;

    // Compute displacement of REAL mouse since last frame
    var realCx = e.clientX;
    var frameDx = realCx - _lastX;
    _lastX = realCx;

    // Accumulate into total drag distance
    _totalDx += frameDx;

    // Advance virtual cursor X by the same frame delta
    _cursorX += frameDx;

    // ── Edge wrapping (virtual cursor only) ────────────────────
    // When virtual cursor passes viewport edge, wrap it to the opposite side.
    // The REAL cursor stays at the edge (system limitation), but our DOM
    // cursor visually teleports, giving the Figma-style infinite-scroll feel.
    if (_cursorX <= EDGE_MARGIN) {
      // Wrapped off left side → appear on right
      _cursorX = _vw - EDGE_MARGIN - 1;
    } else if (_cursorX >= _vw - EDGE_MARGIN) {
      // Wrapped off right side → appear on left
      _cursorX = EDGE_MARGIN + 1;
    }
    // Note: no compensation needed for _totalDx because the real mouse
    // physically stopped at the edge, so frameDx already reflects reality.

    // ── Linear value computation ────────────────────────────────
    var ppu = _fieldCfg.pxPerUnit;
    if (e.shiftKey) ppu = ppu * SHIFT_MULTIPLIER;

    var delta = _totalDx / ppu;
    var newVal = _startVal + delta;

    // Clamp opacity
    if (_inputEl.id === 'pp-opacity') {
      newVal = Math.max(0, Math.min(1, newVal));
    }
    // Clamp non-negative fields
    var negativeOk = ['pp-mt','pp-mr','pp-mb','pp-ml','pp-margin-h','pp-margin-v',
                     'ppshf-x','ppshf-y'];
    if (negativeOk.indexOf(_inputEl.id) === -1 && !_inputEl.id.startsWith('pp-margin')) {
      newVal = Math.max(0, newVal);
    }

    // Format display value
    var mult = Math.pow(10, _fieldCfg.decimals);
    _inputEl.value = String(Math.round(newVal * mult) / mult);
    _inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── Mouse Up handlers (triple redundancy) ─────────────────────────────────
  function _onMouseUp()   { if (!_active) return; _commitAndCleanup(); }
  function _onWindowMouseUp(){ if (!_active) return; _commitAndCleanup(); }
  function _onWindowBlur()  { if (!_active) return; _commitAndCleanup(); }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  function _commitAndCleanup() {
    _active = false;
    _isScrubbing = false;

    document.removeEventListener('mousemove', _onMouseMove);
    document.removeEventListener('mouseup',   _onMouseUp);
    window.removeEventListener('mousemove', _onMouseMove);
    window.removeEventListener('mouseup',   _onWindowMouseUp);
    window.removeEventListener('blur',      _onWindowBlur);
    document.removeEventListener('dragstart', _preventDefault);

    _removeOverlay();

    if (_triggerEl) _triggerEl.classList.remove('pp-scrubbing');
    document.body.classList.remove('pp-scrubbing-cursor');

    if (_inputEl) {
      _inputEl.dispatchEvent(new Event('change', { bubbles: true }));

      // Undo tracking for dimension changes
      if ((typeof window.EditorCore !== 'undefined') &&
          (typeof window.UndoStack !== 'undefined') &&
          (_inputEl.id === 'pp-w' || _inputEl.id === 'pp-h')) {
        var selEl = EditorCore.getSelectedEl ? EditorCore.getSelectedEl() : null;
        if (selEl) {
          var prop = _inputEl.id === 'pp-w' ? 'width' : 'height';
          EditorCore.trackChange(selEl, prop, _inputEl.value + 'px', _startVal + (prop === 'width' ? 'px' : ''), 'style');
        }
      }
      _inputEl.blur();
    }

    _inputEl   = null;
    _triggerEl = null;
    _fieldCfg  = null;
  }

  function _abortDrag() {
    if (!_active) return;
    _active = false;
    _isScrubbing = false;
    document.removeEventListener('mousemove', _onMouseMove);
    document.removeEventListener('mouseup',   _onMouseUp);
    window.removeEventListener('mousemove', _onMouseMove);
    window.removeEventListener('mouseup',   _onWindowMouseUp);
    window.removeEventListener('blur',      _onWindowBlur);
    document.removeEventListener('dragstart', _preventDefault);
    _removeOverlay();
    if (_triggerEl) _triggerEl.classList.remove('pp-scrubbing');
    document.body.classList.remove('pp-scrubbing-cursor');
    _inputEl   = null;
    _triggerEl = null;
    _fieldCfg  = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  return { init: init, refresh: refresh };

}());
