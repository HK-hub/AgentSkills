/**
 * editor-core.js — Pure JS edit engine (extracted from useEditMode.js)
 *
 * Responsibilities:
 *  - Inject / remove event handlers into the target iframe
 *  - Element hover highlight + click-to-select
 *  - Block all interactive events on the target page while editing
 *  - Apply style / text / image changes to selected element
 *  - Track all changes for serialization
 *  - Emit events: 'select', 'deselect', 'change'
 */
'use strict';

window.EditorCore = (function () {
  // ── State ─────────────────────────────────────────────────────────────────
  let _iframe = null;
  let _isEditing = false;
  let _selectedEl = null;
  let _selectedEls = [];      // multi-select array
  let _changes = [];          // { selector, property, value }  — flat change log
  let _modifiedElements = new WeakSet(); // elements touched by user actions (for diff filtering)
  let _debounceTimer = null;

  // Inline text editing state
  let _inlineEditTarget = null;   // element being edited (null = not editing)
  let _inlineOldText = '';
  let _inlineOldStyle = '';       // snapshot of style.cssText before inline edit (restored on ESC cancel)
  let _inlineKeyHandler = null;
  let _inlineBubbleStop = null;
  let _inlineDocMousedown = null;

  // Events to let through blockHandler during inline text editing
  const INLINE_EDIT_EVENTS = new Set([
    'keydown', 'keyup', 'input', 'beforeinput',
    'focus', 'focusin', 'focusout',
    'mousedown', 'mouseup', 'pointerdown', 'pointerup',
    'compositionstart', 'compositionupdate', 'compositionend',
  ]);

  function _isEventForInlineEdit(e) {
    if (!INLINE_EDIT_EVENTS.has(e.type)) return false;
    // Keyboard/input/composition events: always allow (they go to focused element)
    if (e.type === 'input' || e.type === 'beforeinput' ||
        e.type.startsWith('key') || e.type.startsWith('composition')) return true;
    // Mouse/pointer/focus events: only allow if targeting the editable element
    return _inlineEditTarget.contains(e.target);
  }

  // Event handler refs (kept for removal)
  let _blockHandler = null;
  let _overHandler  = null;
  let _outHandler   = null;
  let _moveHandler  = null;
  let _clickHandler = null;
  let _dblclickHandler = null;

  // Frozen API refs (restored on exit)
  let _origApis = null;
  let _freezeStyleId = '__page-editor-freeze__';
  let _disabledHoverRules = []; // track disabled :hover rules for restore

  // Event bus
  const _listeners = {};

  const BLOCKED_EVENTS = [
    'touchstart', 'touchend', 'mousedown', 'mouseup',
    'focus', 'focusin', 'focusout', 'submit', 'change', 'input',
    'pointerdown', 'pointerup',
    // NOTE: 'scroll' and 'wheel' intentionally omitted so that:
    //   1. User can scroll the page while in edit mode to reach off-screen elements
    //   2. guides.js scroll listener can detect iframe scroll and repaint guide overlays
    'dragstart', 'contextmenu',
    'keydown', 'keyup',
  ];

  // ── Event bus ─────────────────────────────────────────────────────────────
  function on(event, fn) {
    (_listeners[event] = _listeners[event] || []).push(fn);
  }
  function off(event, fn) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(f => f !== fn);
  }
  function emit(event, data) {
    (_listeners[event] || []).forEach(fn => fn(data));
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init(iframeEl) {
    _iframe = iframeEl;
  }

  // ── Edit mode toggle ──────────────────────────────────────────────────────
  function enterEditMode() {
    _isEditing = true;
    _injectHandlers();
    // Capture DOM snapshot for accurate diff at save time
    if (window.Snapshot) Snapshot.capture(_iframeDoc());
    emit('editModeChanged', { active: true });
  }

  function exitEditMode() {
    _isEditing = false;
    // Commit any active inline text editing
    if (_inlineEditTarget) commitInlineEdit(false);
    // Clean up pe-locked markers injected by 9-grid alignment
    try {
      const doc = _iframeDoc();
      if (doc) {
        doc.querySelectorAll('[data-pe-locked]').forEach(function(el) {
          var prop = el.dataset.peLocked;
          // Only remove the style if it still matches the locked value
          // (user may have intentionally changed it via the panel)
          if (prop && el.dataset.peLockedVal && el.style[prop] === el.dataset.peLockedVal) {
            el.style.removeProperty(prop);
          }
          delete el.dataset.peLocked;
          delete el.dataset.peLockedVal;
        });
      }
    } catch (e) { /* iframe may be inaccessible */ }
    _selectedEl = null;
    _selectedEls = [];
    _removeHandlers();
    emit('editModeChanged', { active: false });
    emit('deselect', null);
  }

  function isEditing() { return _isEditing; }

  // ── Inject handlers into iframe ───────────────────────────────────────────
  function _injectHandlers() {
    if (!_iframe) return;
    try {
      const doc = _iframeDoc();
      if (!doc) return;

      // Inject edit-mode CSS
      let style = doc.getElementById('__page-editor-style__');
      if (!style) {
        style = doc.createElement('style');
        style.id = '__page-editor-style__';
        style.textContent = [
          '[data-edit-hover] { cursor: pointer !important; }',
          '[data-edit-selected] { /* selection handled by shell SVG overlay */ }',
          '[contenteditable="true"] { outline: 1px solid #009CFF !important; outline-offset: 1px; min-height: 1em; cursor: text !important; }',
          '.placeholder-text { pointer-events: none !important; user-select: none !important; }',
          'a[href] { pointer-events: none !important; cursor: default !important; }',
        ].join('\n');
        doc.head.appendChild(style);
      }

      // ── Freeze page side effects (§14.4) ──────────────────────────────
      _freezePageEffects(doc);

      // Block interactive events (with inline-edit guard)
      _blockHandler = (e) => {
        // Let events through for inline text editing
        if (_inlineEditTarget && _isEventForInlineEdit(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      };
      BLOCKED_EVENTS.forEach(ev => doc.addEventListener(ev, _blockHandler, true));

      // Hover — highlight logic mirrors click: normal=topmost-in-context, Cmd/Alt=deepest
      // _hoverRawTarget tracks the actual element under cursor so we can re-evaluate on key change
      let _hoverRawTarget = null;

      function _resolveHoverTarget(rawTarget, modKey) {
        if (!rawTarget) return null;
        if (rawTarget === doc || rawTarget === doc.documentElement || rawTarget === doc.body) return null;

        // Cmd/Alt: deepest element directly under cursor (already is rawTarget from mouseover)
        if (modKey) return rawTarget;

        // No selection: highlight the direct child of <body> that contains the target
        if (!_selectedEl) {
          let node = rawTarget;
          while (node && node.parentElement && node.parentElement !== doc.body) {
            node = node.parentElement;
          }
          return node;
        }

        // Something is selected: highlight the direct child of _selectedEl that contains target,
        // or if target is outside _selectedEl, highlight the body-level ancestor as above
        if (!_selectedEl.contains(rawTarget)) {
          let node = rawTarget;
          while (node && node.parentElement && node.parentElement !== doc.body) {
            node = node.parentElement;
          }
          return node;
        }

        // target is inside _selectedEl — highlight the direct child of _selectedEl on the path
        if (rawTarget === _selectedEl) return null; // hovering the selected element itself, no highlight
        let node = rawTarget;
        while (node && node.parentElement !== _selectedEl) {
          node = node.parentElement;
        }
        return node || rawTarget;
      }

      function _applyHover(el) {
        // Suppress hover during resize drag
        if (window.ResizeHandles && ResizeHandles.isDragging()) return;
        // Clear existing hover attributes first
        try { doc.querySelectorAll('[data-edit-hover]').forEach(n => n.removeAttribute('data-edit-hover')); } catch {}
        if (el) el.setAttribute('data-edit-hover', '');
        // Drive SVG overlay (hover: parent solid + children dashed)
        if (window.Guides) {
          if (el) window.Guides.showHover(el);
          else window.Guides.clearHover();
        }
      }

      _overHandler = (e) => {
        if (!_isEditing) return;
        let raw = e.target;
        if (raw === doc.body || raw === doc.documentElement) { _hoverRawTarget = null; _applyHover(null); return; }
        if (raw.classList && raw.classList.contains('placeholder-text')) raw = raw.parentElement;
        if (!raw) return;
        _hoverRawTarget = raw;
        _applyHover(_resolveHoverTarget(raw, true));
      };
      _outHandler = (e) => {
        if (e.target === doc.body || e.target === doc.documentElement) {
          _hoverRawTarget = null;
          _applyHover(null);
        }
      };

      // Re-evaluate hover when modifier keys change while hovering
      _moveHandler = (e) => {
        if (!_isEditing || !_hoverRawTarget) return;
        _applyHover(_resolveHoverTarget(_hoverRawTarget, true));
      };

      doc.body.addEventListener('mouseover', _overHandler);
      doc.body.addEventListener('mouseout', _outHandler);
      doc.addEventListener('mousemove', _moveHandler, true);

      // Click to select
      _clickHandler = (e) => {
        if (!_isEditing) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        let target = e.target;
        if (target === doc || target === doc.documentElement || target === doc.body) return;

        // If inline editing and click is outside the editing element, commit first
        if (_inlineEditTarget && !_inlineEditTarget.contains(target)) {
          commitInlineEdit(false);
        }
        // If still in inline edit (clicked inside editing element), let it be
        if (_inlineEditTarget) return;
        if (target.classList && target.classList.contains('placeholder-text')) {
          target = target.parentElement;
          if (!target) return;
        }

        // ── Click: resolve to same element as hover highlight (always deepest) ──
        if (!e.metaKey) {
          const resolved = _resolveHoverTarget(target, true);
          if (!resolved) return;
          target = resolved;
        }

        // ── Cmd+Click: drill directly to deepest child under cursor ──
        if (e.metaKey) {
          // Walk down: find the deepest element that contains the click point
          let deep = target;
          let found = true;
          while (found) {
            found = false;
            const children = Array.from(deep.children);
            for (const child of children) {
              const r = child.getBoundingClientRect();
              if (e.clientX >= r.left && e.clientX <= r.right &&
                  e.clientY >= r.top  && e.clientY <= r.bottom) {
                deep = child;
                found = true;
                break;
              }
            }
          }
          target = deep;
        }

        // ── Single select ────────────────────────────────────────────────────
        doc.querySelectorAll('[data-edit-selected]').forEach(el => el.removeAttribute('data-edit-selected'));
        target.setAttribute('data-edit-selected', '');
        _selectedEl = target;
        _selectedEls = [target];

        const rect = _getElementScreenRect(target);
        const tagName = _buildTagLabel(target);
        emit('select', { el: target, rect, tagName });
      };
      doc.addEventListener('click', _clickHandler, true);

      // ── Double-click: directly select the clicked element; if it is a text
      //    element, also start inline editing immediately (no drill-down logic).
      _dblclickHandler = (e) => {
        if (!_isEditing) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (_inlineEditTarget) return;

        let target = e.target;
        if (target === doc || target === doc.documentElement || target === doc.body) return;
        // Unwrap placeholder helper spans
        if (target.classList && target.classList.contains('placeholder-text')) {
          target = target.parentElement;
          if (!target) return;
        }

        // Select the target element directly (no parent traversal, no drill-down)
        doc.querySelectorAll('[data-edit-selected]').forEach(el => el.removeAttribute('data-edit-selected'));
        target.setAttribute('data-edit-selected', '');
        _selectedEl = target;
        _selectedEls = [target];
        emit('select', { el: target, rect: _getElementScreenRect(target), tagName: _buildTagLabel(target) });

        // If the element is a text element (has direct text nodes, or is a known
        // text tag), immediately enter inline edit mode.
        const isTextEl = _hasDirectTextNode(target) ||
          ['p','span','h1','h2','h3','h4','h5','h6','a','li','dt','dd',
           'caption','label','button','td','th','blockquote','cite','em',
           'strong','small','mark','time','figcaption'].includes(
             (target.tagName || '').toLowerCase()
           );
        if (isTextEl) {
          emit('dblclick', { el: target, rect: _getElementScreenRect(target) });
        }
      };
      doc.addEventListener('dblclick', _dblclickHandler, true);

    } catch (e) {
      console.warn('[EditorCore] Cannot access iframe:', e);
    }
  }

  // ── Freeze / Unfreeze page side effects (§14.4) ─────────────────────────
  function _freezePageEffects(doc) {
    try {
      // 1. CSS: pause animations, kill transitions, disable scroll-behavior
      var freezeStyle = doc.getElementById(_freezeStyleId);
      if (!freezeStyle) {
        freezeStyle = doc.createElement('style');
        freezeStyle.id = _freezeStyleId;
        freezeStyle.textContent = [
          '*, *::before, *::after {',
          '  animation-play-state: paused !important;',
          '  transition-duration: 0s !important;',
          '  transition-delay: 0s !important;',
          '  scroll-behavior: auto !important;',
          '}',
        ].join('\n');
        doc.head.appendChild(freezeStyle);
      }

      // 1b. Disable all :hover CSS rules to prevent hover visual changes
      _disabledHoverRules = [];
      try {
        var sheets = doc.styleSheets;
        for (var si = 0; si < sheets.length; si++) {
          var rules;
          try { rules = sheets[si].cssRules; } catch(e) { continue; }
          if (!rules) continue;
          for (var ri = 0; ri < rules.length; ri++) {
            var rule = rules[ri];
            if (rule.type === 1 && rule.selectorText && rule.selectorText.indexOf(':hover') !== -1 && !rule.disabled) {
              rule.disabled = true;
              _disabledHoverRules.push(rule);
            }
          }
        }
      } catch(e) {}

      // 2. JS: save original APIs, clear existing timers, then override
      var win = _iframe.contentWindow;
      if (win && !_origApis) {
        _origApis = {
          setTimeout:           win.setTimeout.bind(win),
          setInterval:          win.setInterval.bind(win),
          clearTimeout:         win.clearTimeout.bind(win),
          clearInterval:        win.clearInterval.bind(win),
          requestAnimationFrame: win.requestAnimationFrame.bind(win),
          IntersectionObserver: win.IntersectionObserver,
          open:                 win.open,
        };

        // Clear all existing timers (stops carousels, countdowns, etc.)
        var maxId = _origApis.setTimeout(function () {}, 0);
        for (var i = 0; i <= maxId; i++) {
          _origApis.clearTimeout(i);
          _origApis.clearInterval(i);
        }

        // Override timer APIs to no-ops
        win.setTimeout = function () { return 0; };
        win.setInterval = function () { return 0; };
        win.requestAnimationFrame = function () { return 0; };

        // Neutralize IntersectionObserver (scroll-triggered animations)
        win.IntersectionObserver = function () {
          this.observe = function () {};
          this.unobserve = function () {};
          this.disconnect = function () {};
        };

        // Block navigation
        win.open = function () { return null; };
        try {
          win.history.pushState = function () {};
          win.history.replaceState = function () {};
        } catch (e) { /* may be restricted */ }
      }
    } catch (e) {
      console.warn('[PageEditor] Could not freeze page effects:', e.message);
    }
  }

  function _unfreezePageEffects(doc) {
    try {
      // Remove freeze CSS
      var freezeStyle = doc && doc.getElementById(_freezeStyleId);
      if (freezeStyle) freezeStyle.remove();

      // Re-enable :hover rules that were disabled
      if (_disabledHoverRules.length > 0) {
        _disabledHoverRules.forEach(function(rule) {
          try { rule.disabled = false; } catch(e) {}
        });
        _disabledHoverRules = [];
      }

      // Restore original APIs
      var win = _iframe && _iframe.contentWindow;
      if (win && _origApis) {
        win.setTimeout = _origApis.setTimeout;
        win.setInterval = _origApis.setInterval;
        win.requestAnimationFrame = _origApis.requestAnimationFrame;
        if (_origApis.IntersectionObserver) win.IntersectionObserver = _origApis.IntersectionObserver;
        if (_origApis.open) win.open = _origApis.open;
        _origApis = null;
      }
    } catch (e) {
      console.warn('[PageEditor] Could not unfreeze page effects:', e.message);
    }
  }

  function _removeHandlers() {
    if (!_iframe) return;
    try {
      const doc = _iframeDoc();
      if (!doc) return;

      // Remove edit-mode visual CSS but KEEP navigation-blocking CSS.
      // The edit-mode style sheet has hover/selection/contenteditable rules
      // AND the critical `a[href] { pointer-events: none }` rule that prevents
      // link clicks from navigating the iframe away (which would destroy all edits).
      // We replace it with a minimal navigation-guard style instead.
      const style = doc.getElementById('__page-editor-style__');
      if (style) {
        style.textContent = [
          // Keep links unclickable to prevent iframe navigation
          'a[href] { pointer-events: none !important; cursor: default !important; }',
        ].join('\n');
      }

      // NOTE: Do NOT unfreeze page effects here!
      // Unfreezing restores setTimeout/setInterval/requestAnimationFrame which
      // may trigger framework re-renders that overwrite user's inline style edits.
      // Page stays frozen until save (iframe reload) or explicit unfreeze.

      doc.querySelectorAll('[data-edit-hover]').forEach(el => el.removeAttribute('data-edit-hover'));
      doc.querySelectorAll('[data-edit-selected]').forEach(el => el.removeAttribute('data-edit-selected'));

      if (_overHandler)  doc.body.removeEventListener('mouseover', _overHandler);
      if (_outHandler)   doc.body.removeEventListener('mouseout',  _outHandler);
      if (_moveHandler)  doc.removeEventListener('mousemove', _moveHandler, true);
      if (_clickHandler) doc.removeEventListener('click', _clickHandler, true);
      if (_dblclickHandler) doc.removeEventListener('dblclick', _dblclickHandler, true);
      if (_blockHandler) BLOCKED_EVENTS.forEach(ev => doc.removeEventListener(ev, _blockHandler, true));

      _blockHandler = _overHandler = _outHandler = _moveHandler = _clickHandler = _dblclickHandler = null;
    } catch {}
  }

  // ── Apply operations ──────────────────────────────────────────────────────

  /** Apply background or text color */
  function applyColor(color, mode) {
    const el = _selectedEl;
    if (!el) return;
    const win = _iframe ? _iframe.contentWindow : null;

    // Capture for undo
    const cmd = UndoStack.capture(el, 'style', 'cssText', null, _iframeDoc());
    // Record INLINE style as oldValue (not computed)
    const _oldBg = el.style.backgroundColor || '';
    const _oldColor = el.style.color || '';

    const isGradient = typeof color === 'string' &&
      (color.startsWith('linear-gradient') || color.startsWith('radial-gradient'));

    if (mode === 'text') {
      if (!isGradient) _setStyleSmart(el, 'color', color, win);
    } else {
      if (color === 'transparent') {
        _setStyleSmart(el, 'background-color', 'transparent', win);
        _setStyleSmart(el, 'background-image', 'none', win);
      } else if (isGradient) {
        _setStyleSmart(el, 'background-image', color, win);
        _setStyleSmart(el, 'background-color', 'transparent', win);
      } else {
        _setStyleSmart(el, 'background-color', color, win);
        _setStyleSmart(el, 'background-image', 'none', win);
      }
    }

    cmd.newValue = el.style.cssText;
    UndoStack.record(cmd);
    _trackChange(el, mode === 'text' ? 'color' : 'backgroundColor', color, mode === 'text' ? _oldColor : _oldBg, 'style');
    _scheduleEmitChange();
  }

  /**
   * Smart style setter: try normal inline first, fall back to !important
   * only if a higher-specificity rule overrides it.
   */
  function _setStyleSmart(el, prop, value, win) {
    el.style.setProperty(prop, value);
    // Check if the value took effect
    if (win) {
      try {
        const effective = win.getComputedStyle(el)[prop];
        if (!_valuesMatch(effective, value)) {
          // Higher specificity rule is overriding — use !important as last resort
          el.style.setProperty(prop, value, 'important');
        }
      } catch (e) {
        // If getComputedStyle fails, use !important to be safe
        el.style.setProperty(prop, value, 'important');
      }
    }
  }

  // Cached canvas context for color normalization
  let _colorCtx = null;

  /** Loose comparison for CSS values — handles color format differences */
  function _valuesMatch(computed, intended) {
    if (!computed || !intended) return false;
    const normalize = (s) => (s || '').replace(/\s+/g, '').toLowerCase();
    if (normalize(computed) === normalize(intended)) return true;

    // Color format normalization: use canvas to convert both to the same format
    try {
      if (!_colorCtx) _colorCtx = document.createElement('canvas').getContext('2d');
      _colorCtx.fillStyle = '#000'; // reset
      _colorCtx.fillStyle = computed;
      const a = _colorCtx.fillStyle;
      _colorCtx.fillStyle = '#000'; // reset
      _colorCtx.fillStyle = intended;
      const b = _colorCtx.fillStyle;
      if (a === b) return true;
    } catch (e) { /* not a color value, fall through */ }

    return false;
  }

  /** Apply a single CSS property */
  function applyStyleProp(property, value) {
    const el = _selectedEl;
    if (!el) return;

    // ── Pseudo-state mode: write to injected stylesheet ──
    if (window.StateEditor && StateEditor.isActive()) {
      const state = StateEditor.currentState();
      const doc = _iframeDoc();
      const result = StateEditor.applyStateProp(el, state, property, value, doc);
      // Record undo command for pseudo-state edit
      const cmd = {
        type: 'stateStyle',
        selector: SelectorEngine.generate(el, doc),
        property: property,
        pseudoState: state,
        oldValue: result.oldValue,
        newValue: value,
      };
      UndoStack.record(cmd);
      _trackChange(el, property, value, result.oldValue, 'style');
      _scheduleEmitChange();
      return;
    }

    // ── Default: write to inline style ──
    const cmd = UndoStack.capture(el, 'style', 'cssText', null, _iframeDoc());
    // Record INLINE style as oldValue (empty string = was not set inline)
    // computedOldValue goes into meta for context
    const _oldInline = el.style[property] || '';
    el.style[property] = value;
    cmd.newValue = el.style.cssText;
    UndoStack.record(cmd);
    _trackChange(el, property, value, _oldInline, 'style');
    _scheduleEmitChange();
  }

  /** Update text content */
  function applyText(newText) {
    const el = _selectedEl;
    if (!el) return;
    const doc = _iframeDoc();
    const _oldText = el.textContent ? el.textContent.trim().substring(0, 500) : '';
    const cmd = UndoStack.capture(el, 'text', 'textContent', newText, doc);

    if (el.children.length === 0) {
      el.textContent = newText;
    } else {
      const textNodes = [];
      for (const node of el.childNodes) {
        if (node.nodeType === 3) textNodes.push(node);
      }
      if (textNodes.length > 0) textNodes[0].textContent = newText;
      else el.insertBefore(doc.createTextNode(newText), el.firstChild);
    }

    UndoStack.record(cmd);
    _trackChange(el, 'textContent', newText, _oldText, 'text');
    _scheduleEmitChange();
  }

  /** Replace image (src or background-image) */
  function applyImage(src) {
    const el = _selectedEl;
    if (!el || !src) return;
    const doc = _iframeDoc();
    const _oldImg = el.tagName === 'IMG' ? (el.src || '') : (_iframe.contentWindow.getComputedStyle(el).backgroundImage || '');

    const isVideo = src.startsWith('data:video/') || /\.mp4(\?|$)/i.test(src);

    // Hide placeholder text nodes
    el.querySelectorAll('.placeholder-text').forEach(p => { p.style.display = 'none'; });
    for (const child of el.childNodes) {
      if (child.nodeType === 3 && ['占位图','商品图',''].includes(child.textContent.trim())) {
        child.textContent = '';
      }
    }

    if (isVideo) {
      const cmd = UndoStack.capture(el, 'style', 'cssText', null, doc);
      let css = el.style.cssText.replace(/background[^;]*;?/gi, '');
      el.style.cssText = css + 'background: transparent !important; overflow: hidden !important;';
      el.querySelectorAll('video[data-media-replace]').forEach(v => v.remove());

      const vid = doc.createElement('video');
      vid.setAttribute('data-media-replace', 'true');
      vid.src = src;
      vid.autoplay = vid.loop = vid.muted = vid.playsInline = true;
      vid.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;z-index:1;';
      if (!el.style.position || el.style.position === 'static') el.style.position = 'relative';
      el.insertBefore(vid, el.firstChild);
      cmd.newValue = el.style.cssText;
      UndoStack.record(cmd);

    } else if (el.tagName === 'IMG') {
      // For <img>, capture the src attribute change (not style.cssText)
      const cmd = UndoStack.capture(el, 'attribute', 'src', null, doc);
      el.src = src;
      cmd.newValue = src;
      UndoStack.record(cmd);

    } else {
      const cmd = UndoStack.capture(el, 'style', 'cssText', null, doc);
      let css = (el.style.cssText || '')
        .replace(/background[^;]*!important\s*;?/gi, '')
        .replace(/background[^;]*;?/gi, '')
        .replace(/opacity[^;]*;?/gi, '');
      el.querySelectorAll('video[data-media-replace]').forEach(v => v.remove());
      el.style.cssText = css +
        `background-image: url('${src}') !important;` +
        'background-size: cover !important;' +
        'background-position: center !important;' +
        'background-repeat: no-repeat !important;' +
        'background-color: transparent !important;';
      cmd.newValue = el.style.cssText;
      UndoStack.record(cmd);
    }

    _trackChange(el, el.tagName === 'IMG' ? 'src' : 'backgroundImage',
      el.tagName === 'IMG' ? src : `url('${src}')`, _oldImg, el.tagName === 'IMG' ? 'attribute' : 'style');
    _scheduleEmitChange();
  }

  /** Set image fit mode */
  function applyImageFit(mode) {
    const el = _selectedEl;
    if (!el) return;
    const cmd = UndoStack.capture(el, 'style', 'cssText', null, _iframeDoc());
    const _oldFit = el.tagName === 'IMG' ? (el.style.objectFit || 'cover') : (_iframe.contentWindow.getComputedStyle(el).backgroundSize || '');

    if (el.tagName === 'IMG') {
      const fitMap = { cover: 'cover', contain: 'contain', none: 'none' };
      el.style.objectFit = fitMap[mode] || 'cover';
      el.style.objectPosition = 'center';
    } else {
      let css = (el.style.cssText || '')
        .replace(/background-size[^;]*;?/gi, '')
        .replace(/background-position[^;]*;?/gi, '')
        .replace(/background-repeat[^;]*;?/gi, '');
      const bgMap = {
        cover:   'background-size: cover !important; background-position: center !important; background-repeat: no-repeat !important;',
        contain: 'background-size: contain !important; background-position: center !important; background-repeat: no-repeat !important;',
        none:    'background-size: auto !important; background-position: center !important; background-repeat: no-repeat !important;',
      };
      el.style.cssText = css + (bgMap[mode] || bgMap.cover);
    }

    cmd.newValue = el.style.cssText;
    UndoStack.record(cmd);
    _trackChange(el, 'backgroundSize', mode, _oldFit, 'style');
    _scheduleEmitChange();
  }

  /** Remove image */
  function removeImage() {
    const el = _selectedEl;
    if (!el) return;
    const _oldImg = el.tagName === 'IMG' ? (el.src || '') : (_iframe.contentWindow.getComputedStyle(el).backgroundImage || '');

    if (el.tagName === 'IMG') {
      const cmd = UndoStack.capture(el, 'attribute', 'src', null, _iframeDoc());
      el.src = '';
      cmd.newValue = '';
      UndoStack.record(cmd);
      _trackChange(el, 'src', '', _oldImg, 'attribute');
    } else {
      const cmd = UndoStack.capture(el, 'style', 'cssText', null, _iframeDoc());
      el.style.cssText = (el.style.cssText || '')
        .replace(/background[^;]*!important\s*;?/gi, '')
        .replace(/background[^;]*;?/gi, '');
      el.querySelectorAll('.placeholder-text').forEach(p => { p.style.display = ''; });
      cmd.newValue = el.style.cssText;
      UndoStack.record(cmd);
      _trackChange(el, 'backgroundImage', 'none', _oldImg, 'style');
    }
    _scheduleEmitChange();
  }

  /** Delete selected element */
  function deleteElement() {
    const el = _selectedEl;
    if (!el) return;
    const doc = _iframeDoc();
    const selector = _selectorFor(el, doc);
    const oldHtml = el.outerHTML || '';
    const cmd = UndoStack.capture(el, 'remove', null, null, doc);
    el.remove();
    _selectedEl = null;
    UndoStack.record(cmd);
    _changes.push({
      selector,
      type: 'delete',
      property: '__delete__',
      oldValue: oldHtml,
      value: null,
      timestamp: Date.now(),
    });
    emit('deselect', null);
    _scheduleEmitChange();
  }

  // ── Inline text editing (double-click) ─────────────────────────────────────

  /** Get direct text content of an element (text nodes only, not children) */
  function _getDirectText(el) {
    var text = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) text += el.childNodes[i].textContent;
    }
    return text.trim();
  }

  /** Start inline text editing on the given element */
  // Known text-container tags that can be edited even when empty
  const _TEXT_CONTAINER_TAGS = new Set([
    'p','span','h1','h2','h3','h4','h5','h6','a','li','dt','dd',
    'caption','label','button','td','th','blockquote','cite','em',
    'strong','small','mark','time','figcaption'
  ]);

  function startInlineEdit(el) {
    if (!el || !_isEditing) return;
    // Allow editing if element has direct text nodes OR is a known text tag
    const tagName = (el.tagName || '').toLowerCase();
    if (!_hasDirectTextNode(el) && !_TEXT_CONTAINER_TAGS.has(tagName)) return;
    // Commit previous edit if still active
    if (_inlineEditTarget) commitInlineEdit(false);

    const doc = _iframeDoc();
    if (!doc) return;

    _inlineEditTarget = el;
    _inlineOldText = _getDirectText(el);
    _inlineOldStyle = el.style.cssText || '';  // snapshot style before contentEditable alters layout

    // Enable contentEditable
    el.contentEditable = 'true';
    el.focus();

    // Select all text
    try {
      const win = doc.defaultView || _iframe.contentWindow;
      const sel = win.getSelection();
      sel.selectAllChildren(el);
    } catch (e) { /* ignore */ }

    // Stop events from bubbling past the element to page scripts
    _inlineBubbleStop = (e) => e.stopPropagation();
    INLINE_EDIT_EVENTS.forEach(ev => el.addEventListener(ev, _inlineBubbleStop));

    // Keyboard handler: Enter = confirm, Escape = cancel
    _inlineKeyHandler = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitInlineEdit(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        commitInlineEdit(true); // cancel — restore old text
      }
    };
    el.addEventListener('keydown', _inlineKeyHandler);

    // Click outside the editing element → commit (via mousedown on doc)
    _inlineDocMousedown = (e) => {
      if (!_inlineEditTarget) return;
      if (!_inlineEditTarget.contains(e.target)) {
        commitInlineEdit(false);
      }
    };
    doc.addEventListener('mousedown', _inlineDocMousedown);

    emit('inlineEditStart', { el });
  }

  /** Commit (or cancel) inline text editing */
  function commitInlineEdit(cancel) {
    if (!_inlineEditTarget) return;
    const el = _inlineEditTarget;
    const doc = _iframeDoc();

    // Remove listeners
    if (_inlineKeyHandler) el.removeEventListener('keydown', _inlineKeyHandler);
    if (_inlineBubbleStop) INLINE_EDIT_EVENTS.forEach(ev => el.removeEventListener(ev, _inlineBubbleStop));
    if (_inlineDocMousedown && doc) doc.removeEventListener('mousedown', _inlineDocMousedown);
    _inlineKeyHandler = null;
    _inlineBubbleStop = null;
    _inlineDocMousedown = null;

    // Capture snapshots before any DOM mutations
    const oldText  = _inlineOldText;
    const oldStyle = _inlineOldStyle;
    const newText  = _getDirectText(el);

    // Clear _inlineEditTarget BEFORE DOM changes to re-enable event blocking
    _inlineEditTarget = null;
    _inlineOldStyle   = '';

    if (cancel) {
      // Restore text and style FIRST, then remove contentEditable so the
      // browser lays out the element with the correct style already in place.
      _restoreDirectText(el, oldText);
      el.style.cssText = oldStyle;
    }

    // Remove the contenteditable attribute entirely (not just set to "false")
    // so the element returns to exactly its pre-edit DOM state.
    el.removeAttribute('contenteditable');

    // Return focus to shell window so ESC key works after inline edit,
    // and clear any text selection left from selectAllChildren().
    try {
      const ifrWin = el.ownerDocument && el.ownerDocument.defaultView;
      if (ifrWin) {
        const active = ifrWin.document.activeElement;
        if (active && typeof active.blur === 'function') active.blur();
        const sel = ifrWin.getSelection();
        if (sel) sel.removeAllRanges();
      }
    } catch (e) {}

    if (!cancel && newText !== oldText) {
      // Record change via applyText pipeline (undo + trackChange)
      // applyText uses _selectedEl, ensure it's set
      const prevSelected = _selectedEl;
      _selectedEl = el;
      applyText(newText);
      _selectedEl = prevSelected;
    }

    // Clear selection so user can review the result
    el.removeAttribute('data-edit-selected');
    _selectedEl = null;
    _selectedEls = [];

    emit('inlineEditEnd', {});
  }

  /** Restore direct text nodes to old content */
  function _restoreDirectText(el, text) {
    var textNodes = [];
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) textNodes.push(el.childNodes[i]);
    }
    if (textNodes.length > 0) {
      textNodes[0].textContent = text;
      // Remove extra text nodes that may have been created
      for (var j = 1; j < textNodes.length; j++) textNodes[j].textContent = '';
    }
  }

  function isInlineEditing() { return !!_inlineEditTarget; }

  // ── Change tracking ───────────────────────────────────────────────────────
  function _trackChange(el, property, value, oldValue, type) {
    const doc = _iframeDoc();
    const selector = el ? _selectorFor(el, doc) : null;

    // Mark this element as user-modified for snapshot diff filtering
    if (el) _modifiedElements.add(el);

    // Collect rich element metadata for CSS-class-level mapping
    let meta = null;
    if (el) {
      const win = el.ownerDocument.defaultView;
      meta = {};
      if (el.id) meta.id = el.id;
      if (el.className && typeof el.className === 'string' && el.className.trim()) {
        meta.classList = el.className.trim().split(/\s+/);
      }
      if (el.tagName) meta.tag = el.tagName.toLowerCase();

      // Parent info for context
      const p = el.parentElement;
      if (p) {
        meta.parent = {};
        if (p.id) meta.parent.id = p.id;
        if (p.className && typeof p.className === 'string' && p.className.trim()) {
          meta.parent.classList = p.className.trim().split(/\s+/);
        }
        if (p.tagName) meta.parent.tag = p.tagName.toLowerCase();

        // ── Parent layout context ──────────────────────────────────────
        // Tells AI how the parent is laying out children, so it can
        // understand WHY a value is what it is (e.g. 97.5px = 1fr of grid)
        try {
          const pcs = win.getComputedStyle(p);
          meta.parent.display = pcs.display;
          if (/grid/.test(pcs.display)) {
            meta.parent.gridTemplateColumns = pcs.gridTemplateColumns;
            meta.parent.gridTemplateRows = pcs.gridTemplateRows;
            meta.parent.gap = pcs.gap;
          }
          if (/flex/.test(pcs.display)) {
            meta.parent.flexDirection = pcs.flexDirection;
            meta.parent.gap = pcs.gap;
          }
        } catch (e) { /* ignore */ }

        // ── Sibling context ────────────────────────────────────────────
        // Shows what siblings look like so AI can see alignment patterns
        try {
          const siblings = Array.from(p.children);
          meta.childIndex = siblings.indexOf(el);
          meta.siblingCount = siblings.length;
          meta.siblings = siblings.filter(s => s !== el).slice(0, 4).map(s => {
            const scs = win.getComputedStyle(s);
            const info = {};
            if (s.className && typeof s.className === 'string' && s.className.trim()) {
              info.classList = s.className.trim().split(/\s+/);
            }
            // For layout-related changes, include sibling dimensions
            if (['width','height','flex','gridColumn','gap','padding','margin'].some(k => property && property.toLowerCase().includes(k.toLowerCase()))) {
              info.width = scs.width;
              info.height = scs.height;
            }
            return info;
          });
        } catch (e) { /* ignore */ }
      }

      // Computed styles of the element itself
      try {
        const cs = win.getComputedStyle(el);
        meta.display = cs.display;
        meta.position = cs.position;
        // Record the COMPUTED value of the changed property for context
        if (property && (type || 'style') === 'style') {
          meta.computedValue = cs[property] || '';
        }
        // Record whether the old value was inline (user-set) or inherited (from stylesheet)
        meta.wasInline = !!oldValue;
      } catch (e) { /* ignore */ }
    }

    _changes.push({
      selector,
      type: type || 'style',
      property,
      oldValue: oldValue != null ? oldValue : null,
      value,
      timestamp: Date.now(),
      meta,
    });
  }

  /** Return changes. If dedupe=true, same selector+property keeps only last. */
  function getChanges(dedupe) {
    if (!dedupe) return _changes.slice();
    const map = new Map();
    for (const c of _changes) {
      map.set(`${c.selector}::${c.property}`, c);
    }
    return Array.from(map.values());
  }
  function clearChanges() { _changes = []; _modifiedElements = new WeakSet(); }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _iframeDoc() {
    if (!_iframe) return null;
    try { return _iframe.contentDocument || _iframe.contentWindow.document; } catch { return null; }
  }

  function _getElementScreenRect(el) {
    const iframeRect = _iframe.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    return {
      top:    iframeRect.top  + elRect.top,
      left:   iframeRect.left + elRect.left,
      right:  iframeRect.left + elRect.right,
      bottom: iframeRect.top  + elRect.bottom,
      width:  elRect.width,
      height: elRect.height,
    };
  }

  function _buildTagLabel(el) {
    let tag = el.tagName.toLowerCase();
    if (el.id) return tag + '#' + el.id.substring(0, 20);
    const cls = (typeof el.className === 'string' ? el.className : '').split(' ').filter(Boolean)[0];
    if (cls) tag += '.' + cls.substring(0, 20);
    return tag;
  }

  function _selectorFor(el, doc) {
    return SelectorEngine.generate(el, doc);
  }

  /** Flash highlight animation */
  function flashHighlight(el) {
    if (!el) return;
    const orig = el.style.outline;
    const origT = el.style.transition;
    el.style.transition = 'outline 0.2s ease';
    el.style.outline = '3px solid #1A1A1A';
    setTimeout(() => {
      el.style.outline = '3px solid rgba(0,0,0,0.15)';
      setTimeout(() => {
        el.style.outline = '3px solid #1A1A1A';
        setTimeout(() => { el.style.outline = orig; el.style.transition = origT; }, 300);
      }, 300);
    }, 300);
  }

  // ── Debounced change emit ─────────────────────────────────────────────────
  function _scheduleEmitChange() {
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      _debounceTimer = null;
      emit('change', { changes: _changes, count: _changes.length });
    }, 100);
  }

  // ── Selected element read helpers ─────────────────────────────────────────
  function getSelectedEl() { return _selectedEl; }
  function getSelectedEls() { return _selectedEls.slice(); }

  /** Clear multi-select (e.g. on Escape) */
  function clearMultiSelect() {
    try {
      const doc = _iframeDoc();
      if (doc) doc.querySelectorAll('[data-edit-selected]').forEach(el => el.removeAttribute('data-edit-selected'));
    } catch {}
    _selectedEl = null;
    _selectedEls = [];
    emit('deselect', null);
  }

  /** Check if element has direct text node children (not just nested elements) */
  function _hasDirectTextNode(el) {
    for (const child of el.childNodes) {
      if (child.nodeType === 3 && child.textContent.trim().length > 0) return true;
    }
    return false;
  }

  function readSelectedStyles() {
    const el = _selectedEl;
    if (!el) return null;
    const win = _iframe ? _iframe.contentWindow : null;
    if (!win) return null;
    try {
      var cs = win.getComputedStyle(el);
    } catch (e) {
      console.warn('[EditorCore] getComputedStyle failed:', e);
      return null;
    }

    // Helper: build {inline, computed, isInline} triple
    function prop(cssProp, inlineKey) {
      const inlineKey2 = inlineKey || cssProp;
      const inline = el.style[inlineKey2] || null;
      const computed = cs[cssProp] || '';
      return { inline, computed, isInline: !!inline };
    }

    // Bug Fix 3: X/Y — prefer inline left/top; disable for static position
    const position = el.style.position || cs.position || 'static';
    const isPositioned = position !== 'static';
    const xInline = isPositioned ? (el.style.left || null) : null;
    const yInline = isPositioned ? (el.style.top || null) : null;
    const xComputed = isPositioned ? cs.left : '';
    const yComputed = isPositioned ? cs.top : '';

    // Bug Fix 2: W/H — prefer inline style value (auto/% etc), fallback computed
    const wInline = el.style.width || null;
    const hInline = el.style.height || null;

    return {
      // ── Layout ───────────────────────────────────────────────────
      display:              prop('display'),
      position:             prop('position'),
      x: {
        inline: xInline, computed: xComputed,
        isInline: !!xInline, isPositioned,
      },
      y: {
        inline: yInline, computed: yComputed,
        isInline: !!yInline, isPositioned,
      },
      width: {
        inline: wInline,
        computed: cs.width,
        isInline: !!wInline,
      },
      height: {
        inline: hInline,
        computed: cs.height,
        isInline: !!hInline,
      },
      margin:               prop('margin'),
      marginTop:            prop('marginTop'),
      marginRight:          prop('marginRight'),
      marginBottom:         prop('marginBottom'),
      marginLeft:           prop('marginLeft'),
      padding:              prop('padding'),
      paddingTop:           prop('paddingTop'),
      paddingRight:         prop('paddingRight'),
      paddingBottom:        prop('paddingBottom'),
      paddingLeft:          prop('paddingLeft'),
      flexDirection:        prop('flexDirection'),
      flexWrap:             prop('flexWrap'),
      justifyContent:       prop('justifyContent'),
      alignItems:           prop('alignItems'),
      gap:                  prop('gap'),
      alignSelf:            prop('alignSelf'),
      gridTemplateColumns:  prop('gridTemplateColumns'),
      gridTemplateRows:     prop('gridTemplateRows'),
      // ── Appearance ───────────────────────────────────────────────
      backgroundColor:      prop('backgroundColor'),
      backgroundImage:      prop('backgroundImage'),
      opacity:              prop('opacity'),
      borderRadius:         prop('borderRadius'),
      borderTopLeftRadius:     prop('borderTopLeftRadius'),
      borderTopRightRadius:    prop('borderTopRightRadius'),
      borderBottomLeftRadius:  prop('borderBottomLeftRadius'),
      borderBottomRightRadius: prop('borderBottomRightRadius'),
      border:               prop('border'),
      borderColor:          prop('borderColor'),
      borderWidth:          prop('borderWidth'),
      borderStyle:          prop('borderStyle'),
      borderTopWidth:       prop('borderTopWidth'),
      borderRightWidth:     prop('borderRightWidth'),
      borderBottomWidth:    prop('borderBottomWidth'),
      borderLeftWidth:      prop('borderLeftWidth'),
      boxShadow:            prop('boxShadow'),
      overflow:             prop('overflow'),
      // ── Typography ───────────────────────────────────────────────
      color:                prop('color'),
      fontFamily:           prop('fontFamily'),
      fontSize:             prop('fontSize'),
      fontWeight:           prop('fontWeight'),
      lineHeight:           prop('lineHeight'),
      letterSpacing:        prop('letterSpacing'),
      textAlign:            prop('textAlign'),
      textDecoration:       prop('textDecoration'),
      textTransform:        prop('textTransform'),
      // ── Meta (non-style) ─────────────────────────────────────────
      tagName:  el.tagName ? el.tagName.toLowerCase() : '',
      textContent: el.textContent ? el.textContent.trim().substring(0, 200) : '',
      isImg:    el.tagName === 'IMG',
      hasBgImage: ((el.style.backgroundImage || cs.backgroundImage) || '').includes('url('),
      // ── Parent context ───────────────────────────────────────────
      parentDisplay:  (() => {
        try {
          const p = el.parentElement;
          if (!p) return '';
          return win.getComputedStyle(p).display || '';
        } catch { return ''; }
      })(),
      parentPosition: (() => {
        try {
          const p = el.parentElement;
          if (!p) return '';
          return win.getComputedStyle(p).position || '';
        } catch { return ''; }
      })(),

      // ── Traits (boolean feature flags) ────────────────────────────
      traits: (() => {
        const tagName = (el.tagName || '').toLowerCase();
        const display = (el.style.display || cs.display || '').toLowerCase();
        const pos = (el.style.position || cs.position || 'static').toLowerCase();
        const TEXT_TAGS = ['p','span','h1','h2','h3','h4','h5','h6',
          'a','label','button','li','td','th','caption','dt','dd',
          'blockquote','cite','em','strong','small','code','pre'];

        let parentDisplay = '';
        try {
          const p = el.parentElement;
          if (p) parentDisplay = (win.getComputedStyle(p).display || '').toLowerCase();
        } catch {}

        // 黑名单：这些元素不支持背景图
        const BG_IMAGE_BLACKLIST = [
          'BR','HR','SCRIPT','STYLE','LINK','META','HEAD','TITLE',
          'SVG','PATH','CIRCLE','RECT','LINE','POLYGON','POLYLINE','ELLIPSE','G','DEFS','USE','CLIPPATH','MASK','SYMBOL',
          'IFRAME','VIDEO','AUDIO','CANVAS','SOURCE','TRACK',
          'INPUT','TEXTAREA','SELECT','OPTION','OPTGROUP',
          'IMG', // IMG 走 src 逻辑，不走 background-image
        ];
        const hasBgImage = ((el.style.backgroundImage || cs.backgroundImage) || '').includes('url(');

        return {
          isContainer:  el.children.length > 0,
          isFlex:       display === 'flex' || display === 'inline-flex',
          isGrid:       display === 'grid' || display === 'inline-grid',
          isFlexChild:  parentDisplay === 'flex' || parentDisplay === 'inline-flex',
          isGridChild:  parentDisplay === 'grid' || parentDisplay === 'inline-grid',
          isPositioned: pos !== 'static',
          isAbsolute:   pos === 'absolute' || pos === 'fixed',
          isText:       TEXT_TAGS.includes(tagName) || _hasDirectTextNode(el),
          isImage:      el.tagName === 'IMG' || hasBgImage,
          canHaveBgImage: !BG_IMAGE_BLACKLIST.includes(el.tagName),
        };
      })(),
    };
  }

  /** Apply position/size dimension property (left/top/width/height) */
  function applyDimension(prop, value) {
    const el = _selectedEl;
    if (!el) return;
    const cmd = UndoStack.capture(el, 'style', 'cssText', null, _iframeDoc());
    // Record INLINE style as oldValue (empty string = was not set inline)
    const _oldInline = el.style[prop] || '';
    el.style[prop] = value;
    cmd.newValue = el.style.cssText;
    UndoStack.record(cmd);
    _trackChange(el, prop, value, _oldInline, 'style');
    _scheduleEmitChange();
  }

  // ── Public ────────────────────────────────────────────────────────────────
  return {
    init,
    on, off, emit,
    enterEditMode, exitEditMode, isEditing,
    applyColor, applyStyleProp, applyText,
    applyImage, applyImageFit, removeImage,
    deleteElement,
    startInlineEdit, commitInlineEdit, isInlineEditing,
    getChanges, clearChanges, trackChange: _trackChange,
    isModifiedByUser: function (el) { return _modifiedElements.has(el); },
    getSelectedEl, readSelectedStyles,
    getSelectedEls, clearMultiSelect,
    applyDimension,
    flashHighlight,
    _selectorFor,
  };
}());
