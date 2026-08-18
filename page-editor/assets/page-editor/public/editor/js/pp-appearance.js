/**
 * pp-appearance.js — Appearance section of the properties panel.
 *
 * Handles: fill, stroke, shadow sections + flyouts + parsers + apply logic.
 *
 * Exposes: window.PPAppearance
 * Depends on: window.PPHelpers, window.EditorCore, window.ColorPickerPanel
 */
'use strict';

window.PPAppearance = (function () {

  // ── DOM refs ─────────────────────────────────────────────────────────────
  var _strokeFlyout = null;
  var _panel = null;

  // ── State ─────────────────────────────────────────────────────────────────
  var _fills   = [];
  var _strokes = [];
  var _shadows = [];
  var _shadowSelects = []; // track createSelect instances for cleanup
  var _strokeSelects = []; // track stroke type selects for cleanup

  var _activeFillIdx   = null;
  var _activeStrokeIdx = null;

  // Reference to main panel's closeFlyouts (to close dropdown too)
  var _closeDropdownFn = null;

  var _posSelect = null; // custom dropdown for stroke position

  // ── Init ──────────────────────────────────────────────────────────────────
  function init(panel, closeDropdownFn) {
    _panel = panel;
    _closeDropdownFn = closeDropdownFn;
    _strokeFlyout = document.getElementById('pp-stroke-flyout');

    _bindFillSection();
    _bindStrokeSection();
    _bindShadowSection();
    _bindStrokeFlyout();
    _bindShadowFlyout();
  }

  // ── Populate ──────────────────────────────────────────────────────────────
  function populate(s, isNewElement) {
    // ── Fill ────────────────────────────────────────────────────────────────
    // _fills is authoritative. Only re-parse from DOM for new elements.
    // Same-element refreshes (e.g. from change event) trust internal state
    // to avoid overwriting data while the color picker is open.
    if (isNewElement) {
      // backgroundColor: use inline || computed (safe — computed is a plain color like rgb(59,130,246))
      // backgroundImage: inline ONLY (computed may contain url() producing phantom rows)
      var bgColor = s.backgroundColor ? (s.backgroundColor.inline || s.backgroundColor.computed || '') : '';
      var bgImage = s.backgroundImage ? (s.backgroundImage.inline || '') : '';
      var bgIsInline = (s.backgroundColor && s.backgroundColor.isInline) ||
                       (s.backgroundImage && s.backgroundImage.isInline);
      _fills = _parseFills(bgColor, bgImage);
      // Row-level inherited mark: tag each fill object when color comes from stylesheet
      if (!bgIsInline) {
        _fills.forEach(function(f) { f.inherited = true; });
      }
      _renderFillRows(s.backgroundColor, s.backgroundImage);
    }

    // ── Stroke ──────────────────────────────────────────────────────────────
    // _strokes is the authoritative source. Only re-parse from DOM when
    // selecting a new element. For the same element, trust internal state
    // (outside/inside strokes use box-shadow, which _parseStrokes can't read).
    var strokeFlyoutOpen = _strokeFlyout && _strokeFlyout.classList.contains('pp-flyout--visible');
    if (isNewElement && !strokeFlyoutOpen) {
      // Try inline first; fallback to computed (same pattern as fill)
      _strokes = _parseStrokes(s, true); // true = inline only
      var strokeIsInline = _strokes.length > 0;
      if (!strokeIsInline) {
        _strokes = _parseStrokes(s, false); // fallback to computed
        // Mark as inherited (stylesheet-origin) so row renders read-only hint
        _strokes.forEach(function(st) { st.inherited = true; });
      }
      _renderStrokeRows(s);
    }

    // ── Shadow ──────────────────────────────────────────────────────────────
    // _shadows is authoritative. Only re-parse from DOM for new elements.
    // box-shadow is shared between strokes (outside/inside) and real shadows,
    // so re-parsing would misidentify stroke box-shadows as shadow rows.
    var shadowFlyoutOpen = _shadowFlyout && _shadowFlyout.classList.contains('pp-flyout--visible');
    if (isNewElement && !shadowFlyoutOpen) {
      // Only show shadows from INLINE styles to avoid phantom rows
      var boxShadowInline = s.boxShadow ? s.boxShadow.inline : '';
      _shadows = _parseShadows(boxShadowInline || 'none');
      _renderShadowRows(s.boxShadow);
    }

    // Single-stroke limit
    var strokeAddBtn = document.getElementById('pp-stroke-add');
    if (strokeAddBtn) {
      strokeAddBtn.disabled = _strokes.length >= 1;
      strokeAddBtn.title = _strokes.length >= 1 ? '已有描边，移除后可添加新的' : '添加描边';
    }
  }

  // ── Close flyouts ─────────────────────────────────────────────────────────
  function closeFlyouts() {
    if (_strokeFlyout) {
      _strokeFlyout.classList.remove('pp-flyout--visible');
      _strokeFlyout.style.opacity = '';  // clear RAF residual
    }
    if (_shadowFlyout) {
      _shadowFlyout.classList.remove('pp-flyout--visible');
      _shadowFlyout.style.opacity = '';  // clear RAF residual
    }
    _activeFillIdx = _activeStrokeIdx = null;
    _activeShadowIdx = null;
    if (_closeDropdownFn) _closeDropdownFn();
    document.querySelectorAll('.pp-edit-btn.active').forEach(function(b) { b.classList.remove('active'); });
  }

  // ── Position flyout beside a row element (prefer LEFT side) ──────────────
  // The flyout must already have pp-flyout--visible so offsetHeight is real.
  // Caller should set opacity:0 before calling, then restore after RAF.
  function _positionFlyout(flyout, anchorEl) {
    if (!flyout || !anchorEl || !_panel) return;

    // Make flyout measurable but invisible
    flyout.classList.add('pp-flyout--visible');
    flyout.style.opacity = '0';

    requestAnimationFrame(function () {
      var panelRect  = _panel.getBoundingClientRect();
      var anchorRect = anchorEl.getBoundingClientRect();
      var flyoutW    = flyout.offsetWidth || 210;
      var flyoutH    = flyout.offsetHeight || 220;
      var margin     = 4;
      var vpW        = window.innerWidth;
      var vpH        = window.innerHeight;

      // Prefer LEFT of panel; fall back to RIGHT if not enough space
      var left = panelRect.left - flyoutW - margin;
      if (left < margin) left = panelRect.right + margin;
      if (left + flyoutW > vpW - margin) left = vpW - flyoutW - margin;

      var top = anchorRect.top;
      if (top + flyoutH > vpH - margin) top = vpH - flyoutH - margin;
      if (top < margin) top = margin;

      flyout.style.left    = left + 'px';
      flyout.style.top     = top  + 'px';
      flyout.style.opacity = '';
    });
  }

  // ── Fill section ──────────────────────────────────────────────────────────
  function _bindFillSection() {
    var addBtn = document.getElementById('pp-fill-add');
    if (addBtn) addBtn.addEventListener('click', function () {
      _fills.push({ color: '#3B82F6' });
      _renderFillRows(null, null);
      _applyAllFills();
    });
  }

  /** Apply all fill layers as stacked CSS backgrounds (Figma-style: top layer first) */
  function _applyAllFills() {
    if (_fills.length === 0) {
      EditorCore.applyStyleProp('backgroundColor', 'transparent');
      EditorCore.applyStyleProp('backgroundImage', 'none');
      return;
    }
    var layers = [];
    var bottomColor = '';

    _fills.forEach(function (f) {
      var c = f.color;
      if (c.includes('gradient') || c.includes('url(')) {
        layers.push(c);
      } else {
        // Convert solid color to gradient layer for multi-layer stacking
        layers.push('linear-gradient(' + c + ', ' + c + ')');
        bottomColor = c;
      }
    });

    EditorCore.applyStyleProp('backgroundImage', layers.length ? layers.join(', ') : 'none');
    EditorCore.applyStyleProp('backgroundColor', bottomColor || 'transparent');
  }

  function _renderFillRows(bgColorProp, bgImageProp) {
    var container = document.getElementById('pp-fill-rows');
    if (!container) return;
    container.innerHTML = '';
    if (_fills.length === 0) return;

    // Detect CSS variable for background-color or background (for token label)
    var tokenName = _detectColorToken('background-color') || _detectColorToken('background');

    _fills.forEach(function (fill, idx) {
      var row = PPHelpers.createPropRow(fill.color, null, function (swatchEl, valEl) {
        _activeFillIdx = idx;
        // Clear inherited mark — user is actively editing this fill
        delete fill.inherited;
        if (row.el) row.el.classList.remove('pp-prop-row--inherited');
        closeFlyouts(); // close stroke/shadow flyout — fill edit is a separate context
        // If current fill is a token, default to libraries tab
        var isCurrentToken = valEl.classList.contains('pp-color-val--token');
        var openOpts = isCurrentToken ? { defaultTab: 'libraries' } : {};
        ColorPickerPanel.open('bg', swatchEl, function (c) {
          _fills[idx].color = c;
          // Check if this is a token reference (var(--xxx))
          var isToken = typeof c === 'string' && c.indexOf('var(--') === 0;
          var isGrad = typeof c === 'string' && c.includes('gradient');

          if (isToken) {
            // Extract token name for display
            var tn = c.match(/var\(\s*(--[^,)]+)/);
            var tokenDisplay = tn ? tn[1].trim() : c;
            valEl.value = tokenDisplay;
            valEl.classList.add('pp-color-val--token');
            valEl.readOnly = true;
            // Resolve actual color for swatch preview
            try {
              var iframe = document.getElementById('target-frame');
              var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
              var resolved = iframe.contentWindow.getComputedStyle(iframeDoc.documentElement).getPropertyValue(tokenDisplay).trim();
              if (resolved) swatchEl.style.background = resolved;
            } catch (e) { swatchEl.style.background = c; }
          } else if (isGrad) {
            valEl.value = '渐变';
            valEl.disabled = true;
            swatchEl.style.background = c;
          } else {
            var p = PPHelpers.parseColor(c);
            valEl.value = p.hex;
            valEl.disabled = false;
            valEl.readOnly = false;
            valEl.classList.remove('pp-color-val--token');
            if (row.opacity) row.opacity.value = String(p.alpha);
            swatchEl.style.background = c;
          }
          _applyAllFills();
        }, _fills[idx].color, openOpts);
      }, function () {
        _fills.splice(idx, 1);
        _applyAllFills();
        _renderFillRows(null, null);
      }, bgColorProp && bgColorProp.isInline ? bgColorProp : null, 'backgroundColor');
      // Direct hex/opacity edit (hex input or opacity pill)
      row.onColorEdit = function (hex, alpha) {
        // Build rgba color if alpha < 100
        var a = (alpha !== undefined && alpha !== null) ? alpha : 100;
        if (a < 100 && hex.charAt(0) === '#') {
          var r = parseInt(hex.slice(1, 3), 16) || 0;
          var g = parseInt(hex.slice(3, 5), 16) || 0;
          var b = parseInt(hex.slice(5, 7), 16) || 0;
          _fills[idx].color = 'rgba(' + r + ', ' + g + ', ' + b + ', ' + (a / 100) + ')';
        } else {
          _fills[idx].color = hex;
        }
        delete fill.inherited;
        _applyAllFills();
      };
      // Visual mark for stylesheet-inherited fills
      if (fill.inherited) {
        (row.el.querySelector ? row.el.querySelector('.pp-prop-row') || row.el : row.el)
          .classList.add('pp-prop-row--inherited');
      }
      // Show token name instead of hex value if this fill uses a CSS variable
      if (tokenName && idx === 0 && row.val) {
        row.val.value = tokenName;
        row.val.classList.add('pp-color-val--token');
        row.val.readOnly = true;
        row.val.title = tokenName + ' → ' + fill.color;
      }
      container.appendChild(row.el);
    });
  }

  // ── Stroke section ────────────────────────────────────────────────────────
  function _bindStrokeSection() {
    var addBtn = document.getElementById('pp-stroke-add');
    if (addBtn) addBtn.addEventListener('click', function () {
      if (addBtn.disabled) return;
      _strokes.push({ color: '#1A1A1A', width: 1, position: 'outside', style: 'solid', side: 'all' });
      _renderStrokeRows(null);
      _applyStrokes();
      addBtn.disabled = true;
      addBtn.title = '已有描边，移除后可添加新的';
    });
  }

  function _renderStrokeRows(borderProp) {
    var container = document.getElementById('pp-stroke-rows');
    if (!container) return;
    // Destroy old stroke selects
    if (_strokeSelects) _strokeSelects.forEach(function(s) { if (s.destroy) s.destroy(); });
    _strokeSelects = [];
    container.innerHTML = '';
    if (_strokes.length === 0) return;

    _strokes.forEach(function (stroke, idx) {
      var row = document.createElement('div');
      row.className = 'pp-stroke-row';

      // 1. Editor button (opens flyout)
      var editBtn = document.createElement('button');
      editBtn.className = 'pp-edit-btn';
      editBtn.title = '编辑描边';
      editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 7a24 24 0 0 1 0 10"/><path d="M4.5 7a24 24 0 0 0 0 10"/><path d="M7 19.5a24 24 0 0 0 10 0"/><path d="M7 4.5a24 24 0 0 1 10 0"/><rect x="17" y="17" width="5" height="5" rx="1"/><rect x="17" y="2" width="5" height="5" rx="1"/><rect x="2" y="17" width="5" height="5" rx="1"/><rect x="2" y="2" width="5" height="5" rx="1"/></svg>';
      editBtn.addEventListener('click', function () {
        // Toggle flyout
        var isOpen = _strokeFlyout && _strokeFlyout.classList.contains('pp-flyout--visible') && _activeStrokeIdx === idx;
        closeFlyouts();
        if (!isOpen) {
          _activeStrokeIdx = idx;
          // Clear inherited mark — user is actively editing
          delete stroke.inherited;
          row.classList.remove('pp-prop-row--inherited');
          _populateStrokeFlyout(idx);
          _positionFlyout(_strokeFlyout, editBtn);
          // pp-flyout--visible is set inside _positionFlyout
          editBtn.classList.add('active');
        }
      });
      row.appendChild(editBtn);

      // 2. Type select (外描边/内描边/居中)
      var posMap = { outside: '外描边', inside: '内描边', center: '居中' };
      var typeSelect = PPHelpers.createSelect({
        label: '类型',
        value: stroke.position || 'outside',
        items: [
          { value: 'outside', label: '外描边' },
          { value: 'inside', label: '内描边' },
          { value: 'center', label: '居中' },
        ],
        onChange: function(v) {
          _strokes[idx].position = v;
          _applyStrokes();
        }
      });
      _strokeSelects.push(typeSelect);
      row.appendChild(typeSelect.el);

      // 3. Thickness input (72px)
      var thickWrap = document.createElement('div');
      thickWrap.className = 'pp-inline-input';
      thickWrap.style.width = '72px';
      thickWrap.style.flexShrink = '0';
      var thickLabel = document.createElement('span');
      thickLabel.className = 'pp-inline-label';
      thickLabel.textContent = '粗细';
      var thickInput = document.createElement('input');
      thickInput.className = 'pp-inline-val';
      thickInput.type = 'text';
      thickInput.value = stroke.width || '1';
      thickInput.addEventListener('change', function () {
        var val = parseFloat(thickInput.value) || 1;
        _strokes[idx].width = val;
        // Clear inherited mark — user is actively editing
        delete stroke.inherited;
        row.classList.remove('pp-prop-row--inherited');
        _applyStrokes();
      });
      thickInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') thickInput.dispatchEvent(new Event('change'));
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          var d = e.shiftKey ? 10 : 1;
          var cur = parseFloat(thickInput.value) || 1;
          thickInput.value = String(Math.max(0, cur + (e.key === 'ArrowUp' ? d : -d)));
          thickInput.dispatchEvent(new Event('change'));
        }
      });
      thickWrap.appendChild(thickLabel);
      thickWrap.appendChild(thickInput);
      row.appendChild(thickWrap);

      // 4. Delete button
      var delBtn = document.createElement('button');
      delBtn.className = 'pp-color-remove-btn';
      delBtn.title = '删除描边';
      delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>';
      delBtn.addEventListener('click', function () {
        _strokes.splice(idx, 1);
        _renderStrokeRows(null);
        _applyStrokes();
        var addBtn = document.getElementById('pp-stroke-add');
        if (addBtn) { addBtn.disabled = false; addBtn.title = '添加描边'; }
      });
      row.appendChild(delBtn);

      // Visual mark for stylesheet-inherited strokes
      if (stroke.inherited) {
        row.classList.add('pp-prop-row--inherited');
      }

      container.appendChild(row);
    });

    // Restore active edit button if flyout is open
    if (_strokeFlyout && _strokeFlyout.classList.contains('pp-flyout--visible') && _activeStrokeIdx !== null) {
      var activeRow = container.children[_activeStrokeIdx];
      if (activeRow) {
        var btn = activeRow.querySelector('.pp-edit-btn');
        if (btn) btn.classList.add('active');
      }
    }
  }

  // ── Shadow section ────────────────────────────────────────────────────────
  function _bindShadowSection() {
    var addBtn = document.getElementById('pp-shadow-add');
    if (addBtn) addBtn.addEventListener('click', function () {
      _shadows.push({ type: '', x: 0, y: 4, blur: 8, spread: 0, color: 'rgba(0,0,0,0.25)' });
      _renderShadowRows(null);
      _applyShadows();
    });
  }

  var _shadowFlyout = null;
  var _activeShadowIdx = null;
  var _shadowFlyoutTypeSelect = null;

  function _renderShadowRows(boxShadowProp) {
    var container = document.getElementById('pp-shadow-rows');
    if (!container) return;
    _shadowSelects.forEach(function(s) { if (s.destroy) s.destroy(); });
    _shadowSelects = [];
    container.innerHTML = '';
    if (_shadows.length === 0) return;

    _shadows.forEach(function (shadow, idx) {
      var row = document.createElement('div');
      row.className = 'pp-shadow-row';

      // 1. Editor button (opens shadow flyout)
      var editBtn = document.createElement('button');
      editBtn.className = 'pp-edit-btn';
      editBtn.title = '编辑阴影';
      editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2"/><path d="M9 21h1"/><path d="M14 21h1"/></svg>';
      editBtn.addEventListener('click', function () {
        var isOpen = _shadowFlyout && _shadowFlyout.classList.contains('pp-flyout--visible') && _activeShadowIdx === idx;
        closeFlyouts();
        if (!isOpen) {
          _activeShadowIdx = idx;
          _populateShadowFlyout(idx);
          _positionFlyout(_shadowFlyout, editBtn);
          // pp-flyout--visible is set inside _positionFlyout
          editBtn.classList.add('active');
        }
      });
      row.appendChild(editBtn);

      // 2. Type select (外投影/内投影)
      var typeSelect = PPHelpers.createSelect({
        label: '类型',
        value: shadow.type || '',
        items: [
          { value: '', label: '外投影' },
          { value: 'inset', label: '内投影' },
        ],
        onChange: function(v) {
          _shadows[idx].type = v;
          _applyShadows();
        }
      });
      _shadowSelects.push(typeSelect);
      row.appendChild(typeSelect.el);

      // 3. Delete button
      var delBtn = document.createElement('button');
      delBtn.className = 'pp-color-remove-btn';
      delBtn.title = '删除阴影';
      delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>';
      delBtn.addEventListener('click', function () {
        _shadows.splice(idx, 1);
        _renderShadowRows(null);
        _applyShadows();
      });
      row.appendChild(delBtn);

      container.appendChild(row);
    });

    // Restore active edit button if flyout is open
    if (_shadowFlyout && _shadowFlyout.classList.contains('pp-flyout--visible') && _activeShadowIdx !== null) {
      var activeRow = container.children[_activeShadowIdx];
      if (activeRow) {
        var btn = activeRow.querySelector('.pp-edit-btn');
        if (btn) btn.classList.add('active');
      }
    }
  }

  // ── Shadow flyout ────────────────────────────────────────────────────────
  function _bindShadowFlyout() {
    _shadowFlyout = document.getElementById('pp-shadow-flyout');
    if (!_shadowFlyout) return;

    // Close button
    var closeBtn = _shadowFlyout.querySelector('.pp-flyout-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { closeFlyouts(); });

    // Type select in flyout
    var typeWrap = document.getElementById('ppshf-type-wrap');
    if (typeWrap) {
      _shadowFlyoutTypeSelect = PPHelpers.createSelect({
        id: 'ppshf-type',
        label: '类型',
        value: '',
        items: [
          { value: '', label: '外投影' },
          { value: 'inset', label: '内投影' },
        ],
        onChange: function(v) {
          if (_activeShadowIdx === null) return;
          _shadows[_activeShadowIdx].type = v;
          _applyShadows();
          _renderShadowRows(null);
        }
      });
      typeWrap.appendChild(_shadowFlyoutTypeSelect.el);
    }

    // Color row — build using createPropRow inside the flyout
    var colorWrap = document.getElementById('ppshf-color-row-wrap');
    if (colorWrap) {
      var colorRow = PPHelpers.createPropRow('rgba(0,0,0,0.25)', null, function (swatchEl, valEl) {
        if (_activeShadowIdx === null) return;
        ColorPickerPanel.open('bg', swatchEl, function (c) {
          _shadows[_activeShadowIdx].color = c;
          swatchEl.style.background = c;
          var p2 = PPHelpers.parseColor(c);
          valEl.value = p2.hex;
          // Sync opacity pill with alpha from color picker
          if (colorRow.opacity) colorRow.opacity.value = String(p2.alpha);
          _applyShadows();
        }, _shadows[_activeShadowIdx].color);
      }, null, null, 'boxShadow');
      colorWrap.appendChild(colorRow.el);
    }

    // Numeric inputs (text type with arrow key support)
    ['ppshf-x', 'ppshf-y', 'ppshf-blur', 'ppshf-spread'].forEach(function(id) {
      var inp = document.getElementById(id);
      if (!inp) return;
      var field = id.replace('ppshf-', '');
      inp.addEventListener('change', function () {
        if (_activeShadowIdx === null) return;
        var v = parseFloat(inp.value) || 0;
        if (field === 'blur') v = Math.max(0, v); // blur cannot be negative
        _shadows[_activeShadowIdx][field] = v;
        inp.value = String(v);
        _applyShadows();
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') inp.dispatchEvent(new Event('change'));
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          var delta = e.shiftKey ? 10 : 1;
          var cur = parseFloat(inp.value) || 0;
          var newVal = cur + (e.key === 'ArrowUp' ? delta : -delta);
          if (field === 'blur') newVal = Math.max(0, newVal);
          inp.value = String(newVal);
          inp.dispatchEvent(new Event('change'));
        }
      });
    });
  }

  function _populateShadowFlyout(idx) {
    var s = _shadows[idx];
    if (!s) return;

    if (_shadowFlyoutTypeSelect) _shadowFlyoutTypeSelect.setValue(s.type || '');

    var fields = { x: 'ppshf-x', y: 'ppshf-y', blur: 'ppshf-blur', spread: 'ppshf-spread' };
    Object.keys(fields).forEach(function(f) {
      var inp = document.getElementById(fields[f]);
      if (inp) inp.value = s[f] !== undefined ? s[f] : 0;
    });

    // Color row
    var colorWrap = document.getElementById('ppshf-color-row-wrap');
    if (colorWrap) {
      var swatch = colorWrap.querySelector('.pp-color-swatch');
      var valEl = colorWrap.querySelector('.pp-color-val');
      if (swatch) swatch.style.background = s.color || 'rgba(0,0,0,0.25)';
      if (valEl) {
        var pc = PPHelpers.parseColor(s.color || 'rgba(0,0,0,0.25)');
        valEl.textContent = pc.hex;
      }
    }
  }

  // ── Stroke flyout ─────────────────────────────────────────────────────────
  function _bindStrokeFlyout() {
    if (!_strokeFlyout) return;

    // Close button
    var closeBtn = _strokeFlyout.querySelector('.pp-flyout-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { closeFlyouts(); });

    // Color row — build using createPropRow inside the flyout
    var colorWrap = document.getElementById('ppsf-color-row-wrap');
    if (colorWrap) {
      var colorRow = PPHelpers.createPropRow('#000', null, function (swatchEl, valEl) {
        if (_activeStrokeIdx === null) return;
        ColorPickerPanel.open('bg', swatchEl, function (c) {
          _strokes[_activeStrokeIdx].color = c;
          swatchEl.style.background = c;
          var p3 = PPHelpers.parseColor(c);
          valEl.value = p3.hex;
          // Sync opacity pill with alpha from color picker
          if (colorRow.opacity) colorRow.opacity.value = String(p3.alpha);
          _applyStrokes();
          _renderStrokeRows(null);
        }, _strokes[_activeStrokeIdx].color);
      }, null, null, 'border');
      colorWrap.appendChild(colorRow.el);
    }

    // Width input
    var widthEl = document.getElementById('ppsf-width');
    if (widthEl) {
      widthEl.addEventListener('change', function () {
        if (_activeStrokeIdx === null) return;
        _strokes[_activeStrokeIdx].width = parseFloat(widthEl.value) || 1;
        _applyStrokes();
        _renderStrokeRows(null);
      });
      widthEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') widthEl.dispatchEvent(new Event('change'));
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          var d = e.shiftKey ? 10 : 1;
          var cur = parseFloat(widthEl.value) || 1;
          widthEl.value = String(Math.max(0, cur + (e.key === 'ArrowUp' ? d : -d)));
          widthEl.dispatchEvent(new Event('change'));
        }
      });
    }

    // Position select — custom dropdown
    var posWrap = document.getElementById('ppsf-position-wrap');
    if (posWrap) {
      _posSelect = PPHelpers.createSelect({
        id: 'ppsf-position',
        label: '类型',
        value: 'outside',
        items: [
          { value: 'outside', label: 'Outside' },
          { value: 'inside', label: 'Inside' },
          { value: 'center', label: 'Center' },
        ],
        onChange: function(v) {
          if (_activeStrokeIdx === null) return;
          _strokes[_activeStrokeIdx].position = v;
          _applyStrokes();
          _renderStrokeRows(null);
        }
      });
      posWrap.appendChild(_posSelect.el);
    }

    // Style buttons
    document.querySelectorAll('.pp-stroke-style-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (_activeStrokeIdx === null) return;
        document.querySelectorAll('.pp-stroke-style-btn').forEach(function (b) { b.classList.remove('pp-stroke-style-btn--active'); });
        btn.classList.add('pp-stroke-style-btn--active');
        _strokes[_activeStrokeIdx].style = btn.dataset.style;
        _applyStrokes();
      });
    });

    // Side buttons
    document.querySelectorAll('.pp-side-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (_activeStrokeIdx === null) return;
        document.querySelectorAll('.pp-side-btn').forEach(function (b) { b.classList.remove('pp-side-btn--active'); });
        btn.classList.add('pp-side-btn--active');
        _strokes[_activeStrokeIdx].side = btn.dataset.side;
        _applyStrokes();
      });
    });
  }

  function _populateStrokeFlyout(idx) {
    var stroke = _strokes[idx];
    if (!stroke) return;
    // Color row
    var colorWrap = document.getElementById('ppsf-color-row-wrap');
    if (colorWrap) {
      var swatch = colorWrap.querySelector('.pp-color-swatch');
      var val = colorWrap.querySelector('.pp-color-val');
      if (swatch) swatch.style.background = stroke.color || '#000';
      if (val) {
        var pc2 = PPHelpers.parseColor(stroke.color || '#000');
        val.textContent = pc2.hex;
      }
    }
    var widthEl = document.getElementById('ppsf-width');
    if (widthEl) widthEl.value = stroke.width || 1;
    if (_posSelect) _posSelect.setValue(stroke.position || 'outside');
    document.querySelectorAll('.pp-stroke-style-btn').forEach(function (b) {
      b.classList.toggle('pp-stroke-style-btn--active', b.dataset.style === (stroke.style || 'solid'));
    });
    document.querySelectorAll('.pp-side-btn').forEach(function (b) {
      b.classList.toggle('pp-side-btn--active', b.dataset.side === (stroke.side || 'all'));
    });
  }

  // ── Apply strokes to element ──────────────────────────────────────────────
  function _applyStrokes() {
    if (_strokes.length === 0) {
      EditorCore.applyStyleProp('border', 'none');
      EditorCore.applyStyleProp('outline', '');
      _applyMergedBoxShadow();
      return;
    }
    var s = _strokes[0];
    var w = (s.width || 1) + 'px';
    var style = s.style || 'solid';
    var color = s.color || '#000';
    var side  = s.side || 'all';
    var pos   = s.position || 'outside';

    // Clear border-related properties first
    EditorCore.applyStyleProp('border', 'none');
    EditorCore.applyStyleProp('outline', '');

    if (pos === 'center') {
      // Center (default CSS border behavior)
      if (side === 'all') {
        EditorCore.applyStyleProp('border', w + ' ' + style + ' ' + color);
      } else {
        var propName = 'border' + side.charAt(0).toUpperCase() + side.slice(1);
        EditorCore.applyStyleProp(propName, w + ' ' + style + ' ' + color);
      }
    }
    // inside/outside use box-shadow — merged with shadows
    _applyMergedBoxShadow();
  }

  // ── Apply shadows to element ──────────────────────────────────────────────
  function _applyShadows() {
    _applyMergedBoxShadow();
  }

  /** Merge stroke (inside/outside) and shadow box-shadow parts into one value */
  function _applyMergedBoxShadow() {
    var parts = [];

    // Stroke part (inside/outside only — center uses CSS border)
    if (_strokes.length > 0) {
      var s = _strokes[0];
      var pos = s.position || 'outside';
      if (pos !== 'center') {
        var w = (s.width || 1) + 'px';
        var color = s.color || '#000';
        var side = s.side || 'all';

        if (pos === 'inside') {
          if (side === 'all') {
            parts.push('inset 0 0 0 ' + w + ' ' + color);
          } else {
            var insetMap = {
              top:    'inset 0 '  + w + ' 0 0 ' + color,
              bottom: 'inset 0 -' + w + ' 0 0 ' + color,
              left:   'inset '    + w + ' 0 0 0 ' + color,
              right:  'inset -'   + w + ' 0 0 0 ' + color,
            };
            parts.push(insetMap[side] || 'inset 0 0 0 ' + w + ' ' + color);
          }
        } else { // outside
          if (side === 'all') {
            parts.push('0 0 0 ' + w + ' ' + color);
          } else {
            var outMap = {
              top:    '0 -' + w + ' 0 0 ' + color,
              bottom: '0 '  + w + ' 0 0 ' + color,
              left:   '-'   + w + ' 0 0 0 ' + color,
              right:  w     + ' 0 0 0 ' + color,
            };
            parts.push(outMap[side] || '0 0 0 ' + w + ' ' + color);
          }
        }
      }
    }

    // Shadow parts
    _shadows.forEach(function (sh) {
      var prefix = sh.type === 'inset' ? 'inset ' : '';
      parts.push(prefix + (sh.x || 0) + 'px ' + (sh.y || 0) + 'px ' + (sh.blur || 0) + 'px ' + (sh.spread || 0) + 'px ' + (sh.color || 'rgba(0,0,0,0.25)'));
    });

    EditorCore.applyStyleProp('boxShadow', parts.length > 0 ? parts.join(', ') : 'none');
  }

  // ── Parse helpers ─────────────────────────────────────────────────────────

  /** Check if a color value is effectively transparent / default */
  function _isTransparentOrDefault(c) {
    if (!c) return true;
    var n = c.replace(/\s+/g, '').toLowerCase();
    return n === 'transparent' || n === 'rgba(0,0,0,0)' || n === 'initial' || n === 'none' || n === '';
  }

  function _parseFills(bgColor, bgImage) {
    var fills = [];

    // Parse multi-layer backgroundImage: "linear-gradient(...), linear-gradient(...)"
    if (bgImage && bgImage !== 'none') {
      // Split by commas that are NOT inside parentheses
      var layers = _splitCssLayers(bgImage);
      layers.forEach(function (layer) {
        layer = layer.trim();
        if (!layer || layer === 'none') return;
        if (layer.includes('gradient')) {
          // Check if it's a solid-color gradient (linear-gradient(#xxx, #xxx))
          var solidMatch = layer.match(/^linear-gradient\(\s*([^,]+)\s*,\s*\1\s*\)$/);
          if (solidMatch) {
            fills.push({ color: solidMatch[1].trim() });
          } else {
            fills.push({ color: layer });
          }
        } else if (layer.includes('url(')) {
          fills.push({ color: bgColor || '#ffffff' });
        }
      });
    }

    // If no layers from backgroundImage, check backgroundColor
    if (fills.length === 0 && !_isTransparentOrDefault(bgColor)) {
      fills.push({ color: bgColor });
    }

    return fills;
  }

  /** Split CSS multi-value string by top-level commas (respecting parentheses) */
  function _splitCssLayers(str) {
    var result = [];
    var depth = 0;
    var start = 0;
    for (var i = 0; i < str.length; i++) {
      if (str[i] === '(') depth++;
      else if (str[i] === ')') depth--;
      else if (str[i] === ',' && depth === 0) {
        result.push(str.substring(start, i));
        start = i + 1;
      }
    }
    result.push(str.substring(start));
    return result;
  }

  function _parseStrokes(s, inlineOnly) {
    var strokes = [];
    // Use inline values to avoid phantom rows from stylesheet borders
    var src = inlineOnly ? 'inline' : 'computed';
    var btwVal  = s.borderTopWidth    ? (s.borderTopWidth[src]    || '0px') : '0px';
    var brwVal  = s.borderRightWidth  ? (s.borderRightWidth[src]  || '0px') : '0px';
    var bbwVal  = s.borderBottomWidth ? (s.borderBottomWidth[src] || '0px') : '0px';
    var blwVal  = s.borderLeftWidth   ? (s.borderLeftWidth[src]   || '0px') : '0px';
    var widths  = [btwVal, brwVal, bbwVal, blwVal].map(function (w) { return parseFloat(w) || 0; });
    var hasAny  = widths.some(function (w) { return w > 0; });

    if (hasAny) {
      var allSame = widths.every(function (w) { return w === widths[0]; });
      var borderColorVal = s.borderColor ? (s.borderColor.inline || s.borderColor.computed || '#000000') : '#000000';
      var borderStyleVal = s.borderStyle ? (s.borderStyle.inline || s.borderStyle.computed || 'solid') : 'solid';
      // Detect which side has the border when not all same
      var detectedSide = 'all';
      if (!allSame) {
        var sideNames = ['top', 'right', 'bottom', 'left'];
        var nonZero = widths.map(function (w, i) { return w > 0 ? sideNames[i] : null; }).filter(Boolean);
        detectedSide = nonZero.length === 1 ? nonZero[0] : 'all';
      }
      var maxWidth = Math.max.apply(null, widths);
      strokes.push({
        color:    borderColorVal || '#000000',
        width:    allSame ? widths[0] : maxWidth,
        position: 'outside',
        style:    borderStyleVal || 'solid',
        side:     detectedSide,
      });
    }
    return strokes;
  }

  function _parseShadows(boxShadow) {
    var shadows = [];
    if (!boxShadow || boxShadow === 'none') return shadows;

    var parts = _splitShadows(boxShadow);

    parts.forEach(function (part) {
      part = part.trim();
      if (!part) return;

      var isInset = part.startsWith('inset') || part.endsWith('inset');
      var clean = part.replace(/\binset\b/g, '').trim();

      var colorMatch = clean.match(/rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8}/);
      var color = colorMatch ? colorMatch[0] : 'rgba(0,0,0,0.25)';
      var numsStr = clean.replace(color, '').trim();
      var nums = numsStr.split(/\s+/).map(function (n) { return parseFloat(n); }).filter(function (n) { return !isNaN(n); });

      if (nums.length >= 2) {
        shadows.push({
          type:   isInset ? 'inset' : '',
          x:      nums[0] || 0,
          y:      nums[1] || 0,
          blur:   nums[2] || 0,
          spread: nums[3] || 0,
          color:  color,
        });
      }
    });

    return shadows;
  }

  function _splitShadows(str) {
    var parts = [];
    var depth = 0;
    var current = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    if (current) parts.push(current);
    return parts;
  }

  /**
   * Detect if a CSS property on the selected element uses a CSS variable.
   * Returns the variable name (e.g. "--color-code-bg") or null.
   */
  function _detectColorToken(cssProp) {
    try {
      var el = EditorCore.getSelectedEl();
      if (!el) return null;
      var doc = el.ownerDocument;
      var sheets = doc.styleSheets;
      var result = null;
      // Map background-color to also search 'background' shorthand
      var propsToSearch = [cssProp];
      if (cssProp === 'background-color') propsToSearch.push('background');
      if (cssProp === 'background') propsToSearch.push('background-color');

      for (var i = 0; i < sheets.length; i++) {
        var rules;
        try { rules = sheets[i].cssRules; } catch (e) { continue; }
        if (!rules) continue;
        for (var j = 0; j < rules.length; j++) {
          var rule = rules[j];
          if (rule.type !== 1 || !rule.selectorText) continue;
          try { if (!el.matches(rule.selectorText)) continue; } catch (e) { continue; }

          // Search both getPropertyValue and raw cssText
          for (var p = 0; p < propsToSearch.length; p++) {
            var val = rule.style.getPropertyValue(propsToSearch[p]);
            if (val && val.indexOf('var(') !== -1) {
              var m = val.match(/var\(\s*(--[^,)]+)/);
              if (m) result = m[1].trim();
            }
          }
          // Fallback: search rule.cssText directly (handles browser normalization)
          if (!result && rule.cssText && rule.cssText.indexOf('var(--') !== -1) {
            for (var p2 = 0; p2 < propsToSearch.length; p2++) {
              // Match "background: var(--xxx)" or "background-color: var(--xxx)"
              var re = new RegExp(propsToSearch[p2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*([^;]+)');
              var cm = rule.cssText.match(re);
              if (cm && cm[1].indexOf('var(') !== -1) {
                var m2 = cm[1].match(/var\(\s*(--[^,)]+)/);
                if (m2) result = m2[1].trim();
              }
            }
          }
        }
      }
      return result;
    } catch (e) {}
    return null;
  }

  // ── Reset internal state (called when element styles are reset) ──────────
  function resetState() {
    _strokes = [];
    _shadows = [];
    _fills   = [];
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    init: init,
    populate: populate,
    closeFlyouts: closeFlyouts,
    resetState: resetState,
  };

}());
