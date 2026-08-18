/**
 * flex-overlay.js — On-demand layout property visualization
 *
 * Instead of showing all padding/gap regions on select, only shows
 * the specific region being edited. Auto-hides after a timeout.
 *
 * Public API:
 *   FlexOverlay.init(iframe)
 *   FlexOverlay.showProperty(property)  — show overlay for a specific property being edited
 *   FlexOverlay.hide()                  — remove overlay immediately
 */
'use strict';

window.FlexOverlay = (function () {
  let _iframe     = null;
  let _svg        = null;
  let _hideTimer  = null;

  // Colors — stroke only, no fill
  const PADDING_STROKE = 'rgba(255, 100, 180, 0.7)';
  const GAP_STROKE     = 'rgba(180, 100, 255, 0.7)';
  const MARGIN_STROKE  = 'rgba(255, 160, 60, 0.7)';
  const LABEL_BG_PAD   = 'rgba(255, 100, 180, 0.85)';
  const LABEL_BG_GAP   = 'rgba(180, 100, 255, 0.85)';
  const LABEL_BG_MAR   = 'rgba(255, 160, 60, 0.85)';
  const LABEL_TEXT      = '#fff';

  const AUTO_HIDE_MS = 1500;

  // Property → category mapping
  const PROP_MAP = {
    // Padding
    paddingTop:    'padding', paddingRight: 'padding', paddingBottom: 'padding', paddingLeft: 'padding',
    'pp-pad-h':    'padding', 'pp-pad-v':  'padding',
    'pp-pl':       'padding', 'pp-pt':     'padding', 'pp-pr': 'padding', 'pp-pb': 'padding',
    // Margin
    marginTop:     'margin', marginRight: 'margin', marginBottom: 'margin', marginLeft: 'margin',
    'pp-margin-h': 'margin', 'pp-margin-v': 'margin',
    'pp-ml':       'margin', 'pp-mt':     'margin', 'pp-mr': 'margin', 'pp-mb': 'margin',
    // Gap
    gap:           'gap',
    'pp-gap':      'gap',
  };

  // ── Init ──────────────────────────────────────────────────────────────────
  function init(iframe) {
    _iframe = iframe;
    _svg = document.getElementById('flex-overlay');
    if (!_svg) {
      _svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      _svg.id = 'flex-overlay';
      _svg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9996;';
      document.body.appendChild(_svg);
    }
  }

  // ── Show overlay for a specific property being edited ───────────────────
  function showProperty(property) {
    if (!_svg || !_iframe) return;
    var el = window.EditorCore ? EditorCore.getSelectedEl() : null;
    if (!el) return;

    var category = PROP_MAP[property];
    if (!category) return;

    // Reset auto-hide timer
    if (_hideTimer) clearTimeout(_hideTimer);
    _hideTimer = setTimeout(hide, AUTO_HIDE_MS);

    _render(el, category);
  }

  // ── Hide overlay ─────────────────────────────────────────────────────────
  function hide() {
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
    _clearSvg();
  }

  function _clearSvg() {
    if (!_svg) return;
    while (_svg.firstChild) _svg.removeChild(_svg.firstChild);
  }

  // ── Main render for a specific category ─────────────────────────────────
  function _render(el, category) {
    _clearSvg();
    if (!el || !_iframe) return;

    var win = _iframe.contentWindow;
    if (!win) return;
    var cs = win.getComputedStyle(el);
    var iframeRect = _iframe.getBoundingClientRect();
    var elRect = el.getBoundingClientRect();

    var box = {
      left:   elRect.left   + iframeRect.left,
      top:    elRect.top    + iframeRect.top,
      right:  elRect.right  + iframeRect.left,
      bottom: elRect.bottom + iframeRect.top,
      width:  elRect.width,
      height: elRect.height,
    };

    var pt = parseFloat(cs.paddingTop)    || 0;
    var pr = parseFloat(cs.paddingRight)  || 0;
    var pb = parseFloat(cs.paddingBottom) || 0;
    var pl = parseFloat(cs.paddingLeft)   || 0;

    if (category === 'padding') {
      _drawPaddingRegions(box, pt, pr, pb, pl);
    } else if (category === 'gap') {
      var display = cs.display;
      if (display === 'flex' || display === 'inline-flex') {
        var dir = cs.flexDirection || 'row';
        _drawFlexGaps(box, cs, dir, pt, pr, pb, pl);
      } else if (display === 'grid' || display === 'inline-grid') {
        _drawGridGaps(box, cs, pt, pr, pb, pl);
      }
    } else if (category === 'margin') {
      _drawMarginRegions(box, el, iframeRect);
    }
  }

  // ── Padding regions (stroke only) ────────────────────────────────────────
  function _drawPaddingRegions(box, pt, pr, pb, pl) {
    if (pt > 0) _appendRegion(box.left + pl, box.top, box.width - pl - pr, pt, PADDING_STROKE, Math.round(pt) + 'px', LABEL_BG_PAD);
    if (pb > 0) _appendRegion(box.left + pl, box.bottom - pb, box.width - pl - pr, pb, PADDING_STROKE, Math.round(pb) + 'px', LABEL_BG_PAD);
    if (pl > 0) _appendRegion(box.left, box.top, pl, box.height, PADDING_STROKE, Math.round(pl) + 'px', LABEL_BG_PAD);
    if (pr > 0) _appendRegion(box.right - pr, box.top, pr, box.height, PADDING_STROKE, Math.round(pr) + 'px', LABEL_BG_PAD);
  }

  // ── Margin regions (stroke only) ─────────────────────────────────────────
  function _drawMarginRegions(box, el, iframeRect) {
    var win = _iframe.contentWindow;
    var cs = win.getComputedStyle(el);
    var mt = parseFloat(cs.marginTop)    || 0;
    var mr = parseFloat(cs.marginRight)  || 0;
    var mb = parseFloat(cs.marginBottom) || 0;
    var ml = parseFloat(cs.marginLeft)   || 0;

    if (mt > 0) _appendRegion(box.left, box.top - mt, box.width, mt, MARGIN_STROKE, Math.round(mt) + 'px', LABEL_BG_MAR);
    if (mb > 0) _appendRegion(box.left, box.bottom, box.width, mb, MARGIN_STROKE, Math.round(mb) + 'px', LABEL_BG_MAR);
    if (ml > 0) _appendRegion(box.left - ml, box.top - mt, ml, box.height + mt + mb, MARGIN_STROKE, Math.round(ml) + 'px', LABEL_BG_MAR);
    if (mr > 0) _appendRegion(box.right, box.top - mt, mr, box.height + mt + mb, MARGIN_STROKE, Math.round(mr) + 'px', LABEL_BG_MAR);
  }

  // ── Flex gap regions ────────────────────────────────────────────────────
  function _drawFlexGaps(box, cs, dir, pt, pr, pb, pl) {
    var el = window.EditorCore ? EditorCore.getSelectedEl() : null;
    if (!el) return;
    var children = Array.from(el.children).filter(function (c) {
      return _iframe.contentWindow.getComputedStyle(c).display !== 'none';
    });
    if (children.length < 2) return;

    var isRow = !dir.includes('column');
    // Use the correct CSS gap value for each direction:
    // row direction → columnGap (horizontal spacing between columns)
    // column direction → rowGap (vertical spacing between rows)
    var colGapVal = parseFloat(cs.columnGap) || 0;
    var rowGapVal = parseFloat(cs.rowGap) || 0;
    var labelGap  = isRow ? colGapVal : rowGapVal;
    if (labelGap <= 0) return;

    var labelText = Math.round(labelGap) + 'px';
    var iframeRect = _iframe.getBoundingClientRect();

    for (var i = 0; i < children.length - 1; i++) {
      var curr = children[i].getBoundingClientRect();
      var next = children[i + 1].getBoundingClientRect();

      var currR = { left: curr.left + iframeRect.left, top: curr.top + iframeRect.top, right: curr.right + iframeRect.left, bottom: curr.bottom + iframeRect.top };
      var nextR = { left: next.left + iframeRect.left, top: next.top + iframeRect.top, right: next.right + iframeRect.left, bottom: next.bottom + iframeRect.top };

      if (isRow) {
        // Skip if children wrapped to a new line (not on the same row)
        if (Math.abs(nextR.top - currR.top) > curr.height / 2) continue;
        var gapLeft = currR.right;
        var gapW = nextR.left - gapLeft;
        if (gapW < 1) continue;
        var gapTop = box.top + pt;
        var gapH = box.bottom - pb - gapTop;
        _appendRegion(gapLeft, gapTop, gapW, gapH, GAP_STROKE, labelText, LABEL_BG_GAP);
      } else {
        // Skip if children wrapped to a new column (not on the same column)
        if (Math.abs(nextR.left - currR.left) > curr.width / 2) continue;
        var gapTop2 = currR.bottom;
        var gapH2 = nextR.top - gapTop2;
        if (gapH2 < 1) continue;
        var gapLeft2 = box.left + pl;
        var gapW2 = box.right - pr - gapLeft2;
        _appendRegion(gapLeft2, gapTop2, gapW2, gapH2, GAP_STROKE, labelText, LABEL_BG_GAP);
      }
    }
  }

  // ── Grid gap regions ────────────────────────────────────────────────────
  function _drawGridGaps(box, cs, pt, pr, pb, pl) {
    var el = window.EditorCore ? EditorCore.getSelectedEl() : null;
    if (!el) return;
    var colGap = parseFloat(cs.columnGap) || 0;
    var rowGap = parseFloat(cs.rowGap)    || 0;

    var children = Array.from(el.children).filter(function (c) {
      return _iframe.contentWindow.getComputedStyle(c).display !== 'none';
    });
    if (children.length < 2) return;

    var iframeRect = _iframe.getBoundingClientRect();
    var colEnds = new Set();
    var rowEnds = new Set();

    // Convert to shell coordinates, then round for Set deduplication
    children.forEach(function (c) {
      var r = c.getBoundingClientRect();
      colEnds.add(Math.round(r.right  + iframeRect.left));
      rowEnds.add(Math.round(r.bottom + iframeRect.top));
    });

    var innerLeft   = box.left  + pl;
    var innerRight  = box.right - pr;
    var innerTop    = box.top   + pt;
    var innerBottom = box.bottom - pb;

    if (colGap > 0) {
      colEnds.forEach(function (shellX) {
        if (shellX < innerLeft || shellX > innerRight) return;
        _appendRegion(shellX, innerTop, colGap, innerBottom - innerTop, GAP_STROKE, Math.round(colGap) + 'px', LABEL_BG_GAP);
      });
    }
    if (rowGap > 0) {
      rowEnds.forEach(function (shellY) {
        if (shellY < innerTop || shellY > innerBottom) return;
        _appendRegion(innerLeft, shellY, innerRight - innerLeft, rowGap, GAP_STROKE, Math.round(rowGap) + 'px', LABEL_BG_GAP);
      });
    }
  }

  // ── SVG helpers ────────────────────────────────────────────────────────
  function _appendRegion(x, y, w, h, strokeColor, label, labelBg) {
    if (w < 1 || h < 1) return;

    // Dashed stroke rectangle, no fill
    var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', strokeColor);
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('stroke-dasharray', '3 2');
    _svg.appendChild(rect);

    // Label in center if region is large enough
    if ((w > 20 && h > 10) || (w > 10 && h > 20)) {
      _appendLabel(x + w / 2, y + h / 2, label, labelBg);
    }
  }

  function _appendLabel(cx, cy, text, bgColor) {
    if (!text) return;
    var PADDING = 3;
    var TXT_H = 13;
    var TXT_W = text.length * 6 + PADDING * 2;

    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    var bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', cx - TXT_W / 2);
    bg.setAttribute('y', cy - TXT_H / 2);
    bg.setAttribute('width', TXT_W);
    bg.setAttribute('height', TXT_H);
    bg.setAttribute('rx', '2');
    bg.setAttribute('fill', bgColor);

    var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', cx);
    t.setAttribute('y', cy);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('fill', LABEL_TEXT);
    t.setAttribute('font-size', '9');
    t.setAttribute('font-family', "'SF Mono','Consolas',monospace");
    t.textContent = text;

    g.appendChild(bg);
    g.appendChild(t);
    _svg.appendChild(g);
  }

  return { init: init, showProperty: showProperty, hide: hide };
}());
