/**
 * resize-handles.js — Figma-style 8-anchor resize handles
 *
 * Shows 8 resize handles around the selected element.
 * Dragging a handle changes the element's width/height/position
 * to fixed pixel values and records a single undo entry.
 *
 * Public API:
 *   ResizeHandles.init(iframe)
 *   ResizeHandles.show(el)      — show handles for element
 *   ResizeHandles.hide()        — hide all handles
 *   ResizeHandles.refresh()     — redraw at current position
 */
'use strict';

window.ResizeHandles = (function () {
  const HANDLE_SIZE  = 8;   // px, size of each handle square
  const HANDLE_COLOR = '#009CFF';
  const HANDLE_FILL  = '#fff';
  const MIN_SIZE     = 4;   // minimum element size in px

  let _iframe     = null;
  let _svgEl      = null;   // SVG overlay element
  let _selectedEl = null;   // current iframe element
  let _handles    = [];     // array of SVG rect elements
  let _sizeLabel  = null;   // SVG group: real-time size badge during drag

  // Active drag state
  let _dragging   = false;
  let _dragType   = null;   // 'n','s','e','w','ne','nw','se','sw'
  let _startX     = 0;
  let _startY     = 0;
  let _startRect  = null;   // element's original bounding rect (shell coords)
  let _origStyle  = null;   // snapshot of style before drag
  let _undoCmd    = null;   // undo command captured before drag
  let _aspectRatio     = null; // captured at drag start for shift-constrained resize
  let _shiftConstrained    = false;

  // Fix Bug 2D: snapshot of computed left/top at drag start (not re-read each frame)
  let _startComputedLeft = 0;
  let _startComputedTop  = 0;

  // Scroll-drift fix: handled by shell.js unified RAF scheduler

  // ── Init ──────────────────────────────────────────────────────────────────
  function init(iframe) {
    _iframe = iframe;

    // Create dedicated SVG overlay for handles (sits above guides-select, below panels)
    _svgEl = document.getElementById('resize-handles-overlay');
    if (!_svgEl) {
      _svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      _svgEl.id = 'resize-handles-overlay';
      _svgEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;';
      // z-index: between guides-select (9020) and guides-alt (9030)
      const zVal = getComputedStyle(document.documentElement)
        .getPropertyValue('--pe-z-handles').trim() || '9025';
      _svgEl.style.zIndex = zVal;
      document.body.appendChild(_svgEl);
    }

    // Scroll drift is handled by shell.js unified RAF scheduler
    // which calls ResizeHandles.refresh() on each scroll tick.
  }

  // ── Scroll handler (RAF-throttled) ────────────────────────────────────────
  // NOTE: scroll event is now dispatched by shell.js (unified RAF scheduler).
  // This function is kept as a no-op placeholder so shell.js can call
  // ResizeHandles.refresh() directly.

  // ── Fix Bug 2C: force-cleanup any in-progress drag (defensive guard) ──────
  function _forceCleanupDrag() {
    if (!_dragging) return;
    _dragging = false;

    window.removeEventListener('mousemove', _onDragMove);
    window.removeEventListener('mouseup',   _onDragUp);

    const iframeWin = _iframe && _iframe.contentWindow;
    if (iframeWin) {
      // Must match the capture:true flag used in _onHandleMouseDown
      iframeWin.removeEventListener('mousemove', _onDragMove, true);
      iframeWin.removeEventListener('mouseup',   _onDragUp,   true);
    }

    _dragType          = null;
    _undoCmd           = null;
    _origStyle         = null;
    _startRect         = null;
    _startComputedLeft = 0;
    _startComputedTop  = 0;
  }

  // ── Public: show handles for element ─────────────────────────────────────
  function show(el) {
    _forceCleanupDrag();   // Bug 2C: cancel any stale drag before switching element
    _selectedEl = el || null;
    _redraw();
  }

  // ── Public: hide handles ──────────────────────────────────────────────────
  function hide() {
    _forceCleanupDrag();   // Bug 2C: cancel any stale drag
    _selectedEl = null;
    _clearSvg();
  }

  // ── Public: refresh at current element position ───────────────────────────
  function refresh() {
    _redraw();
  }

  // ── Public: instantly hide handles during scroll (avoids lag/drift) ────────
  // Does NOT clear _selectedEl so refresh() can restore handles after scroll.
  function hideForScroll() {
    _clearSvg();
  }

  // ── Internal: clear SVG ───────────────────────────────────────────────────
  function _clearSvg() {
    if (!_svgEl) return;
    while (_svgEl.firstChild) _svgEl.removeChild(_svgEl.firstChild);
    _handles = [];
    _sizeLabel = null;
  }

  // ── Internal: draw/update the size badge below the element ───────────────
  function _drawSizeLabel(rectShell, w, h) {
    if (!_svgEl) return;

    const text = Math.round(w) + ' × ' + Math.round(h);

    // Reuse existing label group or create a new one
    if (_sizeLabel) {
      const t = _sizeLabel.querySelector('text');
      if (t) t.textContent = text;
      // Reposition
      const BADGE_H = 18, BADGE_PAD = 8, GAP = 8;
      const approxW = text.length * 6.5 + BADGE_PAD * 2;
      const cx = rectShell.left + rectShell.width / 2;
      const cy = rectShell.bottom + GAP;
      const rect = _sizeLabel.querySelector('rect');
      if (rect) {
        rect.setAttribute('x', cx - approxW / 2);
        rect.setAttribute('y', cy);
        rect.setAttribute('width', approxW);
      }
      if (t) {
        t.setAttribute('x', cx);
        t.setAttribute('y', cy + BADGE_H / 2 + 4);
      }
      return;
    }

    const BADGE_H = 18, BADGE_PAD = 8, GAP = 8;
    const approxW = text.length * 6.5 + BADGE_PAD * 2;
    const cx = rectShell.left + rectShell.width / 2;
    const cy = rectShell.bottom + GAP;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', cx - approxW / 2);
    bg.setAttribute('y', cy);
    bg.setAttribute('width', approxW);
    bg.setAttribute('height', BADGE_H);
    bg.setAttribute('rx', '4');
    bg.setAttribute('fill', HANDLE_COLOR);

    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', cx);
    t.setAttribute('y', cy + BADGE_H / 2 + 4);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('fill', '#fff');
    t.setAttribute('font-size', '11');
    t.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
    t.setAttribute('font-weight', '500');
    t.setAttribute('letter-spacing', '0.3');
    t.setAttribute('pointer-events', 'none');
    t.textContent = text;

    g.appendChild(bg);
    g.appendChild(t);
    g.style.pointerEvents = 'none';

    _svgEl.appendChild(g);
    _sizeLabel = g;
  }

  // ── Internal: (re)draw handles ────────────────────────────────────────────
  function _redraw() {
    _clearSvg();
    if (!_selectedEl || !_iframe || !_svgEl) return;

    const iframeBox = _iframe.getBoundingClientRect();
    const r = _selectedEl.getBoundingClientRect();
    if (r.width < MIN_SIZE || r.height < MIN_SIZE) return;

    const rect = {
      left:   r.left   + iframeBox.left,
      top:    r.top    + iframeBox.top,
      right:  r.right  + iframeBox.left,
      bottom: r.bottom + iframeBox.top,
      width:  r.width,
      height: r.height,
    };

    // 4 corner anchors only
    const hs = HANDLE_SIZE;

    const anchors = [
      { type: 'nw', x: rect.left,  y: rect.top,    cursor: 'nw-resize' },
      { type: 'ne', x: rect.right, y: rect.top,    cursor: 'ne-resize' },
      { type: 'se', x: rect.right, y: rect.bottom, cursor: 'se-resize' },
      { type: 'sw', x: rect.left,  y: rect.bottom, cursor: 'sw-resize' },
    ];

    anchors.forEach(a => {
      const rect_el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect_el.setAttribute('x',      a.x - hs / 2);
      rect_el.setAttribute('y',      a.y - hs / 2);
      rect_el.setAttribute('width',  hs);
      rect_el.setAttribute('height', hs);
      rect_el.setAttribute('rx', '1');
      rect_el.setAttribute('fill',         HANDLE_FILL);
      rect_el.setAttribute('stroke',       HANDLE_COLOR);
      rect_el.setAttribute('stroke-width', '1.5');
      rect_el.style.pointerEvents = 'all';
      rect_el.style.cursor = a.cursor;

      rect_el.addEventListener('mousedown', (e) => _onHandleMouseDown(e, a.type));
      _svgEl.appendChild(rect_el);
      _handles.push(rect_el);
    });
  }

  // ── Drag: mousedown on a handle ───────────────────────────────────────────
  function _onHandleMouseDown(e, type) {
    if (!_selectedEl || !_iframe) return;
    e.preventDefault();
    e.stopPropagation();

    _dragging  = true;
    _dragType  = type;

    // _startX/_startY are in shell (outer window) coordinates.
    // Mousedown fires on the SVG overlay which lives in the shell, so
    // e.clientX/Y are already shell coords — no translation needed.
    _startX    = e.clientX;
    _startY    = e.clientY;

    // Snapshot the element's current bounding rect in shell coords
    const iframeBox = _iframe.getBoundingClientRect();
    const r = _selectedEl.getBoundingClientRect();
    _startRect = {
      left:   r.left   + iframeBox.left,
      top:    r.top    + iframeBox.top,
      right:  r.right  + iframeBox.left,
      bottom: r.bottom + iframeBox.top,
      width:  r.width,
      height: r.height,
    };

    // Fix Bug 2D: capture computed left/top ONCE at drag start
    if (_iframe.contentWindow) {
      const cs = _iframe.contentWindow.getComputedStyle(_selectedEl);
      const pos = cs.position;
      if (pos === 'absolute' || pos === 'fixed' || pos === 'sticky') {
        _startComputedLeft = parseFloat(cs.left) || 0;
        _startComputedTop  = parseFloat(cs.top)  || 0;
      }
    }

    // Capture undo state before drag
    const iframeDoc = _iframe.contentDocument || _iframe.contentWindow.document;
    if (window.UndoStack && iframeDoc) {
      _undoCmd = UndoStack.capture(_selectedEl, 'style', 'cssText', null, iframeDoc);
    }
    _origStyle = _selectedEl.style.cssText;

    // Capture aspect ratio at drag start for Shift-constrained proportional resize
    _aspectRatio = (_startRect.width > 0) ? _startRect.width / _startRect.height : null;

    // Clear hover outline — don't show hover on other elements during drag
    if (window.Guides) Guides.clearHover();

    // Hide properties panel during resize drag
    if (window.PropertiesPanel) PropertiesPanel.hide();

    // Bind drag/up to shell window
    window.addEventListener('mousemove', _onDragMove);
    window.addEventListener('mouseup',   _onDragUp);

    // Fix Bug 2A: use capture:true on iframe window so events arrive BEFORE
    // editor-core's _blockHandler (which runs at document-level capture and
    // calls stopPropagation, swallowing bubble-phase listeners).
    const iframeWin = _iframe.contentWindow;
    if (iframeWin) {
      iframeWin.addEventListener('mousemove', _onDragMove, true);
      iframeWin.addEventListener('mouseup',   _onDragUp,   true);
    }
  }

  // ── Drag: mousemove ───────────────────────────────────────────────────────
  function _onDragMove(e) {
    if (!_dragging || !_selectedEl) return;

    // Fix Bug 2B: normalize coordinates to shell (outer window) space.
    // When the event comes from the iframe window, e.clientX/Y are in the
    // iframe's viewport — add the iframe's offset to convert to shell coords.
    let clientX = e.clientX;
    let clientY = e.clientY;
    if (e.view !== window && _iframe) {
      const iframeBox = _iframe.getBoundingClientRect();
      clientX += iframeBox.left;
      clientY += iframeBox.top;
    }

    const dx = clientX - _startX;
    const dy = clientY - _startY;

    // Check if Shift is held for aspect-ratio-constrained (proportional) resize
    _shiftConstrained = e.shiftKey;

    // Compute new dimensions based on handle type
    let newWidth  = _startRect.width;
    let newHeight = _startRect.height;

    const type = _dragType;

    // Horizontal
    if (type === 'w' || type === 'nw' || type === 'sw') {
      newWidth  = Math.max(MIN_SIZE, _startRect.width  - dx);
    } else if (type === 'e' || type === 'ne' || type === 'se') {
      newWidth  = Math.max(MIN_SIZE, _startRect.width  + dx);
    }

    // Vertical
    if (type === 'n' || type === 'nw' || type === 'ne') {
      newHeight = Math.max(MIN_SIZE, _startRect.height - dy);
    } else if (type === 's' || type === 'sw' || type === 'se') {
      newHeight = Math.max(MIN_SIZE, _startRect.height + dy);
    }

    // ── Shift-constrained proportional resize ────────────────────────
    // When holding Shift, lock to the original aspect ratio.
    // Use the larger absolute change (dx or dy) as the driving axis
    // so dragging feels natural regardless of which direction you pull.
    if (_shiftConstrained && _aspectRatio !== null && _aspectRatio > 0) {
      // Determine which dimension changed more (driving axis)
      var wDelta = Math.abs(newWidth - _startRect.width);
      var hDelta = Math.abs(newHeight - _startRect.height);

      // For corner handles: use the larger delta as driver
      // For edge handles (w/e/n/s): use the moving dimension as driver,
      //   then compute the other from aspect ratio
      var isCornerHandle = (type === 'nw' || type === 'ne' || type === 'sw' || type === 'se');

      if (isCornerHandle) {
        if (wDelta >= hDelta) {
          // Width drives — derive height from width
          newHeight = newWidth / _aspectRatio;
        } else {
          // Height drives — derive width from height
          newWidth = newHeight * _aspectRatio;
        }
      } else {
        // Edge handles: only one dimension moves freely, other is derived
        if (type === 'e' || type === 'w') {
          newHeight = newWidth / _aspectRatio;
        } else { // n or s
          newWidth = newHeight * _aspectRatio;
        }
      }

      // Clamp both dimensions to minimum
      newWidth  = Math.max(MIN_SIZE, newWidth);
      newHeight = Math.max(MIN_SIZE, newHeight);
    }

    // Apply as fixed px values via inline style
    _selectedEl.style.width    = Math.round(newWidth)  + 'px';
    _selectedEl.style.height   = Math.round(newHeight) + 'px';
    _selectedEl.style.boxSizing = 'border-box';

    // Adjust top/left for handles that move the origin (w, n, nw, ne, sw corners)
    if (type === 'w' || type === 'nw' || type === 'sw' ||
        type === 'n' || type === 'ne') {
      if (_iframe.contentWindow) {
        const cs = _iframe.contentWindow.getComputedStyle(_selectedEl);
        const pos = cs.position;
        if (pos === 'absolute' || pos === 'fixed' || pos === 'sticky') {
          // Fix Bug 2D: use snapshot values, not live computed values
          if (type === 'w' || type === 'nw' || type === 'sw') {
            _selectedEl.style.left = Math.round(_startComputedLeft + dx) + 'px';
          }
          if (type === 'n' || type === 'nw' || type === 'ne') {
            _selectedEl.style.top  = Math.round(_startComputedTop  + dy) + 'px';
          }
        }
      }
    }

    // Redraw handles at new position + update select guide outline
    _redraw();
    if (window.Guides) Guides.showSelect(_selectedEl);

    // Draw/update the real-time size badge below the element
    if (_svgEl && _selectedEl && _iframe) {
      const iframeBox2 = _iframe.getBoundingClientRect();
      const r2 = _selectedEl.getBoundingClientRect();
      const rs = {
        left:   r2.left   + iframeBox2.left,
        top:    r2.top    + iframeBox2.top,
        right:  r2.right  + iframeBox2.left,
        bottom: r2.bottom + iframeBox2.top,
        width:  r2.width,
        height: r2.height,
      };
      _drawSizeLabel(rs, r2.width, r2.height);
    }
  }

  // ── Drag: mouseup ─────────────────────────────────────────────────────────
  function _onDragUp(e) {
    if (!_dragging) return;
    _dragging = false;

    window.removeEventListener('mousemove', _onDragMove);
    window.removeEventListener('mouseup',   _onDragUp);

    // Must match capture:true used in _onHandleMouseDown
    const iframeWin = _iframe && _iframe.contentWindow;
    if (iframeWin) {
      iframeWin.removeEventListener('mousemove', _onDragMove, true);
      iframeWin.removeEventListener('mouseup',   _onDragUp,   true);
    }

    // Clear any hover highlights that accumulated during drag (they were suppressed visually
    // but data-edit-hover attribute may have been set before drag started)
    if (_iframe && _iframe.contentDocument) {
      try {
        _iframe.contentDocument.querySelectorAll('[data-edit-hover]')
          .forEach(n => n.removeAttribute('data-edit-hover'));
      } catch (_) {}
    }
    if (window.Guides) Guides.clearHover();

    // Record undo if style actually changed
    if (_undoCmd && window.UndoStack && _selectedEl) {
      if (_selectedEl.style.cssText !== _origStyle) {
        UndoStack.record(_undoCmd);
        // Track individual property changes so they appear in the save list
        if (window.EditorCore) {
          const w = _selectedEl.style.width;
          const h = _selectedEl.style.height;
          if (w) EditorCore.trackChange(_selectedEl, 'width',  w, null, 'style');
          if (h) EditorCore.trackChange(_selectedEl, 'height', h, null, 'style');
          // Also track left/top if they were moved (origin-anchored drags)
          const sl = _selectedEl.style.left;
          const st = _selectedEl.style.top;
          if (sl) EditorCore.trackChange(_selectedEl, 'left', sl, null, 'style');
          if (st) EditorCore.trackChange(_selectedEl, 'top',  st, null, 'style');
          EditorCore.emit('change', { count: UndoStack.count() });
        }
      }
    }

    _undoCmd           = null;
    _origStyle         = null;
    _startRect         = null;
    _startComputedLeft = 0;
    _startComputedTop  = 0;

    // Final redraw (clears size badge since _dragging is false)
    _redraw();

    // Restore properties panel after resize drag ends
    if (window.PropertiesPanel && window.EditorCore && _selectedEl) {
      const iframeBox = _iframe && _iframe.getBoundingClientRect();
      if (iframeBox) {
        const r = _selectedEl.getBoundingClientRect();
        const screenRect = {
          left:   r.left   + iframeBox.left,
          top:    r.top    + iframeBox.top,
          right:  r.right  + iframeBox.left,
          bottom: r.bottom + iframeBox.top,
          width:  r.width,
          height: r.height,
        };
        PropertiesPanel.show(screenRect);
      }
    }
  }

  function isDragging() { return _dragging; }

  return { init, show, hide, refresh, hideForScroll, isDragging };
}());
