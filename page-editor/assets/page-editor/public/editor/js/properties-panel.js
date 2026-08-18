/**
 * properties-panel.js — Figma-style floating properties panel (coordinator)
 *
 * Public API:
 *   PropertiesPanel.init()
 *   PropertiesPanel.show(screenRect)   — called on element select
 *   PropertiesPanel.hide()             — called on deselect / exit edit mode
 *   PropertiesPanel.isVisible()
 *
 * Delegates layout to PPLayout, appearance to PPAppearance, helpers to PPHelpers.
 */
'use strict';

window.PropertiesPanel = (function () {

  // ── DOM refs ─────────────────────────────────────────────────────────────
  var _panel       = null;
  var _initialized = false;
  var _lastRect    = null;  // saved for reposition on resize

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    if (_initialized) return;
    _initialized = true;

    _panel = document.getElementById('pp-panel');
    if (!_panel) { console.warn('[PropertiesPanel] #pp-panel not found'); return; }

    _bindStaticControls();
    _initCustomDropdowns();
    _bindStateSelect();

    // Init sub-modules, passing required references
    PPLayout.init(_openDropdown);
    PPAppearance.init(_panel, _closeDropdown);

    _bindTypography();
    _bindImage();
    _bindDelete();
    _bindReset();

    // Outside click
    var _strokeFlyout = document.getElementById('pp-stroke-flyout');
    var _shadowFlyout = document.getElementById('pp-shadow-flyout');

    document.addEventListener('mousedown', function (e) {
      if (!_panel.classList.contains('pp-panel--visible')) return;
      if (_panel.contains(e.target)) return;
      if (_strokeFlyout && _strokeFlyout.contains(e.target)) return;
      if (_shadowFlyout && _shadowFlyout.contains(e.target)) return;
      if (e.target.closest && (e.target.closest('#color-picker-panel') || e.target.closest('#cpk-panel') || e.target.closest('#cpk-color-settings'))) return;
      // Don't close if clicking custom dropdown
      if (e.target.closest && e.target.closest('.pp-dropdown')) return;
      var iframe = document.getElementById('target-frame');
      if (iframe && e.target === iframe) return;
      hide();
    });
  }

  // ── Show / Hide ───────────────────────────────────────────────────────────
  function show(screenRect) {
    if (!_panel) return;
    _lastRect = screenRect;

    var wasVisible = _panel.classList.contains('pp-panel--visible');
    // Capture previous element BEFORE _populate() overwrites it
    var prevEl = PPLayout.getLastPopulateEl ? PPLayout.getLastPopulateEl() : null;

    _populate();

    var currentEl = EditorCore.getSelectedEl ? EditorCore.getSelectedEl() : null;

    if (wasVisible) {
      // Panel already on-screen — reposition immediately
      _position(screenRect);
      // If the selected element changed, close all floating sub-panels
      // (color picker, image picker, flyouts) — they belong to the old element
      if (currentEl && prevEl && currentEl !== prevEl) {
        _closeAllSubPanels();
      }
    } else {
      // First show: make panel measurable but visually hidden for one frame
      // so scrollHeight returns real values for positioning.
      _panel.classList.add('pp-panel--visible');
      _panel.style.opacity = '0';
      _panel.style.pointerEvents = 'none';
      requestAnimationFrame(function () {
        _position(screenRect);
        _panel.style.opacity = '';
        _panel.style.pointerEvents = '';
      });
      _closeAllSubPanels();
    }
  }

  /** Close all floating sub-panels (flyouts, color picker, image picker) */
  function _closeAllSubPanels() {
    PPAppearance.closeFlyouts();
    if (window.ColorPickerPanel && ColorPickerPanel.close) ColorPickerPanel.close();
    if (window.ImagePickerPanel && ImagePickerPanel.close) ImagePickerPanel.close();
  }

  function hide() {
    if (!_panel) return;
    _panel.classList.remove('pp-panel--visible');
    _closeAllSubPanels();
    PPLayout.setLastPopulateEl(null); // reset so next show resets aspect lock
    // Clear guide lines and flex overlay when panel is hidden (element deselected)
    if (window.Guides) Guides.clear();
    if (window.FlexOverlay) FlexOverlay.hide();
  }

  function isVisible() {
    return _panel && _panel.classList.contains('pp-panel--visible');
  }

  // ── Position panel ────────────────────────────────────────────────────────
  function _position(rect) {
    if (!rect) return;
    var panelW = 260;
    var margin = 8;
    var vpW = window.innerWidth;
    var vpH = window.innerHeight;
    var barH = 48; // top toolbar height (--pe-bar-height)
    var minTop = barH + margin; // panel must not overlap toolbar

    // ── Horizontal: prefer right of element, fall back to left ──
    var left = rect.right + margin;
    if (left + panelW > vpW - margin) left = rect.left - panelW - margin;
    if (left < margin) left = margin;

    // ── Vertical: measure real content height ──
    // Temporarily remove max-height so scrollHeight reflects natural size
    _panel.style.maxHeight = 'none';
    var naturalH = _panel.scrollHeight;

    var availableH = vpH - minTop - margin;
    var panelH = Math.min(naturalH, availableH);

    var top = rect.top;
    if (top + panelH > vpH - margin) top = vpH - panelH - margin;
    if (top < minTop) top = minTop;

    // Dynamic max-height: always fits between top and viewport bottom
    var maxH = vpH - top - margin;

    _panel.style.left      = left + 'px';
    _panel.style.top       = top  + 'px';
    _panel.style.maxHeight = maxH + 'px';
  }

  // ── Populate panel from selected element ─────────────────────────────────
  function _populate() {
    var s = EditorCore.readSelectedStyles();
    if (!s) return;

    // Tag badge + element name
    var tagEl = document.getElementById('pp-tag');
    var nameEl = document.getElementById('pp-el-name');
    if (tagEl) tagEl.textContent = s.tagName || 'div';
    if (nameEl) {
      var selEl = EditorCore.getSelectedEl();
      if (selEl) {
        if (selEl.id) nameEl.textContent = '#' + selEl.id;
        else {
          var cls = (typeof selEl.className === 'string' ? selEl.className : '').split(' ').filter(Boolean)[0];
          nameEl.textContent = cls ? ('.' + cls) : s.tagName;
        }
      } else {
        nameEl.textContent = '';
      }
    }

    var traits = s.traits || {};

    // ── Pseudo-state detection ─────────────────────────────────────────
    var stateSection = document.getElementById('pp-section-state');
    var stateDivider = document.getElementById('pp-divider-after-state');
    var stateSelect = document.getElementById('pp-state-select');
    var currentEl = EditorCore.getSelectedEl();

    if (stateSection && stateSelect && currentEl && window.StateEditor) {
      var iframe = document.getElementById('target-frame');
      var ifrDoc = iframe && iframe.contentDocument;
      if (ifrDoc) {
        var states = StateEditor.detectStates(currentEl, ifrDoc);
        if (states.length > 0) {
          stateSection.style.display = '';
          if (stateDivider) stateDivider.style.display = '';
          // Only rebuild options if element changed
          var prevVal = stateSelect.value;
          stateSelect.innerHTML = '<option value="">默认</option>';
          states.forEach(function (st) {
            var opt = document.createElement('option');
            opt.value = st;
            opt.textContent = st;
            stateSelect.appendChild(opt);
          });
          // Preserve current state selection if still valid
          if (StateEditor.isActive() && states.indexOf(StateEditor.currentState()) !== -1) {
            stateSelect.value = StateEditor.currentState();
          }
        } else {
          stateSection.style.display = 'none';
          if (stateDivider) stateDivider.style.display = 'none';
          if (StateEditor.isActive()) StateEditor.deactivateState(ifrDoc);
        }
      }
    }

    // Determine if this is a new element
    var isNewElement = currentEl !== PPLayout.getLastPopulateEl();
    PPLayout.setLastPopulateEl(currentEl);

    // ── Layout populate (coords, dimensions, spacing, radius, etc.) ────
    PPLayout.populate(s, isNewElement);

    // ── Trait-based section visibility ──────────────────────────────────
    var typoSection = document.getElementById('pp-section-typo');
    if (typoSection) typoSection.style.display = traits.isText ? '' : 'none';

    var imgSection = document.getElementById('pp-section-image');
    if (imgSection) imgSection.style.display = (traits.isImage || traits.canHaveBgImage) ? '' : 'none';

    var elType = traits.isImage ? 'image' : (traits.isText ? 'text' : 'generic');
    _panel.setAttribute('data-el-type', elType);

    // ── Appearance populate (fill, stroke, shadow) ─────────────────────
    PPAppearance.populate(s, isNewElement);

    // Refresh number scrubber bindings after panel repopulate
    if (window.NumberScrubber) NumberScrubber.refresh();

    // ── Typography ──────────────────────────────────────────────────────
    PPHelpers.setSelectValue('pp-font-size',   PPHelpers.stripPx(PPHelpers.val(s.fontSize)));
    PPHelpers.setSelectValue('pp-font-weight',  PPHelpers.val(s.fontWeight));
    // Font family: detect custom fonts not in preset list
    var currentFontFamily = PPHelpers.val(s.fontFamily);
    PPHelpers.ensureFontOption(currentFontFamily);
    PPHelpers.setSelectValue('pp-font-family', currentFontFamily);

    // Line height: show computed px value, or "Auto" for normal + inherited indicator
    var lhVal = PPHelpers.val(s.lineHeight);
    var lhComputed = s.lineHeight ? s.lineHeight.computed : '';
    var lhIsInline = s.lineHeight ? s.lineHeight.isInline : false;
    if (!lhVal || lhVal === 'normal') {
      var num = parseFloat(lhComputed);
      PPHelpers.setInput('pp-line-height', num ? String(Math.round(num * 10) / 10) : '');
      var lhEl = document.getElementById('pp-line-height');
      if (lhEl) { lhEl.placeholder = 'Auto'; lhEl.classList.toggle('pp-val--inherited', !lhIsInline); }
    } else {
      PPHelpers.setInput('pp-line-height', PPHelpers.stripPx(lhVal));
      var lhEl2 = document.getElementById('pp-line-height');
      if (lhEl2) lhEl2.classList.toggle('pp-val--inherited', !lhIsInline);
    }

    // Letter spacing: show px value, 0 for normal + inherited indicator
    var lsVal = PPHelpers.val(s.letterSpacing);
    var lsComputed = s.letterSpacing ? s.letterSpacing.computed : '';
    var lsIsInline = s.letterSpacing ? s.letterSpacing.isInline : false;
    if (!lsVal || lsVal === 'normal') {
      PPHelpers.setInput('pp-letter-spacing', '0');
    } else {
      var num2 = parseFloat(lsVal) || parseFloat(lsComputed) || 0;
      PPHelpers.setInput('pp-letter-spacing', String(Math.round(num2 * 10) / 10));
    }
    var lsEl = document.getElementById('pp-letter-spacing');
    if (lsEl) lsEl.classList.toggle('pp-val--inherited', !lsIsInline);
    _updateAlignButtons(PPHelpers.val(s.textAlign));
    _updateDecoButtons(PPHelpers.val(s.textDecoration));

    // Typography divider
    var dividerAfterTypo = document.getElementById('pp-divider-after-typo');
    if (dividerAfterTypo) dividerAfterTypo.style.display = traits.isText ? '' : 'none';

    // Text color row
    var textColorRows = document.getElementById('pp-text-color-rows');
    if (textColorRows) {
      textColorRows.innerHTML = '';
      var colorVal = PPHelpers.val(s.color) || '#000000';
      var row = PPHelpers.createPropRow(colorVal, null, function () {
        PPAppearance.closeFlyouts(); // close stroke/shadow flyout — text color is a separate context
        ColorPickerPanel.open('text', row.swatch, function (c) {
          EditorCore.applyColor(c, 'text');
          row.swatch.style.background = c;
          var p = PPHelpers.parseColor(c);
          row.val.value = p.hex;
          if (row.opacity) row.opacity.value = String(p.alpha);
        }, colorVal);
      }, null, s.color && s.color.isInline ? s.color : null, 'color');
      row.onColorEdit = function (hex, alpha) {
        var a = (alpha !== undefined && alpha !== null) ? alpha : 100;
        var color = hex;
        if (a < 100 && hex.charAt(0) === '#') {
          var r = parseInt(hex.slice(1, 3), 16) || 0;
          var g = parseInt(hex.slice(3, 5), 16) || 0;
          var b = parseInt(hex.slice(5, 7), 16) || 0;
          color = 'rgba(' + r + ', ' + g + ', ' + b + ', ' + (a / 100) + ')';
        }
        EditorCore.applyColor(color, 'text');
      };
      textColorRows.appendChild(row.el);
    }

    // Image row — only render when there IS an image, or element is <img>
    var imageRows = document.getElementById('pp-image-rows');
    if (imageRows) {
      imageRows.innerHTML = '';
      var selectedEl = EditorCore.getSelectedEl();
      var isImgEl = selectedEl && selectedEl.tagName === 'IMG';
      var currentSrc = isImgEl
        ? (selectedEl.src || '')
        : PPHelpers.extractImageUrl(PPHelpers.val(s.backgroundImage) || '');
      // <img>: always show row; others: only show if has bg-image
      if (isImgEl || currentSrc) {
        var imgRow = _createImageRow(currentSrc);
        imageRows.appendChild(imgRow.el);
      }
    }

    // Refresh custom dropdown display values
    _refreshDropdownDisplays();
  }

  // ── Pseudo-state select binding ─────────────────────────────────────────
  function _bindStateSelect() {
    var stateSelect = document.getElementById('pp-state-select');
    if (!stateSelect) return;

    stateSelect.addEventListener('change', function () {
      var state = this.value;
      var iframe = document.getElementById('target-frame');
      var ifrDoc = iframe && iframe.contentDocument;
      if (!ifrDoc) return;

      if (state) {
        var el = EditorCore.getSelectedEl();
        if (el) StateEditor.activateState(el, state, ifrDoc);
      } else {
        StateEditor.deactivateState(ifrDoc);
      }
      // Force appearance sections (fill/stroke/shadow) to re-parse from DOM
      // by resetting last populate element — state change means different styles
      PPAppearance.resetState();
      PPLayout.setLastPopulateEl(null);
      // Re-populate panel to show the state's styles
      _populate();
    });
  }

  // ── Static controls (close button) ───────────────────────────────────────
  function _bindStaticControls() {
    var closeBtn = document.getElementById('pp-close');
    if (closeBtn) closeBtn.addEventListener('click', hide);
  }

  // ── Custom Dropdowns (replace native <select>) ───────────────────────────
  var _activeDropdown = null;

  function _initCustomDropdowns() {
    // Convert all .pp-inline-select inside the panel to custom dropdowns
    _panel.querySelectorAll('.pp-inline-input--select').forEach(function (wrapper) {
      var select = wrapper.querySelector('select');
      if (!select) return;

      // Create display element
      var display = document.createElement('span');
      display.className = 'pp-select-display';
      display.textContent = select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : '';

      // Insert display before the chevron
      var chevron = wrapper.querySelector('.pp-chevron');
      if (chevron) wrapper.insertBefore(display, chevron);
      else wrapper.appendChild(display);

      // Click on wrapper opens dropdown
      wrapper.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (wrapper.classList.contains('pp-select--open')) {
          _closeDropdown();
          return;
        }
        _openDropdown(select, wrapper, display);
      });
    });

    // Global click to close
    document.addEventListener('mousedown', function (e) {
      if (_activeDropdown && !_activeDropdown.menu.contains(e.target)) {
        _closeDropdown();
      }
    });
  }

  function _openDropdown(select, wrapper, display) {
    _closeDropdown();

    var rect = wrapper.getBoundingClientRect();
    var menu = document.createElement('div');
    menu.className = 'pp-dropdown';
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.minWidth = rect.width + 'px';

    Array.from(select.options).forEach(function (opt, idx) {
      var item = document.createElement('button');
      item.className = 'pp-dropdown-item';
      if (select.selectedIndex === idx) item.classList.add('pp-dropdown-item--active');
      if (opt.disabled) item.classList.add('pp-dropdown-item--disabled');

      // Label
      var label = document.createTextNode(opt.text);
      item.appendChild(label);

      item.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (opt.disabled) return;
        select.value = opt.value;
        select.dispatchEvent(new Event('change'));
        display.textContent = opt.text;
        _closeDropdown();
      });

      menu.appendChild(item);
    });

    // Clamp to viewport
    document.body.appendChild(menu);
    var menuRect = menu.getBoundingClientRect();
    var vpH = window.innerHeight;
    if (menuRect.bottom > vpH - 8) {
      menu.style.top = (rect.top - menuRect.height - 4) + 'px';
    }

    wrapper.classList.add('pp-select--open');
    _activeDropdown = { menu: menu, wrapper: wrapper, select: select, display: display };
  }

  // ── Font-size custom dropdown (input + select hybrid) ───────────
  function _openFontSizeDropdown(wrapper, trigger, options) {
    _closeDropdown();

    var rect = wrapper.getBoundingClientRect();
    var menu = document.createElement('div');
    menu.className = 'pp-dropdown';
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.minWidth = rect.width + 'px';

    var currentVal = parseFloat(document.getElementById('pp-font-size').value) || 0;

    options.forEach(function (size) {
      var item = document.createElement('button');
      item.className = 'pp-dropdown-item';
      if (currentVal === size) item.classList.add('pp-dropdown-item--active');

      var label = document.createTextNode(size + 'px');
      item.appendChild(label);

      item.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var fsInput = document.getElementById('pp-font-size');
        if (fsInput) {
          fsInput.value = String(size);
          fsInput.dispatchEvent(new Event('change'));
        }
        _closeDropdown();
      });

      menu.appendChild(item);
    });

    // Clamp to viewport
    document.body.appendChild(menu);
    var menuRect = menu.getBoundingClientRect();
    var vpH = window.innerHeight;
    if (menuRect.bottom > vpH - 8) {
      menu.style.top = (rect.top - menuRect.height - 4) + 'px';
    }

    wrapper.classList.add('pp-select--open');
    _activeDropdown = { menu: menu, wrapper: wrapper };
  }

  function _closeDropdown() {
    if (!_activeDropdown) return;
    _activeDropdown.menu.remove();
    _activeDropdown.wrapper.classList.remove('pp-select--open');
    _activeDropdown = null;
  }

  // Update all custom dropdown display values (called during _populate)
  function _refreshDropdownDisplays() {
    if (!_panel) return;
    _panel.querySelectorAll('.pp-inline-input--select').forEach(function (wrapper) {
      var select = wrapper.querySelector('select');
      var display = wrapper.querySelector('.pp-select-display');
      if (select && display) {
        display.textContent = select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : '';
      }
    });
  }

  // ── Typography ────────────────────────────────────────────────────────────
  function _bindTypography() {
    var ff = document.getElementById('pp-font-family');
    if (ff) ff.addEventListener('change', function () { EditorCore.applyStyleProp('fontFamily', ff.value); });

    var fs = document.getElementById('pp-font-size');
    if (fs) {
      function _applyFontSize() {
        var v = fs.value.trim();
        if (!v) return;
        if (!/[a-z%]/i.test(v)) v += 'px';
        EditorCore.applyStyleProp('fontSize', v);
      }
      fs.addEventListener('change', _applyFontSize);
      fs.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); _applyFontSize(); fs.blur(); return; }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          var delta = e.shiftKey ? 10 : 1;
          var cur = parseFloat(fs.value) || 16;
          fs.value = String(Math.max(1, cur + (e.key === 'ArrowUp' ? delta : -delta)));
          _applyFontSize();
        }
      });

      // ── Font-size dropdown trigger ──────────────────────────────────
      var fsWrapper = fs.closest('.pp-inline-input--fontsize');
      var fsTrigger = fsWrapper ? fsWrapper.querySelector('.pp-fontsize-trigger') : null;
      if (fsTrigger) {
        var FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96, 128];
        fsTrigger.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (fsWrapper.classList.contains('pp-select--open')) {
            _closeDropdown();
            return;
          }
          _openFontSizeDropdown(fsWrapper, fsTrigger, FONT_SIZE_OPTIONS);
        });
      }
    }

    var fw = document.getElementById('pp-font-weight');
    if (fw) fw.addEventListener('change', function () { EditorCore.applyStyleProp('fontWeight', fw.value); });

    var lh = document.getElementById('pp-line-height');
    if (lh) {
      lh.addEventListener('change', function () {
        var v = lh.value.trim();
        if (v && !/[a-z%]/i.test(v)) v += 'px';
        EditorCore.applyStyleProp('lineHeight', v);
      });
      lh.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { lh.dispatchEvent(new Event('change')); return; }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          var delta = e.shiftKey ? 10 : 1;
          var cur = parseFloat(lh.value) || 0;
          lh.value = String(Math.max(1, cur + (e.key === 'ArrowUp' ? delta : -delta)));
          lh.dispatchEvent(new Event('change'));
        }
      });
    }

    var ls = document.getElementById('pp-letter-spacing');
    if (ls) {
      ls.addEventListener('change', function () {
        var v = ls.value.trim();
        if (v && v !== 'normal' && !/[a-z%]/i.test(v)) v += 'px';
        EditorCore.applyStyleProp('letterSpacing', v);
      });
      ls.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { ls.dispatchEvent(new Event('change')); return; }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          var delta = e.shiftKey ? 10 : 1;
          var cur = parseFloat(ls.value) || 0;
          ls.value = String(cur + (e.key === 'ArrowUp' ? delta : -delta));
          ls.dispatchEvent(new Event('change'));
        }
      });
    }

    document.querySelectorAll('.pp-align-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.pp-align-btn').forEach(function (b) { b.classList.remove('pp-align-btn--active'); });
        btn.classList.add('pp-align-btn--active');
        EditorCore.applyStyleProp('textAlign', btn.dataset.align);
      });
    });

    document.querySelectorAll('.pp-deco-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.classList.toggle('pp-deco-btn--active');
        var decorations = Array.from(document.querySelectorAll('.pp-deco-btn--active'))
          .map(function (b) { return b.dataset.deco; })
          .filter(function (d) { return d !== 'italic'; });
        var isItalic = document.querySelector('.pp-deco-btn[data-deco="italic"]')
          && document.querySelector('.pp-deco-btn[data-deco="italic"]').classList.contains('pp-deco-btn--active');

        EditorCore.applyStyleProp('textDecoration', decorations.join(' ') || 'none');
        EditorCore.applyStyleProp('fontStyle', isItalic ? 'italic' : 'normal');
      });
    });
  }

  // ── Image ─────────────────────────────────────────────────────────────────
  function _extractFilename(src) {
    if (!src) return '(无图片)';
    try {
      // Strip query/hash, then get last path segment
      var clean = src.split('?')[0].split('#')[0];
      var parts = clean.split('/');
      var name = parts[parts.length - 1] || '';
      if (name.length > 24) name = name.substring(0, 21) + '…';
      return name || '(无图片)';
    } catch (e) { return '(无图片)'; }
  }

  function _getCurrentFitMode() {
    var el = EditorCore.getSelectedEl();
    if (!el) return 'cover';
    if (el.tagName === 'IMG') {
      var fit = window.getComputedStyle(el).objectFit || 'cover';
      if (fit === 'fill' || fit === '') return 'cover';
      return fit;
    }
    var bgSize = el.style.backgroundSize || window.getComputedStyle(el).backgroundSize || '';
    if (bgSize === 'contain') return 'contain';
    if (bgSize === 'auto' || bgSize === 'none') return 'none';
    return 'cover';
  }

  function _createImageRow(src) {
    // This row is only created when there IS an image (src always truthy here)
    var wrap = document.createElement('div');
    wrap.className = 'pp-color-row-wrap pp-img-row-wrap';

    // ── Left: image swatch + filename ──────────────────────────────────
    var row = document.createElement('div');
    row.className = 'pp-prop-row pp-img-src-row';

    var swatch = document.createElement('button');
    swatch.className = 'pp-img-swatch';
    swatch.title = '替换图片';
    var thumbImg = document.createElement('img');
    thumbImg.src = src || '';
    swatch.appendChild(thumbImg);

    var label = document.createElement('span');
    label.className = 'pp-color-val';
    label.textContent = _extractFilename(src);

    var spacer = document.createElement('div');
    spacer.className = 'pp-prop-spacer';

    row.appendChild(swatch);
    row.appendChild(label);
    row.appendChild(spacer);

    // ── Middle: fit mode inline select ──────────────────────────────────
    var fitWrap = document.createElement('div');
    fitWrap.className = 'pp-img-fit-inline';

    var _fitSelectInst = null;
    if (window.PPHelpers && PPHelpers.createSelect) {
      _fitSelectInst = PPHelpers.createSelect({
        id: 'pp-img-fit-select',
        label: '适配',
        value: _getCurrentFitMode(),
        items: [
          { value: 'cover',   label: '铺满' },
          { value: 'contain', label: '包含' },
          { value: 'none',    label: '原始' },
        ],
        ownerPanel: 'pp-panel',
        onChange: function (val) {
          if (window.EditorCore) EditorCore.applyImageFit(val);
        },
      });
      fitWrap.appendChild(_fitSelectInst.el);
    }

    // ── Right: delete button (minus icon, same layout as fill row) ──────
    var removeBtn = document.createElement('button');
    removeBtn.className = 'pp-color-remove-btn';
    removeBtn.title = '删除背景图';
    removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>';

    wrap.appendChild(row);
    wrap.appendChild(fitWrap);
    wrap.appendChild(removeBtn);

    // ── Events ─────────────────────────────────────────────────────────
    var _currentSrc = src || '';

    // Click swatch → replace image
    swatch.addEventListener('click', function () {
      if (window.ImagePickerPanel) {
        var curFit = _fitSelectInst ? _fitSelectInst.getValue() : _getCurrentFitMode();
        ImagePickerPanel.open(swatch, _currentSrc, function (newSrc, originalPath) {
          _currentSrc = newSrc;
          EditorCore.applyImage(newSrc);
          thumbImg.src = newSrc;
          label.textContent = _extractFilename(originalPath || newSrc);
        }, curFit);
      }
    });

    // Click minus → remove bg-image, remove row, show + button
    removeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (window.EditorCore) {
        EditorCore.removeImage();
      }
      // Remove this row from DOM
      var imageRows = document.getElementById('pp-image-rows');
      if (imageRows) imageRows.innerHTML = '';
      // Show + button again
      var addBtn = document.getElementById('pp-image-add');
      if (addBtn) addBtn.style.display = '';
    });

    return { el: wrap, swatch: swatch, label: label, fitSelect: _fitSelectInst };
  }

  function _bindImage() {
    var addBtn = document.getElementById('pp-image-add');
    if (!addBtn) return;

    addBtn.addEventListener('click', function () {
      if (!window.ImagePickerPanel) return;
      // Open picker anchored to the + button
      ImagePickerPanel.open(addBtn, '', function (newSrc, originalPath) {
        if (!newSrc) return;
        // Apply bg-image to element
        EditorCore.applyImage(newSrc);
        // Create the image row
        var imageRows = document.getElementById('pp-image-rows');
        if (imageRows) {
          imageRows.innerHTML = '';
          var imgRow = _createImageRow(originalPath || newSrc);
          imageRows.appendChild(imgRow.el);
        }
        // Hide + button since we now have an image
        addBtn.style.display = 'none';
      });
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  function _bindDelete() {
    var delBtn = document.getElementById('pp-delete-el');
    if (delBtn) delBtn.addEventListener('click', function () {
      hide();
      EditorCore.deleteElement();
    });
  }

  // ── Reset (restore all inline styles) ─────────────────────────────────────
  function _bindReset() {
    var resetBtn = document.getElementById('pp-reset-el');
    if (!resetBtn) return;
    resetBtn.addEventListener('click', function () {
      var selectedEl = EditorCore.getSelectedEl();
      if (!selectedEl) return;
      var iframe = document.getElementById('target-frame');
      var iframeDoc = iframe ? (iframe.contentDocument || iframe.contentWindow.document) : null;
      if (!iframeDoc) return;
      if (!selectedEl.style.cssText) return; // nothing to reset

      var oldCssText = selectedEl.style.cssText;
      var cmd = UndoStack.capture(selectedEl, 'style', 'cssText', null, iframeDoc);
      selectedEl.style.cssText = '';
      cmd.newValue = '';
      UndoStack.record(cmd);

      // Track reset for AI consumption
      EditorCore.trackChange(selectedEl, '__reset__', '', oldCssText, 'reset');

      // Emit change to refresh guides/overlays
      if (EditorCore.emit) EditorCore.emit('change', { count: EditorCore.getChanges().length });

      // Reset appearance internal state so populate re-reads from DOM
      PPAppearance.resetState();
      // Force next populate to treat this as a new element
      PPLayout.setLastPopulateEl(null);

      // Refresh panel
      var panelRect = _panel.getBoundingClientRect();
      show(panelRect);
    });
  }

  function _updateAlignButtons(textAlign) {
    document.querySelectorAll('.pp-align-btn').forEach(function (b) {
      b.classList.toggle('pp-align-btn--active', b.dataset.align === textAlign);
    });
  }

  function _updateDecoButtons(textDecoration) {
    var td = textDecoration || '';
    document.querySelectorAll('.pp-deco-btn').forEach(function (b) {
      var deco = b.dataset.deco;
      if (deco === 'italic') {
        var el = EditorCore.getSelectedEl();
        if (el) {
          var iframe = document.getElementById('target-frame');
          var win = iframe && iframe.contentWindow;
          if (win) {
            var cs = win.getComputedStyle(el);
            b.classList.toggle('pp-deco-btn--active', cs.fontStyle === 'italic');
          }
        }
      } else {
        b.classList.toggle('pp-deco-btn--active', td.includes(deco));
      }
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return { init: init, show: show, hide: hide, isVisible: isVisible, getLastRect: function () { return _lastRect; } };

}());
