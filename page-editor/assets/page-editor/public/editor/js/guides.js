/**
 * guides.js — Figma-style guide system
 *
 * Three features:
 *   ① Alt + hover sibling  → red lines + px labels between selected and hovered element
 *   ② Alt + hover parent   → 4 red lines + px labels from selected element to parent edges
 *   ③ Drag smart guides    → pink alignment lines when element edges/centers snap to others
 *
 * Public API:
 *   Guides.init(iframe)
 *   Guides.showForElement(screenRect, el)   — store selected element reference
 *   Guides.clear()                          — remove all guides, reset state
 *   Guides.startDrag(el)                    — enter smart-guide mode during drag
 *   Guides.updateDrag(screenRect)           — update dragging element position
 *   Guides.endDrag()                        — exit smart-guide mode
 */
'use strict';

window.Guides = (function () {
  let _svg          = null;
  let _iframe       = null;
  let _selectedEl   = null;   // the currently selected iframe element
  let _selectedRect = null;   // shell-window coords of selected element
  let _rafId        = null;
  let _enabled      = false;
  let _altDown      = false;
  let _isDragging   = false;
  let _dragEl       = null;

  // ── Init ──────────────────────────────────────────────────────────────────
  function init(iframe) {
    _iframe = iframe;
    _svg = document.getElementById('guides-overlay');
    if (!_svg) {
      _svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      _svg.id = 'guides-overlay';
      _svg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998;';
      document.body.appendChild(_svg);
    }
    _enabled = true;

    _iframe.addEventListener('mousemove', _onIframeMouseMove);
    window.addEventListener('keydown', _onKeyDown);
    window.addEventListener('keyup',   _onKeyUp);
  }

  // ── Key handling ──────────────────────────────────────────────────────────
  function _onKeyDown(e) {
    if (e.key === 'Alt') {
      e.preventDefault();
      _altDown = true;
      // Immediately draw if we have a selected element
      if (_selectedRect && _selectedEl) {
        _drawAltGuides(null); // draw parent-container distances until hover kicks in
      }
    }
  }

  function _onKeyUp(e) {
    if (e.key === 'Alt') {
      _altDown = false;
      _clearSvg();
    }
  }

  // ── Public: called by shell.js on element select ──────────────────────────
  function showForElement(rect, el) {
    // No crosshair — just store state silently
    _selectedRect = rect;
    _selectedEl   = el || null;
    // If alt is already held when we select a new element, immediately show guides
    if (_altDown && _selectedRect && _selectedEl) {
      _drawAltGuides(null);
    }
  }

  // ── Public: clear everything ──────────────────────────────────────────────
  function clear() {
    _clearSvg();
    _selectedRect = null;
    _selectedEl   = null;
  }

  function _clearSvg() {
    if (!_svg) return;
    while (_svg.firstChild) _svg.removeChild(_svg.firstChild);
  }

  // ── mousemove inside iframe ───────────────────────────────────────────────
  function _onIframeMouseMove(e) {
    if (!_enabled || !_altDown || !_selectedRect || !_selectedEl) return;
    if (_isDragging) return;
    if (_rafId) return;
    _rafId = requestAnimationFrame(() => {
      _rafId = null;
      _handleAltHover(e);
    });
  }

  function _handleAltHover(e) {
    if (!_selectedRect || !_selectedEl || !_iframe || !_svg) return;

    const iframeDoc = _iframe.contentDocument || _iframe.contentWindow.document;
    if (!iframeDoc) return;

    const hoverEl = iframeDoc.elementFromPoint(e.clientX, e.clientY);

    // Determine if hoverEl is the selected element itself
    if (!hoverEl || hoverEl === _selectedEl) {
      _drawAltGuides(null);
      return;
    }

    // Determine if hoverEl is a sibling (same parent) or ancestor/parent
    const isSibling = (
      hoverEl !== _selectedEl &&
      hoverEl.parentElement === _selectedEl.parentElement &&
      hoverEl !== iframeDoc.body &&
      hoverEl !== iframeDoc.documentElement
    );

    const isAncestor = _isAncestor(hoverEl, _selectedEl);

    if (isSibling) {
      _drawAltGuides(hoverEl);
    } else if (isAncestor || hoverEl === iframeDoc.body || hoverEl === iframeDoc.documentElement) {
      // hovering over parent/container — show parent distances
      _drawAltGuides(null);
    } else {
      // hovering over a non-sibling non-ancestor — show parent distances
      _drawAltGuides(null);
    }
  }

  function _isAncestor(ancestor, el) {
    let node = el.parentElement;
    while (node) {
      if (node === ancestor) return true;
      node = node.parentElement;
    }
    return false;
  }

  // ── Core: draw alt guides (null hoverEl = parent mode, otherwise sibling mode)
  function _drawAltGuides(hoverEl) {
    _clearSvg();
    if (!_selectedEl || !_selectedRect) return;

    const iframeBox = _iframe.getBoundingClientRect();
    const iframeDoc = _iframe.contentDocument || _iframe.contentWindow.document;
    const iframeWin = _iframe.contentWindow;
    if (!iframeDoc || !iframeWin) return;

    const selRaw  = _selectedEl.getBoundingClientRect();
    const selRect = {
      left:   selRaw.left   + iframeBox.left,
      top:    selRaw.top    + iframeBox.top,
      right:  selRaw.right  + iframeBox.left,
      bottom: selRaw.bottom + iframeBox.top,
      width:  selRaw.width,
      height: selRaw.height,
    };

    if (hoverEl) {
      // ── Mode ①: measure to sibling ────────────────────────────────────────
      const hRaw = hoverEl.getBoundingClientRect();
      const hRect = {
        left:   hRaw.left   + iframeBox.left,
        top:    hRaw.top    + iframeBox.top,
        right:  hRaw.right  + iframeBox.left,
        bottom: hRaw.bottom + iframeBox.top,
        width:  hRaw.width,
        height: hRaw.height,
      };
      _drawSelectionBox(selRect);
      _drawSelectionBox(hRect, '#FF4444', 0.5);
      _drawSiblingDistances(selRect, hRect);
    } else {
      // ── Mode ②: measure to parent container ───────────────────────────────
      const parent = _selectedEl.parentElement;
      if (!parent) return;

      const pRaw = parent.getBoundingClientRect();
      const pRect = {
        left:   pRaw.left   + iframeBox.left,
        top:    pRaw.top    + iframeBox.top,
        right:  pRaw.right  + iframeBox.left,
        bottom: pRaw.bottom + iframeBox.top,
        width:  pRaw.width,
        height: pRaw.height,
      };
      _drawSelectionBox(selRect);
      _drawParentDistances(selRect, pRect);
    }
  }

  // ── Draw a thin highlight box around an element ───────────────────────────
  function _drawSelectionBox(rect, color, opacity) {
    color   = color   || '#FF4444';
    opacity = opacity !== undefined ? opacity : 0.7;
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x',       rect.left);
    r.setAttribute('y',       rect.top);
    r.setAttribute('width',   rect.width);
    r.setAttribute('height',  rect.height);
    r.setAttribute('fill',    'none');
    r.setAttribute('stroke',  color);
    r.setAttribute('stroke-width', '1');
    r.setAttribute('opacity', opacity);
    _svg.appendChild(r);
  }

  // ── Mode ①: distances between selected element and hovered sibling ────────
  function _drawSiblingDistances(selRect, hRect) {
    // Horizontal gap
    if (hRect.left > selRect.right) {
      const gap = Math.round(hRect.left - selRect.right);
      const y   = (Math.max(selRect.top, hRect.top) + Math.min(selRect.bottom, hRect.bottom)) / 2
                  || (selRect.top + selRect.bottom) / 2;
      _appendDistLine(selRect.right, y, hRect.left, y, gap + 'px', 'h');
    } else if (selRect.left > hRect.right) {
      const gap = Math.round(selRect.left - hRect.right);
      const y   = (Math.max(selRect.top, hRect.top) + Math.min(selRect.bottom, hRect.bottom)) / 2
                  || (selRect.top + selRect.bottom) / 2;
      _appendDistLine(hRect.right, y, selRect.left, y, gap + 'px', 'h');
    } else {
      // Overlapping horizontally — show overlap distance
      const overlapL = Math.max(selRect.left, hRect.left);
      const overlapR = Math.min(selRect.right, hRect.right);
      if (overlapR > overlapL) {
        const gap = Math.round(overlapR - overlapL);
        const y   = (selRect.top + selRect.bottom) / 2;
        _appendDistLine(overlapL, y, overlapR, y, gap + 'px', 'h');
      }
    }

    // Vertical gap
    if (hRect.top > selRect.bottom) {
      const gap = Math.round(hRect.top - selRect.bottom);
      const x   = (Math.max(selRect.left, hRect.left) + Math.min(selRect.right, hRect.right)) / 2
                  || (selRect.left + selRect.right) / 2;
      _appendDistLine(x, selRect.bottom, x, hRect.top, gap + 'px', 'v');
    } else if (selRect.top > hRect.bottom) {
      const gap = Math.round(selRect.top - hRect.bottom);
      const x   = (Math.max(selRect.left, hRect.left) + Math.min(selRect.right, hRect.right)) / 2
                  || (selRect.left + selRect.right) / 2;
      _appendDistLine(x, hRect.bottom, x, selRect.top, gap + 'px', 'v');
    }
  }

  // ── Mode ②: distances from selected element to parent edges ──────────────
  function _drawParentDistances(selRect, pRect) {
    // Top
    if (selRect.top > pRect.top) {
      const gap = Math.round(selRect.top - pRect.top);
      const x   = selRect.left + selRect.width / 2;
      _appendDistLine(x, pRect.top, x, selRect.top, gap + 'px', 'v');
    }
    // Bottom
    if (pRect.bottom > selRect.bottom) {
      const gap = Math.round(pRect.bottom - selRect.bottom);
      const x   = selRect.left + selRect.width / 2;
      _appendDistLine(x, selRect.bottom, x, pRect.bottom, gap + 'px', 'v');
    }
    // Left
    if (selRect.left > pRect.left) {
      const gap = Math.round(selRect.left - pRect.left);
      const y   = selRect.top + selRect.height / 2;
      _appendDistLine(pRect.left, y, selRect.left, y, gap + 'px', 'h');
    }
    // Right
    if (pRect.right > selRect.right) {
      const gap = Math.round(pRect.right - selRect.right);
      const y   = selRect.top + selRect.height / 2;
      _appendDistLine(selRect.right, y, pRect.right, y, gap + 'px', 'h');
    }
  }

  // ── Shared: distance line + end caps + label ──────────────────────────────
  function _appendDistLine(x1, y1, x2, y2, label, dir) {
    const COLOR = '#FF4444';

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', COLOR);
    line.setAttribute('stroke-width', '1');
    _svg.appendChild(line);

    // End caps
    _appendCap(x1, y1, dir, COLOR);
    _appendCap(x2, y2, dir, COLOR);

    // Label
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const PADDING = 3;
    const TXT_H   = 14;
    const TXT_W   = label.length * 6 + PADDING * 2;

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x',      cx - TXT_W / 2);
    bg.setAttribute('y',      cy - TXT_H / 2);
    bg.setAttribute('width',  TXT_W);
    bg.setAttribute('height', TXT_H);
    bg.setAttribute('rx', '2');
    bg.setAttribute('fill',   '#fff');
    bg.setAttribute('stroke', COLOR);
    bg.setAttribute('stroke-width', '0.5');
    _svg.appendChild(bg);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', cx);
    text.setAttribute('y', cy);
    text.setAttribute('text-anchor',        'middle');
    text.setAttribute('dominant-baseline',  'middle');
    text.setAttribute('fill',        COLOR);
    text.setAttribute('font-size',   '10');
    text.setAttribute('font-family', "'SF Mono', 'Consolas', monospace");
    text.textContent = label;
    _svg.appendChild(text);
  }

  function _appendCap(x, y, dir, color) {
    const cap  = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const SIZE = 4;
    if (dir === 'h') {
      cap.setAttribute('x1', x); cap.setAttribute('y1', y - SIZE);
      cap.setAttribute('x2', x); cap.setAttribute('y2', y + SIZE);
    } else {
      cap.setAttribute('x1', x - SIZE); cap.setAttribute('y1', y);
      cap.setAttribute('x2', x + SIZE); cap.setAttribute('y2', y);
    }
    cap.setAttribute('stroke',       color || '#FF4444');
    cap.setAttribute('stroke-width', '1');
    _svg.appendChild(cap);
  }

  // ── Feature ③: Smart guides during drag ──────────────────────────────────
  function startDrag(el) {
    _isDragging = true;
    _dragEl     = el;
    _clearSvg();
  }

  function updateDrag(dragScreenRect) {
    if (!_isDragging || !_iframe || !_svg) return;
    _clearSvg();

    const iframeDoc = _iframe.contentDocument || _iframe.contentWindow.document;
    const iframeBox = _iframe.getBoundingClientRect();
    if (!iframeDoc) return;

    const SNAP_THRESHOLD = 4; // px
    const GUIDE_COLOR    = '#FF3B91'; // pink

    // Collect all sibling/nearby elements
    const candidates = _collectCandidates(iframeDoc, _dragEl);

    const guides = []; // { x | y } lines to draw

    const dragCenterX = dragScreenRect.left + dragScreenRect.width  / 2;
    const dragCenterY = dragScreenRect.top  + dragScreenRect.height / 2;

    candidates.forEach(candidate => {
      const raw = candidate.getBoundingClientRect();
      const cr = {
        left:    raw.left   + iframeBox.left,
        top:     raw.top    + iframeBox.top,
        right:   raw.right  + iframeBox.left,
        bottom:  raw.bottom + iframeBox.top,
        centerX: raw.left   + iframeBox.left + raw.width  / 2,
        centerY: raw.top    + iframeBox.top  + raw.height / 2,
      };

      // Left edges align
      if (Math.abs(dragScreenRect.left - cr.left) < SNAP_THRESHOLD)
        guides.push({ type: 'v', x: cr.left });
      // Right edges align
      if (Math.abs(dragScreenRect.right - cr.right) < SNAP_THRESHOLD)
        guides.push({ type: 'v', x: cr.right });
      // Centers align vertically (same X center)
      if (Math.abs(dragCenterX - cr.centerX) < SNAP_THRESHOLD)
        guides.push({ type: 'v', x: cr.centerX });
      // Top edges align
      if (Math.abs(dragScreenRect.top - cr.top) < SNAP_THRESHOLD)
        guides.push({ type: 'h', y: cr.top });
      // Bottom edges align
      if (Math.abs(dragScreenRect.bottom - cr.bottom) < SNAP_THRESHOLD)
        guides.push({ type: 'h', y: cr.bottom });
      // Centers align horizontally (same Y center)
      if (Math.abs(dragCenterY - cr.centerY) < SNAP_THRESHOLD)
        guides.push({ type: 'h', y: cr.centerY });
    });

    // Deduplicate and draw
    const seenV = new Set();
    const seenH = new Set();
    const vW = window.innerWidth;
    const vH = window.innerHeight;

    guides.forEach(g => {
      if (g.type === 'v' && !seenV.has(g.x)) {
        seenV.add(g.x);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', g.x); line.setAttribute('y1', 0);
        line.setAttribute('x2', g.x); line.setAttribute('y2', vH);
        line.setAttribute('stroke', GUIDE_COLOR);
        line.setAttribute('stroke-width', '1');
        line.setAttribute('opacity', '0.8');
        _svg.appendChild(line);
      } else if (g.type === 'h' && !seenH.has(g.y)) {
        seenH.add(g.y);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', 0);  line.setAttribute('y1', g.y);
        line.setAttribute('x2', vW); line.setAttribute('y2', g.y);
        line.setAttribute('stroke', GUIDE_COLOR);
        line.setAttribute('stroke-width', '1');
        line.setAttribute('opacity', '0.8');
        _svg.appendChild(line);
      }
    });
  }

  function endDrag() {
    _isDragging = false;
    _dragEl     = null;
    _clearSvg();
  }

  function _collectCandidates(iframeDoc, excludeEl) {
    var seen = new Set();
    var candidates = [];

    function _addIfVisible(el) {
      if (seen.has(el) || el === excludeEl) return;
      if (el === iframeDoc.body || el === iframeDoc.documentElement) return;
      var r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      seen.add(el);
      candidates.push(el);
    }

    // 1. Siblings — the most important alignment targets
    if (excludeEl && excludeEl.parentElement) {
      Array.from(excludeEl.parentElement.children).forEach(_addIfVisible);
    }

    // 2. Uncle/aunt elements (parent's siblings — one level up)
    if (candidates.length < 30 && excludeEl && excludeEl.parentElement && excludeEl.parentElement.parentElement) {
      Array.from(excludeEl.parentElement.parentElement.children).forEach(_addIfVisible);
    }

    // 3. Top-level layout blocks (body's direct children)
    if (candidates.length < 30) {
      Array.from(iframeDoc.body.children).forEach(_addIfVisible);
    }

    return candidates.slice(0, 60);
  }

  // ── Hover & Select overlay SVGs (separate layers) ────────────────────────
  let _hoverSvg  = null;
  let _selectSvg = null;

  function _ensureHoverSvg() {
    if (_hoverSvg) return;
    _hoverSvg = document.getElementById('guides-hover-overlay');
    if (!_hoverSvg) {
      _hoverSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      _hoverSvg.id = 'guides-hover-overlay';
      _hoverSvg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9010;';
      document.body.appendChild(_hoverSvg);
    }
  }

  function _ensureSelectSvg() {
    if (_selectSvg) return;
    _selectSvg = document.getElementById('guides-select-overlay');
    if (!_selectSvg) {
      _selectSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      _selectSvg.id = 'guides-select-overlay';
      _selectSvg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9020;';
      document.body.appendChild(_selectSvg);
    }
  }

  function _clearSvgEl(svgEl) {
    if (!svgEl) return;
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
  }

  function _drawOutlineRect(svgEl, el, color, dasharray, strokeWidth) {
    if (!svgEl || !el || !_iframe) return;
    const iframeBox = _iframe.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x',      r.left   + iframeBox.left);
    rect.setAttribute('y',      r.top    + iframeBox.top);
    rect.setAttribute('width',  r.width);
    rect.setAttribute('height', r.height);
    rect.setAttribute('fill',   'none');
    rect.setAttribute('stroke', color);
    rect.setAttribute('stroke-width', strokeWidth != null ? String(strokeWidth) : '1.5');
    if (dasharray) rect.setAttribute('stroke-dasharray', dasharray);
    svgEl.appendChild(rect);
  }

  // ── Public: hover outline (parent solid + direct children dashed) ────────
  function showHover(el) {
    _ensureHoverSvg();
    _clearSvgEl(_hoverSvg);
    if (!el) return;
    // Parent element: solid blue outline
    _drawOutlineRect(_hoverSvg, el, '#009CFF', null);
    // Direct children: dashed outline (skip zero-size / invisible children)
    if (el.children) {
      Array.from(el.children).forEach(child => {
        // Skip invisible / placeholder helper elements
        if (child.classList && child.classList.contains('placeholder-text')) return;
        const r = child.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        _drawOutlineRect(_hoverSvg, child, '#009CFF', '4 2');
      });
    }
  }

  function clearHover() {
    _clearSvgEl(_hoverSvg);
  }

  // ── Public: select outline (parent only, no children) ────────────────────
  function showSelect(el) {
    _ensureSelectSvg();
    _clearSvgEl(_selectSvg);
    if (!el) return;
    _drawOutlineRect(_selectSvg, el, '#009CFF', null, 0.75);  // half of hover's 1.5
  }

  function clearSelect() {
    _clearSvgEl(_selectSvg);
  }

  // ── Public: refresh selected-element rect after scroll ───────────────────
  function refreshPosition() {
    if (!_selectedEl || !_iframe) return;
    const iframeBox = _iframe.getBoundingClientRect();
    const r = _selectedEl.getBoundingClientRect();
    _selectedRect = {
      left:   r.left   + iframeBox.left,
      top:    r.top    + iframeBox.top,
      right:  r.right  + iframeBox.left,
      bottom: r.bottom + iframeBox.top,
      width:  r.width,
      height: r.height,
    };
    // If Alt is held, redraw guides at updated position
    if (_altDown) _drawAltGuides(null);
  }

  return { init, showForElement, clear, startDrag, updateDrag, endDrag, refreshPosition,
           showHover, clearHover, showSelect, clearSelect };
}());
