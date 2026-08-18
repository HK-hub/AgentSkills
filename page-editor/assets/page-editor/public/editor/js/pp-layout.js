/**
 * pp-layout.js — Layout section of the properties panel.
 *
 * Handles: dimensions, spacing, radius, mode switcher, 9-grid alignment,
 * wrap toggle, grid controls, reorder, W/H mode, gap, aspect ratio lock.
 *
 * Exposes: window.PPLayout
 * Depends on: window.PPHelpers, window.EditorCore, window.UndoStack
 */
'use strict';

window.PPLayout = (function () {

  // ── State ─────────────────────────────────────────────────────────────────
  var _layoutMode = 'block';
  var _origJC = 'flex-start';
  var _origAI = 'stretch';
  var _jcDistribution = 'packed';
  var _aspectLocked = false;
  var _aspectRatio = 1;
  var _MODE_LABELS = { fixed: 'Fixed', hug: 'Hug', fill: 'Fill' };
  var _lastPopulateEl = null;

  // Injected reference to _openDropdown from the main properties-panel module
  var _openDropdownFn = null;

  var _jcSelect = null; // custom dropdown for justify-content

  var _orderSelect = null; // custom dropdown for order number

  // ── Init ──────────────────────────────────────────────────────────────────
  function init(openDropdownFn) {
    _openDropdownFn = openDropdownFn;
    _bindDimensions();
    _bindSpacing();
    _bindRadiusToggle();
    _bindOrderSection();
    _bindWhMode();
    _bindModeSwitcher();
    _bindAutoLayout();
    _bindWrapToggle();
    _bindJcDropdown();
    _bindGridControls();
  }

  // ── Populate ──────────────────────────────────────────────────────────────
  function populate(s, isNewElement) {
    var _val = PPHelpers.val;
    var _setInput = PPHelpers.setInput;
    var _setSource = PPHelpers.setInputWithSource;
    var _stripPx = PPHelpers.stripPx;
    var _normalizeGap = PPHelpers.normalizeGap;

    // ── Smart coordinates: only show when positioned & editable ──────────
    var traits = s.traits || {};
    var disableXY = (traits.isFlexChild || traits.isGridChild) && !traits.isAbsolute;
    var canEditXY = s.x.isPositioned && !disableXY;
    var coordsSection = document.getElementById('pp-section-coords');
    var coordsDivider = document.getElementById('pp-divider-after-coords');
    if (coordsSection) coordsSection.style.display = canEditXY ? '' : 'none';
    if (coordsDivider) coordsDivider.style.display = canEditXY ? '' : 'none';

    var xEl = document.getElementById('pp-x');
    var yEl = document.getElementById('pp-y');
    if (xEl) {
      var xRaw = s.x.inline || (s.x.isPositioned ? s.x.computed : '');
      xEl.value = _stripPx(xRaw);
      xEl.disabled = !canEditXY;
    }
    if (yEl) {
      var yRaw = s.y.inline || (s.y.isPositioned ? s.y.computed : '');
      yEl.value = _stripPx(yRaw);
      yEl.disabled = !canEditXY;
    }

    // ── Layout mode detection ──────────────────────────────────────────
    var displayVal = _val(s.display);
    var isFlexGrid = /flex|grid/.test(displayVal);
    var flexDir = _val(s.flexDirection) || 'row';

    if (/grid|inline-grid/.test(displayVal)) {
      _layoutMode = 'grid';
    } else if (/flex|inline-flex/.test(displayVal)) {
      _layoutMode = flexDir === 'column' ? 'column' : 'row';
    } else {
      _layoutMode = 'block';
    }
    _updateModeSwitcher(_layoutMode);
    _updateGapIcon(_layoutMode);

    // Wrap toggle visibility + state
    var wrapBtn = document.getElementById('pp-wrap-toggle');
    if (wrapBtn) {
      var isFlex = /flex|inline-flex/.test(displayVal);
      wrapBtn.style.visibility = isFlex ? '' : 'hidden';
      if (isFlex) {
        var wrapVal = _val(s.flexWrap) || 'nowrap';
        wrapBtn.classList.toggle('active', wrapVal === 'wrap');
      }
    }

    // Grid controls visibility + values
    var gridControls = document.getElementById('pp-grid-controls');
    if (gridControls) {
      gridControls.style.display = (_layoutMode === 'grid') ? '' : 'none';
      if (_layoutMode === 'grid') {
        var gtc = _val(s.gridTemplateColumns) || '';
        var gtr = _val(s.gridTemplateRows) || '';
        _setInput('pp-grid-cols', gtc === 'none' ? '' : gtc);
        _setInput('pp-grid-rows', gtr === 'none' ? '' : gtr);
      }
    }

    // Show/hide flex-only controls
    var flexControls = document.getElementById('pp-flex-controls');
    if (flexControls) flexControls.style.display = isFlexGrid ? '' : 'none';

    // W/H (show computed, but indicate if inherited)
    var wEl = document.getElementById('pp-w');
    var hEl = document.getElementById('pp-h');
    if (wEl) {
      wEl.value = _stripPx(s.width.inline) || _stripPx(s.width.computed) || '';
      wEl.classList.toggle('pp-val--inherited', !s.width.isInline);
    }
    if (hEl) {
      hEl.value = _stripPx(s.height.inline) || _stripPx(s.height.computed) || '';
      hEl.classList.toggle('pp-val--inherited', !s.height.isInline);
    }

    // W/H mode labels + input disabled state
    // Mode is determined by INLINE value only, mapped to Fill/Hug/Fixed (no "Auto")
    _updateWhModeLabel('pp-w-mode', 'pp-w-mode-label', 'pp-w', s.width.inline || '', 'width', traits);
    _updateWhModeLabel('pp-h-mode', 'pp-h-mode-label', 'pp-h', s.height.inline || '', 'height', traits);

    // Aspect ratio lock button — only reset when selecting a DIFFERENT element
    var aspectBtn = document.getElementById('pp-aspect-lock');
    if (aspectBtn) {
      aspectBtn.style.display = '';
      if (isNewElement) {
        _aspectLocked = false;
        aspectBtn.classList.remove('active');
      }
    }

    // 9-grid alignment
    if (isFlexGrid) {
      var computedJC = s.justifyContent ? (s.justifyContent.computed || 'flex-start') : 'flex-start';
      var computedAI = s.alignItems ? (s.alignItems.computed || 'stretch') : 'stretch';
      if (isNewElement) {
        _origJC = computedJC;
        _origAI = computedAI;
      }
      var displayJC = _val(s.justifyContent) || computedJC;
      var displayAI = _val(s.alignItems) || computedAI;

      // Detect distribution mode from current justify-content
      var distModes = ['space-between', 'space-around', 'space-evenly'];
      if (distModes.includes(displayJC)) {
        _jcDistribution = displayJC;
      } else {
        _jcDistribution = 'packed';
      }
      _updateJcDropdown(_jcDistribution);

      _updateAlign9Grid(displayJC, displayAI);
      _updateGapState(s);
    } else {
      _jcDistribution = 'packed';
      _updateJcDropdown('packed');
    }

    _setSource('pp-radius',  s.borderRadius, '0');
    _setSource('pp-radius-tl', s.borderTopLeftRadius, '');
    _setSource('pp-radius-tr', s.borderTopRightRadius, '');
    _setSource('pp-radius-bl', s.borderBottomLeftRadius, '');
    _setSource('pp-radius-br', s.borderBottomRightRadius, '');
    _setSource('pp-opacity', s.opacity, '1');

    // ── Padding: populate 2-value and 4-value ─────────────────────────
    var ptVal = s.paddingTop    ? (_stripPx(s.paddingTop.inline    || s.paddingTop.computed)    || '0') : '0';
    var prVal = s.paddingRight  ? (_stripPx(s.paddingRight.inline  || s.paddingRight.computed)  || '0') : '0';
    var pbVal = s.paddingBottom ? (_stripPx(s.paddingBottom.inline || s.paddingBottom.computed) || '0') : '0';
    var plVal = s.paddingLeft   ? (_stripPx(s.paddingLeft.inline   || s.paddingLeft.computed)   || '0') : '0';
    _setSource('pp-pl', s.paddingLeft, '0');
    _setSource('pp-pt', s.paddingTop, '0');
    _setSource('pp-pr', s.paddingRight, '0');
    _setSource('pp-pb', s.paddingBottom, '0');
    // 2-value inputs: show comma-separated if sides differ (Figma style)
    var padHEl = document.getElementById('pp-pad-h');
    var padVEl = document.getElementById('pp-pad-v');
    if (padHEl) padHEl.value = (plVal !== prVal) ? (plVal + ', ' + prVal) : plVal;
    if (padVEl) padVEl.value = (ptVal !== pbVal) ? (ptVal + ', ' + pbVal) : ptVal;
    // Always stay in 2-value mode; 4-value mode is opt-in via expand button
    var pad2el = document.getElementById('pp-padding-2val');
    var pad4el = document.getElementById('pp-padding-4val');
    if (pad2el && pad4el) {
      pad2el.style.display = '';
      pad4el.style.display = 'none';
    }

    // ── Margin: populate 2-value and 4-value ──────────────────────────
    var mtVal = s.marginTop    ? (_stripPx(s.marginTop.inline    || s.marginTop.computed)    || '0') : '0';
    var mrVal = s.marginRight  ? (_stripPx(s.marginRight.inline  || s.marginRight.computed)  || '0') : '0';
    var mbVal = s.marginBottom ? (_stripPx(s.marginBottom.inline || s.marginBottom.computed) || '0') : '0';
    var mlVal = s.marginLeft   ? (_stripPx(s.marginLeft.inline   || s.marginLeft.computed)   || '0') : '0';
    _setSource('pp-ml', s.marginLeft, '0');
    _setSource('pp-mt', s.marginTop, '0');
    _setSource('pp-mr', s.marginRight, '0');
    _setSource('pp-mb', s.marginBottom, '0');
    // 2-value inputs: show comma-separated if sides differ (Figma style)
    var marginHEl = document.getElementById('pp-margin-h');
    var marginVEl = document.getElementById('pp-margin-v');
    if (marginHEl) marginHEl.value = (mlVal !== mrVal) ? (mlVal + ', ' + mrVal) : mlVal;
    if (marginVEl) marginVEl.value = (mtVal !== mbVal) ? (mtVal + ', ' + mbVal) : mtVal;
    // Always stay in 2-value mode; 4-value mode is opt-in via expand button
    var margin2el = document.getElementById('pp-margin-2val');
    var margin4el = document.getElementById('pp-margin-4val');
    if (margin2el && margin4el) {
      margin2el.style.display = '';
      margin4el.style.display = 'none';
    }

    // ── Order section: visible only for flex/grid children ────────────
    var orderSection = document.getElementById('pp-section-order');
    var orderDivider = document.getElementById('pp-divider-after-order');
    if (orderSection) {
      var showOrder = traits.isFlexChild || traits.isGridChild;
      orderSection.style.display = showOrder ? '' : 'none';
      if (orderDivider) orderDivider.style.display = showOrder ? '' : 'none';
      if (showOrder) {
        _populateOrderSection();
      }
    }
  }

  function getLayoutMode() {
    return _layoutMode;
  }

  function getLastPopulateEl() {
    return _lastPopulateEl;
  }

  function setLastPopulateEl(el) {
    _lastPopulateEl = el;
  }

  // ── Dimension inputs ──────────────────────────────────────────────────────
  function _bindDimensions() {
    var map = {
      'pp-x':       'left',
      'pp-y':       'top',
      'pp-w':       'width',
      'pp-h':       'height',
      'pp-radius':  'borderRadius',
      'pp-opacity': 'opacity',
    };

    Object.entries(map).forEach(function (entry) {
      var id = entry[0], prop = entry[1];
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', function () {
        if (el.disabled) return;
        var val = el.value.trim();
        if (id === 'pp-opacity') {
          // numeric, clamp to [0, 1]
          var num = parseFloat(val);
          if (!isNaN(num)) { val = String(Math.min(1, Math.max(0, num))); el.value = val; }
        } else if (id === 'pp-radius') {
          if (val && !/[a-z%]/i.test(val)) val += 'px';
        } else if (id === 'pp-w' || id === 'pp-h') {
          if (val && val !== 'auto' && !/[a-z%]/i.test(val)) val += 'px';
          // If currently in Hug or Fill mode, typing a number auto-switches to Fixed
          var modeSelId = (id === 'pp-w') ? 'pp-w-mode' : 'pp-h-mode';
          var modeLabelId = (id === 'pp-w') ? 'pp-w-mode-label' : 'pp-h-mode-label';
          var modeSel = document.getElementById(modeSelId);
          var modeLabel = document.getElementById(modeLabelId);
          if (modeSel && modeSel.value !== 'fixed') {
            modeSel.value = 'fixed';
            if (modeLabel) modeLabel.textContent = _MODE_LABELS['fixed'];
          }
        } else {
          if (val && !/[a-z%]/i.test(val)) val += 'px';
        }
        EditorCore.applyDimension(prop, val);

        // Aspect ratio lock: sync the other dimension
        if (_aspectLocked && (id === 'pp-w' || id === 'pp-h')) {
          var numVal = parseFloat(val);
          if (!isNaN(numVal) && _aspectRatio > 0) {
            if (id === 'pp-w') {
              var newH = Math.round(numVal / _aspectRatio);
              var hEl = document.getElementById('pp-h');
              if (hEl) { hEl.value = String(newH); EditorCore.applyDimension('height', newH + 'px'); }
            } else {
              var newW = Math.round(numVal * _aspectRatio);
              var wEl = document.getElementById('pp-w');
              if (wEl) { wEl.value = String(newW); EditorCore.applyDimension('width', newW + 'px'); }
            }
          }
        }
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') el.dispatchEvent(new Event('change'));
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          if (id === 'pp-opacity') {
            var delta = e.shiftKey ? 0.1 : 0.01;
            var cur = parseFloat(el.value) || 1;
            el.value = String(Math.min(1, Math.max(0, +(cur + (e.key === 'ArrowUp' ? delta : -delta)).toFixed(2))));
          } else {
            var delta2 = e.shiftKey ? 10 : 1;
            var cur2 = parseFloat(el.value) || 0;
            el.value = String(cur2 + (e.key === 'ArrowUp' ? delta2 : -delta2));
          }
          el.dispatchEvent(new Event('change'));
        }
      });
    });
  }

  // ── Spacing inputs (unified 2-val / 4-val) ──────────────────────────────
  function _bindSpacing() {
    // Padding 2val → 4val toggle
    _setupExpandCollapse('pp-padding-expand', 'pp-padding-2val', 'pp-padding-4val');
    _setupCollapseSync('pp-padding-collapse', 'pp-padding-4val', 'pp-padding-2val',
      { h: 'pp-pad-h', v: 'pp-pad-v' }, { l: 'pp-pl', t: 'pp-pt', r: 'pp-pr', b: 'pp-pb' });

    // Margin 2val → 4val toggle
    _setupExpandCollapse('pp-margin-expand', 'pp-margin-2val', 'pp-margin-4val');
    _setupCollapseSync('pp-margin-collapse', 'pp-margin-4val', 'pp-margin-2val',
      { h: 'pp-margin-h', v: 'pp-margin-v' }, { l: 'pp-ml', t: 'pp-mt', r: 'pp-mr', b: 'pp-mb' });

    // 2-value padding inputs
    _bindSpacingInput2Val('pp-pad-h', 'paddingLeft', 'paddingRight');
    _bindSpacingInput2Val('pp-pad-v', 'paddingTop', 'paddingBottom');

    // 4-value padding inputs
    _bindSpacingInput('pp-pl', 'paddingLeft');
    _bindSpacingInput('pp-pt', 'paddingTop');
    _bindSpacingInput('pp-pr', 'paddingRight');
    _bindSpacingInput('pp-pb', 'paddingBottom');

    // 2-value margin inputs
    _bindSpacingInput2Val('pp-margin-h', 'marginLeft', 'marginRight');
    _bindSpacingInput2Val('pp-margin-v', 'marginTop', 'marginBottom');

    // 4-value margin inputs
    _bindSpacingInput('pp-ml', 'marginLeft');
    _bindSpacingInput('pp-mt', 'marginTop');
    _bindSpacingInput('pp-mr', 'marginRight');
    _bindSpacingInput('pp-mb', 'marginBottom');
  }

  function _setupExpandCollapse(btnId, hideId, showId) {
    var btn = document.getElementById(btnId);
    var hideEl = document.getElementById(hideId);
    var showEl = document.getElementById(showId);
    if (!btn || !hideEl || !showEl) return;
    btn.addEventListener('click', function () {
      hideEl.style.display = 'none';
      showEl.style.display = '';
    });
  }

  /** Collapse from 4-value to 2-value, syncing values from the 4 inputs */
  function _setupCollapseSync(btnId, hideId, showId, twoIds, fourIds) {
    var btn = document.getElementById(btnId);
    var hideEl = document.getElementById(hideId);
    var showEl = document.getElementById(showId);
    if (!btn || !hideEl || !showEl) return;
    btn.addEventListener('click', function () {
      // Sync: horizontal = left/right values, vertical = top/bottom values
      var lEl = document.getElementById(fourIds.l);
      var rEl = document.getElementById(fourIds.r);
      var tEl = document.getElementById(fourIds.t);
      var bEl = document.getElementById(fourIds.b);
      var hEl = document.getElementById(twoIds.h);
      var vEl = document.getElementById(twoIds.v);
      if (lEl && hEl) {
        var lv = lEl.value || '0';
        var rv = rEl ? (rEl.value || '0') : lv;
        hEl.value = (lv !== rv) ? (lv + ', ' + rv) : lv;
      }
      if (tEl && vEl) {
        var tv = tEl.value || '0';
        var bv = bEl ? (bEl.value || '0') : tv;
        vEl.value = (tv !== bv) ? (tv + ', ' + bv) : tv;
      }
      hideEl.style.display = 'none';
      showEl.style.display = '';
    });
  }

  function _bindSpacingInput(id, cssProp) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', function () {
      var val = el.value.trim();
      if (val && !/[a-z%]/i.test(val)) {
        var selectedEl = EditorCore.getSelectedEl();
        if (selectedEl) {
          var currentInline = selectedEl.style[cssProp] || '';
          var unitMatch = currentInline.match(/[a-z%]+$/i);
          val += (unitMatch ? unitMatch[0] : 'px');
        } else {
          val += 'px';
        }
      }
      EditorCore.applyStyleProp(cssProp, val);
      if (window.FlexOverlay) FlexOverlay.showProperty(cssProp);
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { el.dispatchEvent(new Event('change')); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        var delta = e.shiftKey ? 10 : 1;
        var cur = parseFloat(el.value) || 0;
        var minVal = cssProp.startsWith('margin') ? -Infinity : 0;
        el.value = String(Math.max(minVal, cur + (e.key === 'ArrowUp' ? delta : -delta)));
        el.dispatchEvent(new Event('change'));
      }
    });
  }

  function _bindSpacingInput2Val(id, cssProp1, cssProp2) {
    var el = document.getElementById(id);
    if (!el) return;

    /** Normalise a raw string to a CSS length value */
    function _toLength(raw, refProp) {
      var v = raw.trim();
      if (!v) return null;
      if (!/[a-z%]/i.test(v)) {
        var selectedEl = EditorCore.getSelectedEl();
        var unit = 'px';
        if (selectedEl) {
          var currentInline = selectedEl.style[refProp] || '';
          var unitMatch = currentInline.match(/[a-z%]+$/i);
          if (unitMatch) unit = unitMatch[0];
        }
        v += unit;
      }
      return v;
    }

    el.addEventListener('change', function () {
      var raw = el.value.trim();
      // Comma-separated: "20, 18" → apply separately
      if (raw.indexOf(',') !== -1) {
        var parts = raw.split(',');
        var v1 = _toLength(parts[0], cssProp1);
        var v2 = _toLength(parts[1] !== undefined ? parts[1] : parts[0], cssProp2);
        if (v1) EditorCore.applyStyleProp(cssProp1, v1);
        if (v2) EditorCore.applyStyleProp(cssProp2, v2);
      } else {
        var val = _toLength(raw, cssProp1);
        if (val) {
          EditorCore.applyStyleProp(cssProp1, val);
          EditorCore.applyStyleProp(cssProp2, val);
        }
      }
      if (window.FlexOverlay) FlexOverlay.showProperty(cssProp1);
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { el.dispatchEvent(new Event('change')); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        var delta = e.shiftKey ? 10 : 1;
        var minVal = cssProp1.startsWith('margin') ? -Infinity : 0;
        // If comma-separated, nudge first value only
        var raw = el.value;
        if (raw.indexOf(',') !== -1) {
          var parts = raw.split(',');
          var cur = parseFloat(parts[0]) || 0;
          parts[0] = String(Math.max(minVal, cur + (e.key === 'ArrowUp' ? delta : -delta)));
          el.value = parts.join(',');
        } else {
          var cur2 = parseFloat(raw) || 0;
          el.value = String(Math.max(minVal, cur2 + (e.key === 'ArrowUp' ? delta : -delta)));
        }
        el.dispatchEvent(new Event('change'));
      }
    });
  }

  // ── Radius Toggle ─────────────────────────────────────────────────────────
  function _bindRadiusToggle() {
    var radiusToggle = document.getElementById('pp-radius-toggle');
    var radiusIndiv = document.getElementById('pp-radius-individual');
    var radiusUnified = document.getElementById('pp-radius');
    if (radiusToggle && radiusIndiv && radiusUnified) {
      radiusToggle.addEventListener('click', function () {
        var showIndiv = radiusIndiv.style.display === 'none';
        radiusIndiv.style.display = showIndiv ? '' : 'none';
        radiusToggle.classList.toggle('active', showIndiv);
        if (!showIndiv) {
          var vals = ['pp-radius-tl','pp-radius-tr','pp-radius-bl','pp-radius-br']
            .map(function (id) { var e = document.getElementById(id); return e ? e.value : '0'; });
          radiusUnified.value = vals[0];
          radiusUnified.dispatchEvent(new Event('change'));
        }
      });
    }

    var propMap = {
      'pp-radius-tl': 'borderTopLeftRadius',
      'pp-radius-tr': 'borderTopRightRadius',
      'pp-radius-bl': 'borderBottomLeftRadius',
      'pp-radius-br': 'borderBottomRightRadius',
    };
    Object.entries(propMap).forEach(function (entry) {
      var id = entry[0], cssProp = entry[1];
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', function () {
        var val = el.value.trim();
        if (val && !/[a-z%]/i.test(val)) val += 'px';
        EditorCore.applyStyleProp(cssProp, val);
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { el.dispatchEvent(new Event('change')); return; }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          var delta = e.shiftKey ? 10 : 1;
          var cur = parseFloat(el.value) || 0;
          el.value = String(Math.max(0, cur + (e.key === 'ArrowUp' ? delta : -delta)));
          el.dispatchEvent(new Event('change'));
        }
      });
    });
  }

  // ── W/H Mode Switcher ─────────────────────────────────────────────────────
  /**
   * Map CSS value to Figma-style mode: Fixed / Fill / Hug (no "Auto").
   * @param {string} cssVal — inline CSS value (empty = no inline)
   * @param {string} prop — 'width' or 'height'
   * @param {Object} traits — from readSelectedStyles().traits
   */
  function _cssValueToMode(cssVal, prop, traits) {
    if (!cssVal || cssVal === 'auto') {
      // No inline value → smart map based on context
      if (prop === 'height') return 'hug'; // height always defaults to content-driven
      // Width: depends on element type
      if (traits && (traits.isFlexChild || traits.isGridChild)) return 'hug'; // flex/grid children shrink to content
      return 'fill'; // block elements fill parent width
    }
    var v = String(cssVal).trim();
    if (v === '100%') return 'fill';
    if (v === 'fit-content') return 'hug';
    return 'fixed';
  }

  function _updateWhModeLabel(selectId, labelId, inputId, cssVal, prop, traits) {
    var sel = document.getElementById(selectId);
    var label = document.getElementById(labelId);
    var inp = document.getElementById(inputId);
    var mode = _cssValueToMode(cssVal, prop, traits);
    if (sel) sel.value = mode;
    if (label) {
      label.textContent = _MODE_LABELS[mode] || 'Fixed';
      label.style.display = '';
    }
    // All modes allow input editing (Hug/Fill show computed px; editing auto-switches to Fixed)
    if (inp) {
      inp.disabled = false;
      if (mode !== 'fixed') {
        // Show computed pixel value instead of keyword
        var iframe = document.getElementById('target-frame');
        var win = iframe && iframe.contentWindow;
        var el = EditorCore && EditorCore.getSelectedEl ? EditorCore.getSelectedEl() : null;
        if (el && win) {
          var cs = win.getComputedStyle(el);
          var px = Math.round(parseFloat(cs[prop]) || 0);
          inp.value = String(px);
        }
        // else keep whatever value was set before
      }
    }
  }

  function _bindWhMode() {
    function _bindOne(selId, labelId, inputId, prop) {
      var sel = document.getElementById(selId);
      var label = document.getElementById(labelId);
      var inp = document.getElementById(inputId);
      if (!sel || !inp) return;

      function _applyMode(mode) {
        var cssVal;
        if (mode === 'fill') {
          cssVal = '100%'; inp.disabled = true; inp.value = '100%';
        } else if (mode === 'hug') {
          cssVal = 'fit-content'; inp.disabled = false;
          // Show computed pixel value instead of 'fit-content'
          var el2 = EditorCore.getSelectedEl();
          if (el2) {
            var iframe2 = document.getElementById('target-frame');
            var win2 = iframe2 && iframe2.contentWindow;
            if (win2) {
              var cs2 = win2.getComputedStyle(el2);
              inp.value = String(Math.round(parseFloat(cs2[prop]) || 0));
            } else {
              inp.value = '';
            }
          } else {
            inp.value = '';
          }
        } else {
          // Fixed mode: read current computed pixel size as starting value
          inp.disabled = false;
          var el = EditorCore.getSelectedEl();
          if (el) {
            var iframe = document.getElementById('target-frame');
            var win = iframe && iframe.contentWindow;
            if (win) {
              var cs = win.getComputedStyle(el);
              var computedPx = Math.round(parseFloat(cs[prop]) || 0);
              cssVal = computedPx + 'px';
              inp.value = String(computedPx);
            } else {
              cssVal = '200px'; inp.value = '200';
            }
          } else {
            cssVal = '200px'; inp.value = '200';
          }
        }
        sel.value = mode;
        if (label) {
          label.textContent = _MODE_LABELS[mode] || 'Fixed';
          label.style.display = '';
        }
        if (cssVal) EditorCore.applyDimension(prop, cssVal);
      }

      // Hidden select change (for backward compat)
      sel.addEventListener('change', function () { _applyMode(sel.value); });

      // Mode label click → custom dropdown
      if (label) {
        label.addEventListener('click', function (e) {
          e.stopPropagation();
          var wrapper = label.closest('.pp-inline-input--wh');
          if (_openDropdownFn) _openDropdownFn(sel, wrapper || label, label);
        });
      }
    }
    _bindOne('pp-w-mode', 'pp-w-mode-label', 'pp-w', 'width');
    _bindOne('pp-h-mode', 'pp-h-mode-label', 'pp-h', 'height');
  }

  // ── Mode Switcher (block / column / row) ──────────────────────────────────
  function _bindModeSwitcher() {
    document.querySelectorAll('.pp-mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.dataset.mode;
        _layoutMode = mode;
        _updateModeSwitcher(mode);

        // Apply CSS
        if (mode === 'block') {
          EditorCore.applyStyleProp('display', 'block');
          EditorCore.applyStyleProp('flexDirection', '');
          EditorCore.applyStyleProp('flexWrap', '');
          EditorCore.applyStyleProp('gridTemplateColumns', '');
          EditorCore.applyStyleProp('gridTemplateRows', '');
        } else if (mode === 'grid') {
          EditorCore.applyStyleProp('display', 'grid');
          EditorCore.applyStyleProp('flexDirection', '');
          EditorCore.applyStyleProp('flexWrap', '');
          EditorCore.applyStyleProp('gridTemplateColumns', '1fr 1fr');
        } else {
          EditorCore.applyStyleProp('display', 'flex');
          EditorCore.applyStyleProp('flexDirection', mode === 'column' ? 'column' : 'row');
          EditorCore.applyStyleProp('gridTemplateColumns', '');
          EditorCore.applyStyleProp('gridTemplateRows', '');
        }

        // Show/hide flex controls
        var flexControls = document.getElementById('pp-flex-controls');
        if (flexControls) flexControls.style.display = (mode !== 'block') ? '' : 'none';

        // Show/hide grid-specific controls
        var gridControls = document.getElementById('pp-grid-controls');
        if (gridControls) gridControls.style.display = (mode === 'grid') ? '' : 'none';

        // Show/hide clip button
        var clipBtn = document.getElementById('pp-clip-content-btn');
        if (clipBtn) clipBtn.style.display = (mode !== 'block') ? '' : 'none';

        // Update gap icon based on flex direction
        _updateGapIcon(mode);

        // Show/hide wrap toggle (flex only, not grid or block)
        var wrapBtn = document.getElementById('pp-wrap-toggle');
        if (wrapBtn) wrapBtn.style.visibility = (mode === 'column' || mode === 'row') ? '' : 'hidden';
      });
    });
  }

  function _updateModeSwitcher(mode) {
    document.querySelectorAll('.pp-mode-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  /** Swap gap icon SVG based on flex direction: column=vertical, row=horizontal */
  function _updateGapIcon(mode) {
    var icon = document.getElementById('pp-gap-icon');
    if (!icon) return;
    if (mode === 'column') {
      // align-vertical-space-between (Lucide)
      icon.innerHTML = '<rect width="14" height="6" x="5" y="15" rx="2"/><rect width="10" height="6" x="7" y="3" rx="2"/><path d="M2 21h20"/><path d="M2 3h20"/>';
    } else {
      // align-horizontal-space-between (Lucide)
      icon.innerHTML = '<rect width="6" height="14" x="3" y="5" rx="2"/><rect width="6" height="10" x="15" y="7" rx="2"/><path d="M3 2v20"/><path d="M21 2v20"/>';
    }
  }

  /** Update gap input: show "Auto" and disable when in distribution mode */
  function _updateGapState(s) {
    var gapEl = document.getElementById('pp-gap');
    if (!gapEl) return;
    var isDist = _jcDistribution !== 'packed';
    if (isDist) {
      gapEl.value = '';
      gapEl.placeholder = 'Auto';
      gapEl.disabled = true;
      gapEl.classList.remove('pp-val--inherited');
    } else {
      gapEl.disabled = false;
      gapEl.placeholder = '0';
      if (s && s.gap) {
        PPHelpers.setInputWithSource('pp-gap', s.gap, '');
      } else {
        PPHelpers.setInput('pp-gap', '');
      }
    }
  }

  // ── Auto Layout bindings ──────────────────────────────────────────────────
  function _bindAutoLayout() {
    // 9-grid alignment buttons — single click for packed, double-click cycles distribution
    var _lastGridClickTime = 0;
    var _lastGridClickCell = null;

    document.querySelectorAll('.pp-align9-cell').forEach(function (cell) {
      cell.addEventListener('click', function () {
        // data-jc = horizontal position, data-ai = vertical position (grid visual)
        var cellH = cell.dataset.jc;   // horizontal: flex-start/center/flex-end
        var cellV = cell.dataset.ai;   // vertical: flex-start/center/flex-end
        var el = EditorCore.getSelectedEl();
        if (!el) return;

        var win = el.ownerDocument.defaultView;
        var cs = win.getComputedStyle(el);
        var isColumn = cs.flexDirection === 'column';

        // In row mode: jc=horizontal, ai=vertical (direct mapping)
        // In column mode: jc=vertical, ai=horizontal (swapped)
        var newJC = isColumn ? cellV : cellH;
        var newAI = isColumn ? cellH : cellV;

        var now = Date.now();
        var isDoubleClick = (now - _lastGridClickTime < 300) && (_lastGridClickCell === cell);
        _lastGridClickTime = now;
        _lastGridClickCell = cell;

        if (isDoubleClick && cell.classList.contains('active')) {
          // Double-click on active cell: cycle distribution mode
          var modes = ['packed', 'space-between', 'space-around', 'space-evenly'];
          var curIdx = modes.indexOf(_jcDistribution);
          _jcDistribution = modes[(curIdx + 1) % modes.length];

          if (_jcDistribution === 'packed') {
            EditorCore.applyStyleProp('justifyContent', newJC);
          } else {
            EditorCore.applyStyleProp('justifyContent', _jcDistribution);
          }
          _updateJcDropdown(_jcDistribution);
          _updateGapState(null);
          _updateAlign9Grid(
            _jcDistribution === 'packed' ? newJC : _jcDistribution,
            newAI
          );
          _lastGridClickTime = 0; // reset to prevent triple-click
          return;
        }

        // Single click
        if (_jcDistribution !== 'packed') {
          // In distributed mode: only change align-items, keep distribution
          EditorCore.applyStyleProp('alignItems', newAI);
          _updateAlign9Grid(_jcDistribution, newAI);
          return;
        }

        // Packed mode: set both jc + ai (reset distribution)
        _jcDistribution = 'packed';
        _updateJcDropdown('packed');

        var normOrigJC = _normalizeFlexVal(_origJC, 'jc');
        var normOrigAI = _normalizeFlexVal(_origAI, 'ai');
        // Check if clicking restores original values
        var isRestore = (newJC === normOrigJC && newAI === normOrigAI);

        var oldAI = cs.alignItems;
        var resolvedAI = isRestore ? _origAI : newAI;
        var aiChanging = oldAI !== resolvedAI;

        if (aiChanging) {
          var children = Array.from(el.children);
          var crossProp = isColumn ? 'width' : 'height';

          if (_isStretchLike(oldAI) && !_isStretchLike(resolvedAI)) {
            children.forEach(function (child) {
              var childCs = win.getComputedStyle(child);
              var curSize = childCs[crossProp];
              if (!child.style[crossProp]) {
                child.style[crossProp] = curSize;
                child.dataset.peLocked = crossProp;
                child.dataset.peLockedVal = curSize;
                EditorCore.trackChange(child, crossProp, curSize, '', 'style');
              }
            });
          } else if (!_isStretchLike(oldAI) && _isStretchLike(resolvedAI)) {
            children.forEach(function (child) {
              if (child.dataset.peLocked === crossProp) {
                var oldVal = child.style[crossProp];
                child.style.removeProperty(crossProp);
                delete child.dataset.peLocked;
                EditorCore.trackChange(child, crossProp, '', oldVal, 'style');
              }
            });
          }
        }

        if (isRestore) {
          el.style.removeProperty('justify-content');
          el.style.removeProperty('align-items');
          Array.from(el.children).forEach(function (child) {
            var lockedProp = child.dataset.peLocked;
            if (lockedProp) {
              child.style.removeProperty(lockedProp);
              delete child.dataset.peLocked;
            }
          });
          EditorCore.trackChange(el, 'justifyContent', _origJC, newJC, 'style');
          EditorCore.trackChange(el, 'alignItems', _origAI, newAI, 'style');
          EditorCore.emit('change', { changes: EditorCore.getChanges(), count: EditorCore.getChanges().length });
        } else {
          EditorCore.applyStyleProp('justifyContent', newJC);
          EditorCore.applyStyleProp('alignItems', newAI);
        }
        _updateAlign9Grid(newJC, newAI);
      });
    });

    // Gap input
    var gapEl = document.getElementById('pp-gap');
    if (gapEl) {
      gapEl.addEventListener('change', function () {
        if (gapEl.disabled) return;
        var val = gapEl.value.trim();
        if (val && !/[a-z%]/i.test(val)) val += 'px';
        // Ensure the container clips overflow like Figma:
        // - overflow:hidden clips visual overflow
        // - min-width:0 prevents flex items from expanding beyond their container
        var selectedEl = EditorCore.getSelectedEl();
        if (selectedEl) {
          var iframe = document.getElementById('target-frame');
          var win = iframe && iframe.contentWindow;
          if (win) {
            var cs = win.getComputedStyle(selectedEl);
            if (cs.overflow === 'visible') {
              EditorCore.applyStyleProp('overflow', 'hidden');
            }
            // If the element is itself a flex child, prevent it from growing
            // beyond its intended size due to content pressure
            var parentDisplay = selectedEl.parentElement ? win.getComputedStyle(selectedEl.parentElement).display : '';
            if (parentDisplay === 'flex' || parentDisplay === 'inline-flex') {
              if (!selectedEl.style.minWidth) {
                EditorCore.applyStyleProp('minWidth', '0');
              }
            }
          }
        }
        EditorCore.applyStyleProp('gap', val);
        if (window.FlexOverlay) FlexOverlay.showProperty('gap');
      });
      gapEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') gapEl.dispatchEvent(new Event('change'));
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          var delta = e.shiftKey ? 10 : 1;
          var cur = parseFloat(gapEl.value) || 0;
          gapEl.value = String(Math.max(0, cur + (e.key === 'ArrowUp' ? delta : -delta)));
          gapEl.dispatchEvent(new Event('change'));
        }
      });
    }

    // Aspect ratio lock button
    var aspectBtn = document.getElementById('pp-aspect-lock');
    if (aspectBtn) {
      aspectBtn.addEventListener('click', function () {
        _aspectLocked = !_aspectLocked;
        aspectBtn.classList.toggle('active', _aspectLocked);
        // Capture current W/H ratio when locking
        if (_aspectLocked) {
          var wEl = document.getElementById('pp-w');
          var hEl = document.getElementById('pp-h');
          var w = parseFloat(wEl ? wEl.value : 0) || 1;
          var h = parseFloat(hEl ? hEl.value : 0) || 1;
          _aspectRatio = w / h;
        }
      });
    }
  }

  // ── Wrap toggle ────────────────────────────────────────────────────────────
  function _bindWrapToggle() {
    var btn = document.getElementById('pp-wrap-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var el = EditorCore.getSelectedEl();
      if (!el) return;
      var win = el.ownerDocument.defaultView;
      var cs = win.getComputedStyle(el);
      var currentWrap = cs.flexWrap || 'nowrap';
      var newWrap = currentWrap === 'wrap' ? 'nowrap' : 'wrap';
      EditorCore.applyStyleProp('flexWrap', newWrap);
      btn.classList.toggle('active', newWrap === 'wrap');
    });
  }

  // ── Justify-content dropdown ──────────────────────────────────────────────
  function _bindJcDropdown() {
    var wrap = document.getElementById('pp-jc-dropdown-wrap');
    if (!wrap) return;
    _jcSelect = PPHelpers.createSelect({
      id: 'pp-jc-select',
      value: 'packed',
      items: [
        { value: 'packed', label: '紧凑排列' },
        { value: 'space-between', label: '两端对齐' },
        { value: 'space-around', label: '等距环绕' },
        { value: 'space-evenly', label: '完全等距' },
      ],
      onChange: function(mode) {
        _jcDistribution = mode;
        var el = EditorCore.getSelectedEl();
        if (!el) return;

        var win = el.ownerDocument.defaultView;
        var cs = win.getComputedStyle(el);
        var isColumn = cs.flexDirection === 'column';

        if (mode === 'packed') {
          var activeCell = document.querySelector('#pp-align9-grid .pp-align9-cell.active');
          // Map grid cell back to CSS: column swaps jc/ai
          var cellH = activeCell ? activeCell.dataset.jc : 'flex-start';
          var cellV = activeCell ? activeCell.dataset.ai : 'flex-start';
          var cssJC = isColumn ? cellV : cellH;
          EditorCore.applyStyleProp('justifyContent', cssJC);
        } else {
          EditorCore.applyStyleProp('justifyContent', mode);
        }

        _updateJcDropdown(mode);
        _updateGapState(null);
        var activeCell2 = document.querySelector('#pp-align9-grid .pp-align9-cell.active');
        var cellH2 = activeCell2 ? activeCell2.dataset.jc : 'flex-start';
        var cellV2 = activeCell2 ? activeCell2.dataset.ai : 'flex-start';
        var cssJC2 = isColumn ? cellV2 : cellH2;
        var cssAI2 = isColumn ? cellH2 : cellV2;
        _updateAlign9Grid(
          mode === 'packed' ? cssJC2 : mode,
          cssAI2
        );
      }
    });
    // Add distribution icon (lucide dice-4) inside the select trigger
    var gapIconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    gapIconSvg.setAttribute('class', 'pp-inline-icon');
    gapIconSvg.setAttribute('width', '12');
    gapIconSvg.setAttribute('height', '12');
    gapIconSvg.setAttribute('viewBox', '0 0 24 24');
    gapIconSvg.setAttribute('fill', 'none');
    gapIconSvg.setAttribute('stroke', 'currentColor');
    gapIconSvg.setAttribute('stroke-width', '2');
    gapIconSvg.setAttribute('stroke-linecap', 'round');
    gapIconSvg.setAttribute('stroke-linejoin', 'round');
    gapIconSvg.innerHTML = '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/>';
    _jcSelect.el.insertBefore(gapIconSvg, _jcSelect.el.firstChild);
    wrap.appendChild(_jcSelect.el);
  }

  function _updateJcDropdown(mode) {
    var wrap = document.getElementById('pp-jc-dropdown-wrap');
    if (!wrap) return;

    var isFlexGrid = _layoutMode !== 'block';
    wrap.style.display = isFlexGrid ? '' : 'none';
    if (_jcSelect) _jcSelect.setValue(mode);

    document.querySelectorAll('.pp-align9-cell').forEach(function (cell) {
      cell.classList.toggle('distributed', mode !== 'packed');
    });
  }

  // ── Grid controls ─────────────────────────────────────────────────────────
  function _bindGridControls() {
    var colsEl = document.getElementById('pp-grid-cols');
    var rowsEl = document.getElementById('pp-grid-rows');

    if (colsEl) {
      colsEl.addEventListener('change', function () {
        var val = colsEl.value.trim();
        EditorCore.applyStyleProp('gridTemplateColumns', val || '');
      });
      colsEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') colsEl.dispatchEvent(new Event('change'));
      });
    }

    if (rowsEl) {
      rowsEl.addEventListener('change', function () {
        var val = rowsEl.value.trim();
        EditorCore.applyStyleProp('gridTemplateRows', val || '');
      });
      rowsEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') rowsEl.dispatchEvent(new Event('change'));
      });
    }
  }

  // ── Order Section ─────────────────────────────────────────────────────────
  function _bindOrderSection() {
    var prevBtn = document.getElementById('pp-order-prev');
    var nextBtn = document.getElementById('pp-order-next');
    if (prevBtn) prevBtn.addEventListener('click', function () { _reorderElement('before'); });
    if (nextBtn) nextBtn.addEventListener('click', function () { _reorderElement('after'); });

    // Create order dropdown with layers-2 icon inside
    var wrap = document.getElementById('pp-order-select-wrap');
    if (wrap) {
      _orderSelect = PPHelpers.createSelect({
        id: 'pp-order-select',
        value: '1',
        items: [{ value: '1', label: '1' }],
        onChange: function (val) {
          _moveToIndex(parseInt(val, 10) - 1);
        }
      });
      // Add layers-2 icon inside the select trigger
      var layersIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      layersIcon.setAttribute('class', 'pp-inline-icon');
      layersIcon.setAttribute('width', '14');
      layersIcon.setAttribute('height', '14');
      layersIcon.setAttribute('viewBox', '0 0 24 24');
      layersIcon.setAttribute('fill', 'none');
      layersIcon.setAttribute('stroke', 'currentColor');
      layersIcon.setAttribute('stroke-width', '2');
      layersIcon.setAttribute('stroke-linecap', 'round');
      layersIcon.setAttribute('stroke-linejoin', 'round');
      layersIcon.innerHTML = '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m6.08 9.5-3.5 1.6a1 1 0 0 0 0 1.81l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 0-1.83l-3.5-1.59"/>';
      _orderSelect.el.insertBefore(layersIcon, _orderSelect.el.firstChild);
      wrap.appendChild(_orderSelect.el);
    }
  }

  /** Populate the order section: dropdown items, arrow icons, tooltip */
  function _populateOrderSection() {
    var el = EditorCore.getSelectedEl();
    if (!el || !el.parentElement) return;
    var parent = el.parentElement;
    var siblings = Array.from(parent.children);
    var currentIdx = siblings.indexOf(el);
    var total = siblings.length;

    // Update order dropdown items
    if (_orderSelect) {
      var items = [];
      for (var i = 0; i < total; i++) {
        items.push({ value: String(i + 1), label: String(i + 1) });
      }
      _orderSelect.setItems(items);
      _orderSelect.setValue(String(currentIdx + 1));
    }

    // Disable arrows at boundaries
    var prevBtn = document.getElementById('pp-order-prev');
    var nextBtn = document.getElementById('pp-order-next');
    if (prevBtn) prevBtn.disabled = currentIdx <= 0;
    if (nextBtn) nextBtn.disabled = currentIdx >= total - 1;

    // Direction-aware arrow icons
    var iframe = document.getElementById('target-frame');
    var win = iframe && iframe.contentWindow;
    var isColumn = false;
    if (win && parent) {
      var cs = win.getComputedStyle(parent);
      isColumn = cs.flexDirection === 'column';
    }
    _updateArrowIcons(isColumn);

    // Tooltip: explain what "顺序" means
    var tooltip = document.getElementById('pp-order-tooltip');
    if (tooltip) {
      var parentTag = parent.tagName.toLowerCase();
      var parentIdent = parentTag;
      if (parent.id) parentIdent = parentTag + '#' + parent.id;
      else {
        var cls = (typeof parent.className === 'string' ? parent.className : '').split(' ').filter(Boolean)[0];
        if (cls) parentIdent = parentTag + '.' + cls;
      }
      tooltip.textContent = '共 ' + total + ' 个 · 父容器: ' + parentIdent;
    }
  }

  /** Update arrow button icons based on layout direction */
  function _updateArrowIcons(isColumn) {
    var prevIcon = document.getElementById('pp-order-prev-icon');
    var nextIcon = document.getElementById('pp-order-next-icon');
    if (prevIcon) {
      if (isColumn) {
        // arrow-up
        prevIcon.innerHTML = '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>';
      } else {
        // arrow-left
        prevIcon.innerHTML = '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>';
      }
    }
    if (nextIcon) {
      if (isColumn) {
        // arrow-down
        nextIcon.innerHTML = '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>';
      } else {
        // arrow-right
        nextIcon.innerHTML = '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>';
      }
    }
  }

  /** Move selected element to a specific sibling index */
  function _moveToIndex(targetIdx) {
    var el = EditorCore.getSelectedEl();
    if (!el || !el.parentElement) return;
    var parent = el.parentElement;
    var siblings = Array.from(parent.children);
    var currentIdx = siblings.indexOf(el);
    if (targetIdx === currentIdx || targetIdx < 0 || targetIdx >= siblings.length) return;

    var iframe = document.getElementById('target-frame');
    var iframeDoc = iframe ? (iframe.contentDocument || iframe.contentWindow.document) : null;
    if (!iframeDoc) return;

    var cmd = UndoStack.capture(parent, 'innerHTML', 'innerHTML', null, iframeDoc);
    var oldIndex = currentIdx;

    if (targetIdx < currentIdx) {
      parent.insertBefore(el, siblings[targetIdx]);
    } else {
      var ref = siblings[targetIdx];
      if (ref.nextSibling) parent.insertBefore(el, ref.nextSibling);
      else parent.appendChild(el);
    }

    cmd.newValue = parent.innerHTML;
    UndoStack.record(cmd);
    EditorCore.trackChange(el, '__reorder__', 'move', 'index:' + oldIndex + '->' + targetIdx, 'reorder');
    EditorCore.emit('change', { changes: EditorCore.getChanges(), count: EditorCore.getChanges().length });

    // Refresh the order section
    _populateOrderSection();
  }

  function _reorderElement(direction) {
    var el = EditorCore.getSelectedEl();
    if (!el) return;
    var parent = el.parentElement;
    if (!parent) return;
    var iframe = document.getElementById('target-frame');
    var iframeDoc = iframe ? (iframe.contentDocument || iframe.contentWindow.document) : null;
    if (!iframeDoc) return;
    var cmd = UndoStack.capture(parent, 'innerHTML', 'innerHTML', null, iframeDoc);
    var oldIndex = Array.from(parent.children).indexOf(el);
    if (direction === 'before') {
      var prev = el.previousElementSibling;
      if (!prev) return;
      parent.insertBefore(el, prev);
    } else {
      var next = el.nextElementSibling;
      if (!next) return;
      if (next.nextSibling) {
        parent.insertBefore(el, next.nextSibling);
      } else {
        parent.appendChild(el);
      }
    }
    var newIndex = Array.from(parent.children).indexOf(el);
    cmd.newValue = parent.innerHTML;
    UndoStack.record(cmd);
    // Track reorder as a change
    EditorCore.trackChange(el, '__reorder__', direction, 'index:' + oldIndex + '->' + newIndex, 'reorder');
    EditorCore.emit('change', { changes: EditorCore.getChanges(), count: EditorCore.getChanges().length });

    // Refresh the order section
    _populateOrderSection();
  }

  // ── Auto Layout UI helpers ────────────────────────────────────────────────

  /** Check if an align-items value behaves like stretch (fills cross-axis) */
  function _isStretchLike(val) {
    return !val || val === 'stretch' || val === 'normal';
  }

  /** Normalize a flex value to the closest 9-grid value for comparison */
  function _normalizeFlexVal(val, axis) {
    if (axis === 'jc') {
      var map = { 'normal': 'flex-start', 'start': 'flex-start', 'end': 'flex-end', 'stretch': 'flex-start' };
      return map[val] || val || 'flex-start';
    } else {
      var map2 = { 'normal': 'flex-start', 'start': 'flex-start', 'end': 'flex-end', 'stretch': 'flex-start', 'baseline': 'flex-start' };
      return map2[val] || val || 'flex-start';
    }
  }

  /**
   * Update nine-grid highlight based on CSS justify-content and align-items values.
   *
   * Grid cell data attributes: data-jc=horizontal, data-ai=vertical
   * Row mode:    CSS jc → horizontal (data-jc), CSS ai → vertical (data-ai)
   * Column mode: CSS jc → vertical (data-ai),   CSS ai → horizontal (data-jc)
   */
  function _updateAlign9Grid(justifyContent, alignItems) {
    var distModes = ['space-between', 'space-around', 'space-evenly'];
    var isDist = distModes.includes(justifyContent);
    var isColumn = (_layoutMode === 'column');

    // Rotate icons 90° when in row mode so lines are vertical (semantically correct)
    var grid9 = document.getElementById('pp-align9-grid');
    if (grid9) grid9.classList.toggle('pp-align9-grid--row', !isColumn);

    // Map CSS values to grid coordinates
    var gridH, gridV; // horizontal and vertical grid position
    if (isDist) {
      gridH = null; gridV = null; // distributed highlights a full row/column
    } else {
      var normJC = _normalizeFlexVal(justifyContent, 'jc');
      var normAI = _normalizeFlexVal(alignItems, 'ai');
      if (isColumn) {
        gridH = normAI; // CSS align-items → horizontal position
        gridV = normJC; // CSS justify-content → vertical position
      } else {
        gridH = normJC; // CSS justify-content → horizontal position
        gridV = normAI; // CSS align-items → vertical position
      }
    }

    // For distributed mode, only the cross-axis matters
    var crossAI = _normalizeFlexVal(alignItems, 'ai');

    var matched = false;
    document.querySelectorAll('#pp-align9-grid .pp-align9-cell').forEach(function (cell) {
      var isMatch;
      if (isDist) {
        // Distributed: highlight cells along the CROSS axis
        if (isColumn) {
          isMatch = cell.dataset.jc === crossAI; // cross axis is horizontal
        } else {
          isMatch = cell.dataset.ai === crossAI; // cross axis is vertical
        }
      } else {
        isMatch = cell.dataset.jc === gridH && cell.dataset.ai === gridV;
      }
      cell.classList.toggle('active', isMatch);
      cell.classList.toggle('distributed', isDist);
      if (isMatch) matched = true;
    });

    if (!matched) {
      var first = document.querySelector('.pp-align9-cell[data-jc="flex-start"][data-ai="flex-start"]');
      if (first) first.classList.add('active');
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    init: init,
    populate: populate,
    getLayoutMode: getLayoutMode,
    getLastPopulateEl: getLastPopulateEl,
    setLastPopulateEl: setLastPopulateEl,
  };

}());
