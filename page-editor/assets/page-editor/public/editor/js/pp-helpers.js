/**
 * pp-helpers.js — Shared utility functions for the properties panel modules.
 *
 * Exposes: window.PPHelpers
 * Must be loaded BEFORE pp-layout.js, pp-appearance.js, properties-panel.js.
 */
'use strict';

window.PPHelpers = (function () {

  /** Get display value (inline preferred, else computed) */
  function val(propObj) {
    if (!propObj) return '';
    return propObj.inline || propObj.computed || '';
  }

  function setInput(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value || '';
  }

  function setInputFull(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value || '';
  }

  function setSelectValue(id, value) {
    var el = document.getElementById(id);
    if (!el || !value) return;
    var v = String(value).trim();
    if (id === 'pp-font-size') {
      // Now an input element — just set the raw value (strip 'px')
      el.value = v.replace(/px$/, '');
      return;
    }
    var opt = Array.from(el.options).find(function (o) {
      return o.value === v || v.startsWith(o.value);
    });
    if (opt) {
      el.value = opt.value;
    }
  }

  /** Ensure the current font-family has an option in the dropdown. Adds a custom entry if missing. */
  function ensureFontOption(fontFamily) {
    if (!fontFamily) return;
    var sel = document.getElementById('pp-font-family');
    if (!sel) return;

    // Normalize: strip quotes and extract first font name
    var firstFont = fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    if (!firstFont || firstFont === 'inherit') return;

    // Check if any existing option matches (compare first font name)
    var exists = Array.from(sel.options).some(function (opt) {
      var optFirst = opt.value.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
      return optFirst.toLowerCase() === firstFont.toLowerCase();
    });

    if (!exists) {
      // Remove any previous custom option (marked with data-custom)
      sel.querySelectorAll('option[data-custom]').forEach(function (o) { o.remove(); });

      // Add custom font option at position 1 (after "inherit")
      var customOpt = document.createElement('option');
      customOpt.value = fontFamily;
      customOpt.textContent = firstFont;
      customOpt.setAttribute('data-custom', 'true');
      sel.insertBefore(customOpt, sel.options[1] || null);
    }
  }

  function stripPx(value) {
    if (!value) return '';
    var s = String(value);
    if (s === 'normal' || s === 'none') return '0';
    return s.replace(/px$/, '');
  }

  /** Normalize gap value for display. Keep 'normal' as empty (shows placeholder). */
  function normalizeGap(value) {
    if (!value || value === 'normal' || value === 'none') return '';
    return String(value).replace(/px$/, '');
  }

  function extractImageUrl(bgImage) {
    var m = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
    return m ? m[1] : '';
  }

  /** Parse a CSS color string to {hex, alpha} */
  function _parseColor(color) {
    if (!color || color === 'transparent') return { hex: 'transparent', alpha: 0 };
    // rgba(r, g, b, a)
    var rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
    if (rgbaMatch) {
      var r = parseInt(rgbaMatch[1]), g = parseInt(rgbaMatch[2]), b = parseInt(rgbaMatch[3]);
      var a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
      var hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
      return { hex: hex, alpha: Math.round(a * 100) };
    }
    // Already hex
    if (color.charAt(0) === '#') return { hex: color.toUpperCase(), alpha: 100 };
    return { hex: color, alpha: 100 };
  }

  /** Create a generic property row (shared by fill, stroke, shadow, text-color). */
  function createPropRow(color, _unused, onSwatchClick, onRemove, inlineProp, cssPropName) {
    var parsed = _parseColor(color);

    // If onRemove provided, create wrapper: [prop-row] [remove-btn]
    var hasRemove = typeof onRemove === 'function';
    var wrap = hasRemove ? document.createElement('div') : null;
    if (wrap) wrap.className = 'pp-color-row-wrap';

    var el = document.createElement('div');
    el.className = 'pp-prop-row';

    // Blue inline indicator bar (no per-row reset — use header reset button)
    if (inlineProp && inlineProp.isInline) {
      el.classList.add('pp-prop-row--inline');
    }

    var swatch = document.createElement('button');
    swatch.className = 'pp-color-swatch';
    swatch.style.background = color || 'transparent';
    swatch.title = '选择颜色';

    // Editable hex input (replaces the old <span>)
    var valInput = document.createElement('input');
    valInput.className = 'pp-color-val pp-color-val--editable';
    valInput.type = 'text';
    valInput.value = parsed.hex || '';
    valInput.spellcheck = false;
    valInput.autocomplete = 'off';

    // Spacer between hex and opacity
    var spacer = document.createElement('div');
    spacer.className = 'pp-prop-spacer';

    // Opacity pill input
    var opacity = document.createElement('input');
    opacity.className = 'pp-prop-opacity-pill';
    opacity.type = 'text';
    opacity.value = String(parsed.alpha);
    opacity.title = '不透明度';

    swatch.addEventListener('click', function () { onSwatchClick(swatch, valInput); });

    // Hex input: commit on blur or Enter
    var _onColorEdit = null;
    function _commitHex() {
      var hex = valInput.value.trim();
      if (hex && !hex.startsWith('#')) hex = '#' + hex;
      if (!/^#[0-9a-f]{3,8}$/i.test(hex)) return; // invalid, ignore
      swatch.style.background = hex;
      valInput.value = hex.toUpperCase();
      if (_onColorEdit) _onColorEdit(hex, parseInt(opacity.value) || 100);
    }
    valInput.addEventListener('blur', _commitHex);
    valInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); valInput.blur(); } });

    // Opacity input: commit on blur or Enter
    function _commitOpacity() {
      var a = Math.min(100, Math.max(0, parseInt(opacity.value) || 0));
      opacity.value = String(a);
      if (_onColorEdit) _onColorEdit(valInput.value.trim(), a);
    }
    opacity.addEventListener('blur', _commitOpacity);
    opacity.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); opacity.blur(); } });

    el.appendChild(swatch);
    el.appendChild(valInput);
    el.appendChild(spacer);
    el.appendChild(opacity);

    if (hasRemove) {
      var removeBtn = document.createElement('button');
      removeBtn.className = 'pp-color-remove-btn';
      removeBtn.title = '移除';
      removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>';
      removeBtn.addEventListener('click', function (e) { e.stopPropagation(); onRemove(); });
      wrap.appendChild(el);
      wrap.appendChild(removeBtn);
      return { el: wrap, propRow: el, swatch: swatch, val: valInput, opacity: opacity,
        set onColorEdit(fn) { _onColorEdit = fn; } };
    }

    return { el: el, swatch: swatch, val: valInput, opacity: opacity,
      set onColorEdit(fn) { _onColorEdit = fn; } };
  }

  /** Convert iframe-relative element rect to screen (shell window) coordinates. */
  function getScreenRect(iframe, el) {
    var iframeRect = iframe.getBoundingClientRect();
    var elRect = el.getBoundingClientRect();
    return {
      top: iframeRect.top + elRect.top,
      left: iframeRect.left + elRect.left,
      right: iframeRect.left + elRect.right,
      bottom: iframeRect.top + elRect.bottom,
      width: elRect.width,
      height: elRect.height,
    };
  }

  /**
   * Set input value from a propObj (inline/computed) with inherited visual indicator.
   * Shows computed value (designers need to see actual numbers) but dims inherited values.
   */
  function setInputWithSource(id, propObj, fallback) {
    var el = document.getElementById(id);
    if (!el) return;
    var raw = propObj ? (propObj.inline || propObj.computed || fallback || '') : (fallback || '');
    el.value = stripPx(raw);
    el.classList.toggle('pp-val--inherited', propObj ? !propObj.isInline : true);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    val: val,
    parseColor: _parseColor,
    setInput: setInput,
    setInputWithSource: setInputWithSource,
    setInputFull: setInputFull,
    setSelectValue: setSelectValue,
    ensureFontOption: ensureFontOption,
    stripPx: stripPx,
    normalizeGap: normalizeGap,
    extractImageUrl: extractImageUrl,
    createPropRow: createPropRow,
    getScreenRect: getScreenRect,

    /**
     * Create a custom-styled select component.
     * @param {Object} opts
     * @param {string} opts.id - Unique ID for the component
     * @param {string} opts.value - Initial selected value
     * @param {Array<{value:string, label:string}>} opts.items - Options
     * @param {Function} opts.onChange - Callback(newValue) when selection changes
     * @returns {{ el: HTMLElement, getValue: Function, setValue: Function }}
     */
    createSelect: function(opts) {
      var _value = opts.value || '';
      var _items = opts.items || [];
      var _onChange = opts.onChange || function(){};
      var _menuEl = null;

      // Build the trigger element
      var el = document.createElement('div');
      el.className = 'pp-custom-select';
      if (opts.id) el.id = opts.id;

      // Optional inline label (e.g. "字重", "类型") — inside the trigger, left of value
      var labelEl = null;
      if (opts.label) {
        labelEl = document.createElement('span');
        labelEl.className = 'pp-select-label';
        labelEl.textContent = opts.label;
        el.appendChild(labelEl);
      }

      var display = document.createElement('span');
      display.className = 'pp-select-display';
      el.appendChild(display);

      var chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      chevron.setAttribute('class', 'pp-chevron');
      chevron.setAttribute('width', '10');
      chevron.setAttribute('height', '10');
      chevron.setAttribute('viewBox', '0 0 24 24');
      chevron.setAttribute('fill', 'none');
      chevron.setAttribute('stroke', 'currentColor');
      chevron.setAttribute('stroke-width', '2');
      chevron.setAttribute('stroke-linecap', 'round');
      chevron.setAttribute('stroke-linejoin', 'round');
      chevron.innerHTML = '<path d="m6 9 6 6 6-6"/>';
      el.appendChild(chevron);

      function _updateDisplay() {
        var found = _items.find(function(it) { return it.value === _value; });
        display.textContent = found ? found.label : _value;
      }
      _updateDisplay();

      function _openMenu(e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        _closeMenu();

        var rect = el.getBoundingClientRect();
        _menuEl = document.createElement('div');
        _menuEl.className = 'pp-dropdown';
        if (opts.ownerPanel) _menuEl.setAttribute('data-owner', opts.ownerPanel);
        _menuEl.style.left = rect.left + 'px';
        _menuEl.style.top = (rect.bottom + 4) + 'px';
        _menuEl.style.minWidth = rect.width + 'px';

        _items.forEach(function(item) {
          var btn = document.createElement('button');
          btn.className = 'pp-dropdown-item';
          if (item.value === _value) btn.classList.add('pp-dropdown-item--active');
          btn.appendChild(document.createTextNode(item.label));

          btn.addEventListener('click', function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            _value = item.value;
            _updateDisplay();
            _closeMenu();
            _onChange(_value);
          });
          _menuEl.appendChild(btn);
        });

        document.body.appendChild(_menuEl);

        // Clamp to viewport
        var menuRect = _menuEl.getBoundingClientRect();
        if (menuRect.bottom > window.innerHeight - 8) {
          _menuEl.style.top = (rect.top - menuRect.height - 4) + 'px';
        }

        el.classList.add('pp-select--open');
      }

      function _closeMenu() {
        if (_menuEl) {
          _menuEl.remove();
          _menuEl = null;
        }
        el.classList.remove('pp-select--open');
      }

      el.addEventListener('click', function(e) {
        if (el.classList.contains('pp-select--open')) {
          _closeMenu();
        } else {
          _openMenu(e);
        }
      });

      // Close on outside click — store ref for cleanup
      var _outsideHandler = function(e) {
        if (_menuEl && !_menuEl.contains(e.target) && !el.contains(e.target)) {
          _closeMenu();
        }
      };
      document.addEventListener('mousedown', _outsideHandler);

      return {
        el: el,
        getValue: function() { return _value; },
        setValue: function(v) { _value = v; _updateDisplay(); },
        setLabel: function(t) { if (labelEl) labelEl.textContent = t; },
        setItems: function(items) { _closeMenu(); _items = items; _updateDisplay(); },
        destroy: function() {
          document.removeEventListener('mousedown', _outsideHandler);
          _closeMenu();
        },
      };
    },
  };

}());
