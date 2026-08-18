/**
 * color-picker-panel.js — Figma 风格颜色选择器面板（从 ColorPickerPanel.vue 抽离）
 *
 * 依赖 ColorPickerEngine (color-picker-engine.js)
 * 暴露为 window.ColorPickerPanel
 *
 * API:
 *   ColorPickerPanel.open(mode, popoverEl, onColorChange)
 *   ColorPickerPanel.close()
 *   ColorPickerPanel.destroy()
 */
'use strict';

window.ColorPickerPanel = (function () {

  // ===== 状态 =====
  let _panel       = null;   // panel DOM element
  let _mode        = 'bg';   // 'bg' | 'text'

  /** HTML-escape to prevent XSS from page-sourced CSS variable names */
  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  let _onColorChange = null; // callback(colorStr)
  let _lastSelectedToken = null; // last selected token name from libraries tab
  let _activeTab   = 'custom';
  let _hexValue    = '';
  let _alphaValue  = 100;
  let _angleValue  = 90;
  let _pageColors  = [];
  let _colorNotes  = {};
  let _showColorSettings = false;
  let _csOriginalHex = '';
  let _settingsHex = '';
  let _settingsNote = '';
  let _draggingStopIdx = -1;
  let _colorSettingsEl = null;

  // ===== Token Edit Mode (Task #105: Token 颜色编辑体验优化) =====
  // State for full spectrum/hue/alpha color picker in modal
  let _tokenEditMode   = false;
  let _tokenEditVar    = '';        // CSS variable name
  let _tokenEditDefInfo = null;     // Definition source
  let _tokenEditPanel  = null;      // Modal panel element
  let _tokenEditOldHex = '';        // Original hex (for undo)
  let _tokenEditOldResolved = '';  // Original computed value


  // DOM refs
  let _spectrumEl = null;
  let _hueEl      = null;
  let _alphaEl    = null;
  let _gradBarEl  = null;

  // ===== 快捷引用 =====
  const E = () => window.ColorPickerEngine;

  // ===== 初始化颜色 =====
  /** Initialize from a caller-provided color value (hex, rgb, rgba, gradient) */
  function _initColorFromValue(color) {
    if (!color || color === 'transparent') {
      E().setFillType('solid');
      E().setColorFromHex('#FFFFFF', 0);
      _syncInputs();
      return;
    }
    // Gradient
    if (color.includes('gradient')) {
      if (E().parseGradientString(color)) { _syncInputs(); return; }
    }
    // Solid color
    E().setFillType('solid');
    const hex = E().rgbToHex(color);
    const alpha = E().extractAlpha(color);
    E().setColorFromHex(hex === 'transparent' ? '#FFFFFF' : (hex || '#FFFFFF'), alpha != null ? alpha : 100);
    _syncInputs();
  }

  /** Initialize color by reading from the selected element's styles */
  function _initColorForMode() {
    const iframe = document.getElementById('target-frame');
    if (_mode === 'bg') {
      // Try to read background from selected element via EditorCore
      let bgColor = '';
      let bgImage = '';
      try {
        const styles = window.EditorCore && window.EditorCore.readSelectedStyles();
        if (styles) {
          const bgProp = styles.backgroundColor;
          const bgImgProp = styles.backgroundImage;
          bgColor = bgProp ? (bgProp.inline || bgProp.computed || '') : '';
          bgImage = bgImgProp ? (bgImgProp.inline || bgImgProp.computed || '') : '';
        }
      } catch(e) {}

      if (bgImage && bgImage !== 'none' &&
          (bgImage.includes('linear-gradient') || bgImage.includes('radial-gradient'))) {
        if (E().parseGradientString(bgImage)) { _syncInputs(); return; }
      }
      E().setFillType('solid');
      const hex = E().rgbToHex(bgColor);
      const alpha = bgColor === 'transparent' ? 0 : E().extractAlpha(bgColor);
      E().setColorFromHex(hex === 'transparent' ? '#FFFFFF' : (hex || '#FFFFFF'), alpha);
    } else {
      E().setFillType('solid');
      let textColor = '';
      try {
        const styles = window.EditorCore && window.EditorCore.readSelectedStyles();
        if (styles) {
          const colorProp = styles.color;
          textColor = colorProp ? (colorProp.inline || colorProp.computed || '') : '';
        }
      } catch(e) {}
      const hex = E().rgbToHex(textColor) || '#000000';
      E().setColorFromHex(hex === 'transparent' ? '#000000' : hex, 100);
    }
    _syncInputs();
  }

  function _syncInputs() {
    _hexValue   = E().currentHex().substring(1);
    _alphaValue = E().getState().a;
    _angleValue = E().getGradientAngle();
  }

  // ===== DOM 构建 =====
  function _buildPanel() {
    const div = document.createElement('div');
    div.id = 'cpk-panel';
    div.className = 'cpk-panel';
    div.style.display = 'none';
    document.body.appendChild(div);
    _panel = div;

    // Prevent clicks inside panel from closing it
    _panel.addEventListener('mousedown', e => e.stopPropagation());

    _render();
    return _panel;
  }

  function _render() {
    if (!_panel) return;
    const isBgMode  = _mode === 'bg';
    const fillType  = E().getFillType();
    const isGradient = fillType !== 'solid';
    const isLinear   = fillType === 'linear';
    const state = E().getState();
    const specBg = E().spectrumBg();
    const specCursor = E().spectrumCursorStyle();
    const hueThumb = E().hueThumbStyle();
    const alphaGrad = E().alphaGradient();
    const alphaThumb = E().alphaThumbStyle();

    _panel.innerHTML = `
      <!-- Toolbar -->
      <div class="cpk-toolbar">
        ${isBgMode ? `
        <div class="cpk-fill-type">
          <button class="cpk-fill-btn${fillType==='solid'?' cpk-fill-btn--on':''}" data-fill="solid" title="纯色">
            <svg viewBox="0 0 16 16" width="13" height="13"><rect x="2" y="2" width="12" height="12" rx="2" fill="currentColor"/></svg>
          </button>
          <button class="cpk-fill-btn${fillType==='linear'?' cpk-fill-btn--on':''}" data-fill="linear" title="线性渐变">
            <svg viewBox="0 0 16 16" width="13" height="13"><defs><linearGradient id="lg-icon" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="currentColor" stop-opacity="0.1"/><stop offset="100%" stop-color="currentColor"/></linearGradient></defs><rect x="2" y="2" width="12" height="12" rx="2" fill="url(#lg-icon)"/></svg>
          </button>
          <button class="cpk-fill-btn${fillType==='radial'?' cpk-fill-btn--on':''}" data-fill="radial" title="径向渐变">
            <svg viewBox="0 0 16 16" width="13" height="13"><defs><radialGradient id="rg-icon" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="currentColor"/><stop offset="100%" stop-color="currentColor" stop-opacity="0.05"/></radialGradient></defs><rect x="2" y="2" width="12" height="12" rx="2" fill="url(#rg-icon)"/></svg>
          </button>
        </div>
        ` : ''}
        <div class="cpk-toolbar-spacer"></div>
        <div class="cpk-tabs-mini">
          <button class="cpk-tab-mini${_activeTab==='custom'?' cpk-tab-mini--on':''}" data-tab="custom">自定义</button>
          <button class="cpk-tab-mini${_activeTab==='libraries'?' cpk-tab-mini--on':''}" data-tab="libraries">色板库</button>
        </div>
        <button class="cpk-close-btn" id="cpk-close-btn" title="关闭">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/>
          </svg>
        </button>
      </div>

      <!-- Custom tab -->
      <div class="cpk-custom" style="display:${_activeTab==='custom'?'block':'none'}">
        <!-- Spectrum -->
        <div id="cpk-spectrum" class="cpk-spectrum" style="--hue-bg:${specBg}">
          <div class="cpk-spectrum__clip">
            <div class="cpk-spectrum__white"></div>
            <div class="cpk-spectrum__black"></div>
          </div>
          <div class="cpk-spectrum__cursor" style="left:${specCursor.left};top:${specCursor.top};background:${specCursor.background}"></div>
        </div>

        <!-- Slider row -->
        <div class="cpk-slider-row">
          <button class="cpk-eyedrop-btn" id="cpk-eyedrop-btn" title="吸取颜色">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <path d="M2 22l4-1L19 8a2.83 2.83 0 0 0-4-4L2 17v5z"/>
              <path d="M15.5 4.5l4 4"/>
            </svg>
          </button>
          <div class="cpk-sliders">
            <div id="cpk-hue" class="cpk-slider cpk-slider--hue">
              <div class="cpk-slider__track-hue"></div>
              <div class="cpk-slider__thumb" style="left:${hueThumb.left};background:${hueThumb.background}"></div>
            </div>
            <div id="cpk-alpha" class="cpk-slider cpk-slider--alpha">
              <div class="cpk-slider__alpha-track">
                <div class="cpk-slider__alpha-checker"></div>
                <div class="cpk-slider__alpha-gradient" style="background:${alphaGrad}"></div>
              </div>
              <div class="cpk-slider__thumb" style="left:${alphaThumb.left};background:${alphaThumb.background}"></div>
            </div>
          </div>
        </div>

        <!-- Gradient editor -->
        ${isGradient ? _renderGradientSection(isLinear) : ''}

        <!-- HEX + Alpha inputs -->
        <div class="cpk-inputs">
          <div class="cpk-hex-wrap">
            <span class="cpk-input-label">HEX</span>
            <input class="cpk-hex-input" id="cpk-hex-input" value="${_hexValue}" spellcheck="false" autocomplete="off"/>
          </div>
          <div class="cpk-alpha-wrap">
            <input class="cpk-alpha-input" id="cpk-alpha-input" type="number" min="0" max="100" value="${_alphaValue}"/>
            <span class="cpk-input-label">%</span>
          </div>
        </div>
      </div>

      <!-- Libraries tab -->
      <div class="cpk-libraries" style="display:${_activeTab==='libraries'?'block':'none'}">
        ${_renderLibraries()}
      </div>
    `;

    // Cache DOM refs
    _spectrumEl = _panel.querySelector('#cpk-spectrum');
    _hueEl      = _panel.querySelector('#cpk-hue');
    _alphaEl    = _panel.querySelector('#cpk-alpha');
    _gradBarEl  = _panel.querySelector('#cpk-grad-bar');

    _bindEvents();
  }

  function _renderGradientSection(isLinear) {
    const stops = E().getGradientStops();
    const activeIdx = E().getActiveStopIndex();
    const gradBarBg = _buildGradBarBg();

    const stopsHtml = stops.map((stop, idx) => {
      const pos = (stop.position / 100).toFixed(4);
      const isActive = idx === activeIdx;
      return `<div class="cpk-grad-stop${isActive?' cpk-grad-stop--active':''}"
        style="left:calc(7px + (100% - 14px) * ${pos});background:${stop.hex}"
        data-stop-idx="${idx}"></div>`;
    }).join('');

    return `
      <div class="cpk-gradient">
        <div class="cpk-grad-bar-wrap">
          <div id="cpk-grad-bar" class="cpk-grad-bar" style="background:${gradBarBg}">
            ${stopsHtml}
          </div>
        </div>
        <p class="cpk-grad-hint">双击渐变条添加色标 · 单击选中 · Delete 删除</p>
        ${isLinear ? `
        <div class="cpk-grad-angle">
          <span class="cpk-grad-angle-label">角度</span>
          <input class="cpk-grad-angle-input" id="cpk-angle-input" type="number" min="0" max="359" value="${_angleValue}"/>
          <span class="cpk-grad-angle-unit">°</span>
        </div>` : ''}
      </div>
    `;
  }

  function _buildGradBarBg() {
    const stops = [...E().getGradientStops()].sort((a, b) => a.position - b.position);
    const stopStr = stops.map(s => {
      const rgb = E().hexToRgb(s.hex);
      return `rgba(${rgb.r},${rgb.g},${rgb.b},${(s.a / 100).toFixed(2)}) ${s.position}%`;
    }).join(', ');
    return `linear-gradient(to right, ${stopStr}), repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 / 8px 8px`;
  }

  function _renderLibraries() {
    if (!_pageColors.length) {
      return '<div class="cpk-lib-empty">暂无页面颜色</div>';
    }
    // Split into tokens (have varName) and used colors (no varName)
    const tokens = _pageColors.filter(c => c.varName);
    const used = _pageColors.filter(c => !c.varName);

    let html = '';

    // ── CSS Token colors (from variables) ──
    if (tokens.length) {
      const groups = { text: [], bg: [], border: [], other: [] };
      tokens.forEach(c => (groups[c.category] || groups.other).push(c));
      const labels = { text: '文本色', bg: '背景色', border: '边框色', other: '其他' };
      ['text','bg','border','other'].forEach(key => {
        if (!groups[key].length) return;
        html += `<div class="cpk-lib-group-title">${labels[key]}</div>`;
        groups[key].forEach(color => {
          const name = _colorNotes[color.hex.toUpperCase()] || color.varName || color.hex;
          html += _renderLibItem(color, name);
        });
      });
    }

    // ── Used colors (from computed styles, no variable name) ──
    if (used.length) {
      html += `<div class="cpk-lib-group-title" style="margin-top:8px">已使用的颜色</div>`;
      used.forEach(color => {
        const name = _colorNotes[color.hex.toUpperCase()] || color.hex;
        html += _renderLibItem(color, name);
      });
    }

    return html;
  }

  function _renderLibItem(color, name) {
    var safeHex = _esc(color.hex);
    var safeName = _esc(name);
    var safeVar = _esc(color.varName || '');
    var safeTitle = color.varName ? _esc(color.varName + ' = ' + color.hex) : safeHex;
    // Check if this item matches the current color (_hexValue has no # prefix)
    var isSelected = _hexValue && safeHex.replace('#','').toUpperCase() === _hexValue.toUpperCase();
    var selectedClass = isSelected ? ' cpk-lib-item--selected' : '';
    return `
      <div class="cpk-lib-item${selectedClass}" data-hex="${safeHex}" data-varname="${safeVar}" title="${safeTitle}">
        <div class="cpk-lib-item__swatch" style="background:${safeHex}"></div>
        <div class="cpk-lib-item__name">${safeName}</div>
        <div class="cpk-lib-item__settings" data-settings-hex="${safeHex}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </div>
      </div>`;
  }

  // ===== 事件绑定 =====
  function _bindEvents() {
    if (!_panel) return;

    // Close
    const closeBtn = _panel.querySelector('#cpk-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', close);

    // Fill type buttons
    _panel.querySelectorAll('.cpk-fill-btn').forEach(btn => {
      btn.addEventListener('click', () => _onFillTypeChange(btn.dataset.fill));
    });

    // Tabs
    _panel.querySelectorAll('.cpk-tab-mini').forEach(btn => {
      btn.addEventListener('click', () => _switchTab(btn.dataset.tab));
    });

    // Spectrum
    if (_spectrumEl) {
      _spectrumEl.addEventListener('mousedown', e => {
        e.preventDefault();
        E().setDragging('spectrum');
        E().handleSpectrumMove(e, _spectrumEl);
        if (E().getFillType() !== 'solid') E().updateActiveStopColor();
        _emitColor(); _partialUpdateSliders();
      });
    }

    // Hue
    if (_hueEl) {
      _hueEl.addEventListener('mousedown', e => {
        e.preventDefault();
        E().setDragging('hue');
        E().handleHueMove(e, _hueEl);
        if (E().getFillType() !== 'solid') E().updateActiveStopColor();
        _emitColor(); _partialUpdateSliders();
      });
    }

    // Alpha
    if (_alphaEl) {
      _alphaEl.addEventListener('mousedown', e => {
        e.preventDefault();
        E().setDragging('alpha');
        E().handleAlphaMove(e, _alphaEl);
        if (E().getFillType() !== 'solid') E().updateActiveStopColor();
        _emitColor(); _partialUpdateSliders();
      });
    }

    // Eyedrop
    const eyedropBtn = _panel.querySelector('#cpk-eyedrop-btn');
    if (eyedropBtn) {
      eyedropBtn.addEventListener('click', async () => {
        const color = await E().eyedrop();
        if (color) {
          if (E().getFillType() !== 'solid') E().updateActiveStopColor();
          _syncInputs(); _emitColor(); _render();
        }
      });
    }

    // Gradient bar
    if (_gradBarEl) {
      _gradBarEl.addEventListener('dblclick', e => {
        const r = _gradBarEl.getBoundingClientRect();
        const inner = r.width - 14;
        const x = Math.max(0, Math.min(e.clientX - r.left - 7, inner));
        const pos = Math.round(x / inner * 100);
        E().addGradientStop(pos);
        _emitColor(); _render();
      });
    }

    // Gradient stops
    _panel.querySelectorAll('.cpk-grad-stop').forEach(stop => {
      const idx = parseInt(stop.dataset.stopIdx);
      stop.addEventListener('click', e => {
        e.stopPropagation();
        E().selectGradientStop(idx); _syncInputs(); _partialUpdateInputs();
      });
      stop.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        E().setDragging('gradient-stop');
        _draggingStopIdx = idx;
        E().selectGradientStop(idx); _syncInputs();
      });
      stop.addEventListener('dblclick', e => {
        e.preventDefault(); e.stopPropagation();
        if (E().getGradientStops().length > 2) {
          E().setActiveStopIndex(idx);
          E().removeActiveStop();
          _emitColor(); _render();
        }
      });
    });

    // HEX input
    const hexInput = _panel.querySelector('#cpk-hex-input');
    if (hexInput) {
      hexInput.addEventListener('blur', () => {
        E().setHexFromInput(hexInput.value);
        if (E().getFillType() !== 'solid') E().updateActiveStopColor();
        _hexValue = E().currentHex().substring(1);
        hexInput.value = _hexValue;
        _emitColor(); _partialUpdateSliders();
      });
      hexInput.addEventListener('keydown', e => { if (e.key === 'Enter') hexInput.blur(); });
    }

    // Alpha input
    const alphaInput = _panel.querySelector('#cpk-alpha-input');
    if (alphaInput) {
      alphaInput.addEventListener('blur', () => {
        E().setAlphaFromInput(String(alphaInput.value));
        if (E().getFillType() !== 'solid') E().updateActiveStopColor();
        _alphaValue = E().getState().a;
        alphaInput.value = _alphaValue;
        _emitColor(); _partialUpdateSliders();
      });
      alphaInput.addEventListener('keydown', e => { if (e.key === 'Enter') alphaInput.blur(); });
    }

    // Angle input
    const angleInput = _panel.querySelector('#cpk-angle-input');
    if (angleInput) {
      angleInput.addEventListener('blur', () => {
        const v = parseInt(angleInput.value);
        const angle = isNaN(v) ? 90 : ((v % 360) + 360) % 360;
        E().setGradientAngle(angle);
        _angleValue = angle;
        angleInput.value = _angleValue;
        _emitColor(); _partialUpdateGradBar();
      });
      angleInput.addEventListener('keydown', e => { if (e.key === 'Enter') angleInput.blur(); });
    }

    // Library items
    _panel.querySelectorAll('.cpk-lib-item').forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.closest('.cpk-lib-item__settings')) return;
        // Highlight selected item
        _panel.querySelectorAll('.cpk-lib-item--selected').forEach(el => el.classList.remove('cpk-lib-item--selected'));
        item.classList.add('cpk-lib-item--selected');

        E().setColorFromHex(item.dataset.hex, 100);
        _syncInputs();

        // If this is a token, emit var(--xxx) instead of hex
        var varName = item.dataset.varname;
        if (varName && _onColorChange) {
          _onColorChange('var(' + varName + ')');
          // Store token info for external consumers
          _lastSelectedToken = varName;
        } else {
          _lastSelectedToken = null;
          _emitColor();
        }
        close();
      });
      const settingsBtn = item.querySelector('.cpk-lib-item__settings');
      if (settingsBtn) {
        settingsBtn.addEventListener('click', e => {
          e.stopPropagation();
          _openColorSettings(e, item.dataset.hex);
        });
      }
    });
  }

  // ===== Partial updates (no full re-render) =====
  function _partialUpdateSliders() {
    if (!_panel) return;
    // Update spectrum cursor
    const cur = E().spectrumCursorStyle();
    const cursorEl = _panel.querySelector('.cpk-spectrum__cursor');
    if (cursorEl) {
      cursorEl.style.left = cur.left;
      cursorEl.style.top  = cur.top;
      cursorEl.style.background = cur.background;
    }
    // Update spectrum hue bg
    const specEl = _panel.querySelector('.cpk-spectrum');
    if (specEl) specEl.style.setProperty('--hue-bg', E().spectrumBg());

    // Update hue thumb
    const hueThumb = E().hueThumbStyle();
    const hueThumbEl = _hueEl && _hueEl.querySelector('.cpk-slider__thumb');
    if (hueThumbEl) {
      hueThumbEl.style.left = hueThumb.left;
      hueThumbEl.style.background = hueThumb.background;
    }

    // Update alpha thumb + gradient
    const alphaGrad = E().alphaGradient();
    const alphaGradEl = _alphaEl && _alphaEl.querySelector('.cpk-slider__alpha-gradient');
    if (alphaGradEl) alphaGradEl.style.background = alphaGrad;
    const alphaThumb = E().alphaThumbStyle();
    const alphaThumbEl = _alphaEl && _alphaEl.querySelector('.cpk-slider__thumb');
    if (alphaThumbEl) {
      alphaThumbEl.style.left = alphaThumb.left;
      alphaThumbEl.style.background = alphaThumb.background;
    }

    // Update inputs
    _partialUpdateInputs();

    // Update gradient bar if visible
    _partialUpdateGradBar();
  }

  function _partialUpdateInputs() {
    const hexInput = _panel && _panel.querySelector('#cpk-hex-input');
    if (hexInput && document.activeElement !== hexInput) {
      _hexValue = E().currentHex().substring(1);
      hexInput.value = _hexValue;
    }
    const alphaInput = _panel && _panel.querySelector('#cpk-alpha-input');
    if (alphaInput && document.activeElement !== alphaInput) {
      _alphaValue = E().getState().a;
      alphaInput.value = _alphaValue;
    }
  }

  function _partialUpdateGradBar() {
    if (!_gradBarEl) return;
    _gradBarEl.style.background = _buildGradBarBg();
    // Update stop positions/active state
    const stops = E().getGradientStops();
    const activeIdx = E().getActiveStopIndex();
    const stopEls = _gradBarEl.querySelectorAll('.cpk-grad-stop');
    stopEls.forEach((el, i) => {
      if (i < stops.length) {
        const pos = (stops[i].position / 100).toFixed(4);
        el.style.left = `calc(7px + (100% - 14px) * ${pos})`;
        el.style.background = stops[i].hex;
        el.classList.toggle('cpk-grad-stop--active', i === activeIdx);
      }
    });
  }

  // ===== Gradient stop drag on global mousemove =====
  function _onGradStopDrag(e) {
    if (!_gradBarEl || _draggingStopIdx < 0) return;
    const r = _gradBarEl.getBoundingClientRect();
    const inner = r.width - 14;
    const x = Math.max(0, Math.min(e.clientX - r.left - 7, inner));
    const pos = Math.round(x / inner * 100);
    E().setActiveStopIndex(_draggingStopIdx);
    E().updateActiveStopPosition(pos);
    _draggingStopIdx = E().getActiveStopIndex();
  }

  // ===== Global mouse handlers =====
  function _onGlobalMove(e) {
    const d = E().getDragging();
    if (!d) return;
    e.preventDefault();
    if      (d === 'spectrum')      E().handleSpectrumMove(e, _spectrumEl);
    else if (d === 'hue')           E().handleHueMove(e, _hueEl);
    else if (d === 'alpha')         E().handleAlphaMove(e, _alphaEl);
    else if (d === 'gradient-stop') _onGradStopDrag(e);
    if (E().getFillType() !== 'solid') E().updateActiveStopColor();
    _emitColor();
    _partialUpdateSliders();
  }

  function _onGlobalUp() {
    if (E().getDragging()) {
      E().setDragging(null);
      _draggingStopIdx = -1;
      _syncInputs();
      _partialUpdateInputs();
    }
  }

  function _onDocKeydown(e) {
    if (E().getFillType() === 'solid') return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && E().getGradientStops().length > 2) {
      e.preventDefault();
      E().removeActiveStop();
      _emitColor(); _render();
    }
  }

  // ===== Fill type =====
  function _onFillTypeChange(type) {
    if (type === E().getFillType()) return;
    E().setFillType(type);
    if (type !== 'solid') {
      const eng = E();
      const stops = [
        { hex: eng.currentHex(), a: eng.getState().a, position: 0 },
        { hex: '#FFFFFF', a: 100, position: 100 },
      ];
      // Replace gradient stops via engine
      const gs = eng.getGradientStops();
      gs.length = 0;
      stops.forEach(s => gs.push(s));
      eng.setActiveStopIndex(0);
    }
    _emitColor(); _render();
  }

  // ===== Tab switching =====
  function _switchTab(tab) {
    _activeTab = tab;
    if (tab === 'libraries') _loadLibraries();
    _render();
  }

  function _loadLibraries() {
    const iframe = document.getElementById('target-frame');
    if (iframe) _pageColors = E().extractPageColors(iframe);
    _colorNotes = E().loadColorNotes();
  }

  // ===== Color settings sub-panel =====
  function _openColorSettings(e, hex) {
    _csOriginalHex = hex.toUpperCase();
    _settingsHex  = hex;
    _settingsNote = _colorNotes[_csOriginalHex] || '';

    // Find the varName from _pageColors for this hex
    var matchedColor = _pageColors.find(function(c) { return c.hex.toUpperCase() === _csOriginalHex; });
    var varName = matchedColor ? matchedColor.varName || '' : '';

    // Parse current alpha (default 100)
    var currentAlpha = 100;

    if (!_colorSettingsEl) {
      _colorSettingsEl = document.createElement('div');
      _colorSettingsEl.id = 'cpk-color-settings';
      _colorSettingsEl.className = 'cpk-color-settings';
      document.body.appendChild(_colorSettingsEl);
    }
    _colorSettingsEl.innerHTML =
      '<div class="cpk-color-settings__body">' +
        '<div class="cpk-color-settings__field">' +
          '<div class="cpk-color-settings__label">名称</div>' +
          '<input class="cpk-color-settings__input cpk-color-settings__input--readonly" id="cpk-cs-note" value="' + _esc(varName || _settingsNote) + '" placeholder="颜色名称..." readonly/>' +
        '</div>' +
        '<div class="cpk-color-settings__field">' +
          '<div class="cpk-color-settings__label">色值</div>' +
          '<div class="cpk-color-settings__hex-row">' +
            '<div class="cpk-color-settings__hex-swatch" id="cpk-cs-swatch" style="background:' + _settingsHex + '"></div>' +
            '<input class="cpk-color-settings__input" id="cpk-cs-hex" value="' + _esc(_settingsHex) + '" style="flex:1" placeholder="#FFFFFF"/>' +
            '<input class="cpk-color-settings__input cpk-color-settings__input--alpha" id="cpk-cs-alpha" type="number" min="0" max="100" value="' + currentAlpha + '" title="不透明度"/>' +
            '<span class="cpk-color-settings__alpha-unit">%</span>' +
          '</div>' +
        '</div>' +
        '<div class="cpk-color-settings__actions">' +
          '<button class="cpk-color-settings__btn" id="cpk-cs-cancel">取消</button>' +
          '<button class="cpk-color-settings__btn cpk-color-settings__btn--primary" id="cpk-cs-save">确定</button>' +
        '</div>' +
      '</div>';
    _colorSettingsEl.style.display = 'block';

    // Live preview: update swatch as user types hex or alpha
    var hexInput = _colorSettingsEl.querySelector('#cpk-cs-hex');
    var alphaInput = _colorSettingsEl.querySelector('#cpk-cs-alpha');
    var swatchEl = _colorSettingsEl.querySelector('#cpk-cs-swatch');

    function _updateSwatchPreview() {
      var v = hexInput.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (!/^#[0-9a-f]{3,8}$/i.test(v)) return;
      var a = parseInt(alphaInput.value) || 100;
      a = Math.min(100, Math.max(0, a));
      if (a < 100) {
        // Convert hex to rgba for swatch preview
        var r = parseInt(v.slice(1,3), 16) || 0;
        var g = parseInt(v.slice(3,5), 16) || 0;
        var b = parseInt(v.slice(5,7), 16) || 0;
        swatchEl.style.background = 'rgba(' + r + ',' + g + ',' + b + ',' + (a/100) + ')';
      } else {
        swatchEl.style.background = v;
      }
    }
    if (hexInput) hexInput.addEventListener('input', _updateSwatchPreview);
    if (alphaInput) alphaInput.addEventListener('input', _updateSwatchPreview);

    // Position: dynamically avoid color picker, properties panel, and selected element
    var cw = 220, ch = 190;
    var wW = window.innerWidth, wH = window.innerHeight;
    var gap = 8;

    // Gather rects of panels to avoid
    var panelRect = _panel ? _panel.getBoundingClientRect() : null;
    var ppPanel = document.getElementById('pp-panel');
    var ppRect = ppPanel ? ppPanel.getBoundingClientRect() : null;

    // Try positions in priority order: LEFT of color picker, RIGHT of color picker,
    // ABOVE color picker, BELOW color picker
    var candidates = [];

    if (panelRect) {
      // Left of color picker
      if (panelRect.left - cw - gap >= 0) {
        candidates.push({ l: panelRect.left - cw - gap, t: panelRect.top });
      }
      // Right of color picker
      if (panelRect.right + gap + cw <= wW) {
        candidates.push({ l: panelRect.right + gap, t: panelRect.top });
      }
      // Above color picker
      if (panelRect.top - ch - gap >= 0) {
        candidates.push({ l: panelRect.left, t: panelRect.top - ch - gap });
      }
      // Below color picker
      if (panelRect.bottom + gap + ch <= wH) {
        candidates.push({ l: panelRect.left, t: panelRect.bottom + gap });
      }
    }

    // Fallback: near trigger button
    if (candidates.length === 0) {
      var tr = e.currentTarget.getBoundingClientRect();
      candidates.push({ l: tr.right - cw, t: tr.top - ch - gap });
      candidates.push({ l: tr.right + gap, t: tr.top });
    }

    // Score each candidate: penalize overlap with properties panel
    var best = candidates[0];
    var bestScore = -Infinity;
    candidates.forEach(function(c) {
      // Clamp to viewport
      c.l = Math.max(gap, Math.min(c.l, wW - cw - gap));
      c.t = Math.max(gap, Math.min(c.t, wH - ch - gap));
      var score = 0;
      var cRect = { left: c.l, top: c.t, right: c.l + cw, bottom: c.t + ch };
      // Penalize overlap with properties panel
      if (ppRect) {
        var overlapX = Math.max(0, Math.min(cRect.right, ppRect.right) - Math.max(cRect.left, ppRect.left));
        var overlapY = Math.max(0, Math.min(cRect.bottom, ppRect.bottom) - Math.max(cRect.top, ppRect.top));
        score -= overlapX * overlapY;
      }
      // Penalize overlap with color picker
      if (panelRect) {
        var ox = Math.max(0, Math.min(cRect.right, panelRect.right) - Math.max(cRect.left, panelRect.left));
        var oy = Math.max(0, Math.min(cRect.bottom, panelRect.bottom) - Math.max(cRect.top, panelRect.top));
        score -= ox * oy;
      }
      if (score > bestScore) { bestScore = score; best = c; }
    });

    _colorSettingsEl.style.left = best.l + 'px';
    _colorSettingsEl.style.top  = best.t + 'px';

    _colorSettingsEl.querySelector('#cpk-cs-cancel').addEventListener('click', function() {
      _colorSettingsEl.style.display = 'none';
    });

    _colorSettingsEl.querySelector('#cpk-cs-save').addEventListener('click', function() {
      var newHex = hexInput.value.trim().toUpperCase();
      if (!newHex.startsWith('#')) newHex = '#' + newHex;
      var newAlpha = Math.min(100, Math.max(0, parseInt(alphaInput.value) || 100));

      // Build final color value
      var finalColor = newHex;
      if (newAlpha < 100) {
        var rr = parseInt(newHex.slice(1,3), 16) || 0;
        var gg = parseInt(newHex.slice(3,5), 16) || 0;
        var bb = parseInt(newHex.slice(5,7), 16) || 0;
        finalColor = 'rgba(' + rr + ',' + gg + ',' + bb + ',' + (newAlpha/100) + ')';
      }

      if (newHex !== _csOriginalHex || newAlpha !== 100) {
        if (varName) {
          // ── Global token edit: modify :root CSS variable ──
          // This propagates to ALL elements using this token
          var iframe = document.getElementById('target-frame');
          var iframeDoc = iframe && (iframe.contentDocument || iframe.contentWindow.document);
          if (iframeDoc) {
            var root = iframeDoc.documentElement;
            var win = iframe.contentWindow;
            var oldResolved = win.getComputedStyle(root).getPropertyValue(varName).trim();

            // Apply the change on :root inline style — affects all elements using var(varName)
            root.style.setProperty(varName, finalColor);

            // Find definition source for context
            var defInfo = null;
            try {
              var sheets = iframeDoc.styleSheets;
              for (var si = 0; si < sheets.length; si++) {
                var rules;
                try { rules = sheets[si].cssRules || sheets[si].rules; } catch(e) { continue; }
                if (!rules) continue;
                for (var ri = 0; ri < rules.length; ri++) {
                  if (rules[ri].type !== 1) continue;
                  var val = rules[ri].style.getPropertyValue(varName);
                  if (val) {
                    var src = '<style>';
                    if (sheets[si].href) {
                      var url = sheets[si].href;
                      src = url.substring(url.lastIndexOf('/') + 1) || url;
                    }
                    defInfo = { definedIn: rules[ri].selectorText, file: src };
                  }
                }
              }
            } catch(e) {}

            // Record in Snapshot for diff output
            if (window.Snapshot) {
              Snapshot.recordCSSVarChange(varName, oldResolved || _csOriginalHex, finalColor, defInfo);
            }

            // Record in UndoStack for Ctrl+Z support
            if (window.UndoStack) {
              UndoStack.record({
                type: 'cssVariable',
                selector: ':root',
                property: varName,
                oldValue: oldResolved || _csOriginalHex,
                newValue: finalColor,
              });
            }

            // Trigger change counter update
            if (window.EditorCore) EditorCore.emit('change', { property: varName });
          }
        } else {
          // Non-token color: apply to selected element via callback
          if (_onColorChange) {
            E().setColorFromHex(newHex, newAlpha);
            _syncInputs();
            _onColorChange(E().getCurrentFill());
          }
        }
      }

      // Save note if provided
      var note = _colorSettingsEl.querySelector('#cpk-cs-note').value.trim();
      if (note && !varName) {
        _colorNotes[newHex] = note;
        if (_csOriginalHex && _csOriginalHex !== newHex) delete _colorNotes[_csOriginalHex];
      }
      E().saveColorNotes(_colorNotes);
      _colorSettingsEl.style.display = 'none';
      _loadLibraries(); _render();
    });
  }

  // ===== Positioning =====
  function _position(popoverEl) {
    if (!popoverEl || !_panel) return;
    const pr = popoverEl.getBoundingClientRect();
    const pw = 252, gap = 8;

    // Find the outermost panel that contains the trigger:
    // flyout (2级) takes priority, then main panel (1级), then trigger itself
    const flyoutParent = popoverEl.closest && popoverEl.closest('.pp-flyout');
    const panelParent  = popoverEl.closest && popoverEl.closest('#pp-panel');
    const anchor = (flyoutParent || panelParent || popoverEl).getBoundingClientRect();

    let left = anchor.left - pw - gap;
    if (left < 8) {
      left = anchor.right + gap;
      if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pw - 8);
    }
    let top = pr.top;
    const isGradient = E().getFillType() !== 'solid';
    const panelH = isGradient ? 440 : 380;
    if (top + panelH > window.innerHeight - 8) top = window.innerHeight - panelH - 8;
    if (top < 8) top = 8;
    _panel.style.left = left + 'px';
    _panel.style.top  = top  + 'px';
  }

  // ===== Emit =====
  function _emitColor() {
    if (_onColorChange) _onColorChange(E().getCurrentFill());
  }

  // ===== Public API =====
  function open(mode, popoverEl, onColorChange, initialColor) {

  // ───────────────────────────────────────────────────────────────────
  // Token Edit Mode Implementation
  // ───────────────────────────────────────────────────────────────────

  /**
   * Enter token edit mode with full spectrum/hue/alpha sliders.
   * Shows a modal panel with variable name banner and Done/Cancel buttons.
   * Reuses ColorPickerEngine, applies changes to :root in real-time.
   */
  function _enterTokenEditMode(varName, currentHex, defInfo) {
    _tokenEditMode = true;
    _tokenEditVar = varName;
    _tokenEditDefInfo = defInfo;
    _tokenEditOldHex = currentHex.toUpperCase();

    if (!_tokenEditPanel) {
      _tokenEditPanel = document.createElement('div');
      _tokenEditPanel.id = 'cpk-token-edit-panel';
      _tokenEditPanel.className = 'cpk-token-edit-panel';
      document.body.appendChild(_tokenEditPanel);
    }

    // Initialize color engine with current value
    E().setFillType('solid');
    E().setColorFromHex(currentHex, 100);
    _syncInputs();

    // Capture old resolved value from iframe
    const iframe = document.getElementById('target-frame');
    const iframeDoc = iframe && (iframe.contentDocument || iframe.contentWindow.document);
    if (iframeDoc) {
      const win = iframe.contentWindow;
      const root = iframeDoc.documentElement;
      _tokenEditOldResolved = win.getComputedStyle(root).getPropertyValue(varName).trim();
    }

    // Render token edit panel
    _renderTokenEditPanel();

    // Position: center of viewport
    _tokenEditPanel.style.left = 'calc(50% - 160px)';
    _tokenEditPanel.style.top = 'calc(50% - 280px)';
    _tokenEditPanel.style.display = 'block';

    // Bind interactions
    _bindTokenEditSliders();

    // Focus management
    document.addEventListener('keydown', _tokenEditKeydown, true);
  }

  function _renderTokenEditPanel() {
    const specBg = E().spectrumBg();
    const specCursor = E().spectrumCursorStyle();
    const hueThumb = E().hueThumbStyle();
    const alphaGrad = E().alphaGradient();
    const alphaThumb = E().alphaThumbStyle();
    const currentFill = E().getCurrentFill();

    _tokenEditPanel.innerHTML = `
      <div class="cpk-token-edit__header">
        <div class="cpk-token-edit__var-name" title="${_esc(_tokenEditVar)}">${_esc(_tokenEditVar)}</div>
        <div class="cpk-token-edit__buttons">
          <button class="cpk-token-edit__btn cpk-token-edit__btn--cancel" id="cpk-token-edit-cancel" title="取消编辑">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>
            取消
          </button>
          <button class="cpk-token-edit__btn cpk-token-edit__btn--done" id="cpk-token-edit-done" title="完成编辑">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>
            完成
          </button>
        </div>
      </div>

      <div class="cpk-token-edit__content">
        <!-- Spectrum color picker -->
        <div id="cpk-token-spectrum" class="cpk-spectrum" style="--hue-bg:${specBg}">
          <div class="cpk-spectrum__clip">
            <div class="cpk-spectrum__white"></div>
            <div class="cpk-spectrum__black"></div>
          </div>
          <div class="cpk-spectrum__cursor" style="left:${specCursor.left};top:${specCursor.top};background:${specCursor.background}"></div>
        </div>

        <!-- Hue and Alpha sliders -->
        <div class="cpk-token-edit__sliders">
          <div id="cpk-token-hue" class="cpk-slider cpk-slider--hue">
            <div class="cpk-slider__track-hue"></div>
            <div class="cpk-slider__thumb" style="left:${hueThumb.left};background:${hueThumb.background}"></div>
          </div>
          <div id="cpk-token-alpha" class="cpk-slider cpk-slider--alpha">
            <div class="cpk-slider__alpha-track">
              <div class="cpk-slider__alpha-checker"></div>
              <div class="cpk-slider__alpha-gradient" style="background:${alphaGrad}"></div>
            </div>
            <div class="cpk-slider__thumb" style="left:${alphaThumb.left};background:${alphaThumb.background}"></div>
          </div>
        </div>

        <!-- Color preview -->
        <div class="cpk-token-edit__preview">
          <div class="cpk-token-edit__swatch" style="background:${currentFill}"></div>
          <div class="cpk-token-edit__value">${currentFill}</div>
        </div>
      </div>
    `;
  }

  function _bindTokenEditSliders() {
    if (!_tokenEditPanel) return;

    const specEl = _tokenEditPanel.querySelector('#cpk-token-spectrum');
    const hueEl = _tokenEditPanel.querySelector('#cpk-token-hue');
    const alphaEl = _tokenEditPanel.querySelector('#cpk-token-alpha');

    // Spectrum drag
    if (specEl) {
      specEl.addEventListener('mousedown', e => {
        e.preventDefault();
        E().setDragging('spectrum');
        const onMove = (ev) => {
          E().handleSpectrumMove(ev, specEl);
          _applyTokenEditToIframe();
          _partialUpdateTokenEditSliders();
        };
        const onUp = () => {
          E().setDragging(null);
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }

    // Hue drag
    if (hueEl) {
      hueEl.addEventListener('mousedown', e => {
        e.preventDefault();
        E().setDragging('hue');
        const onMove = (ev) => {
          E().handleHueMove(ev, hueEl);
          _applyTokenEditToIframe();
          _partialUpdateTokenEditSliders();
        };
        const onUp = () => {
          E().setDragging(null);
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }

    // Alpha drag
    if (alphaEl) {
      alphaEl.addEventListener('mousedown', e => {
        e.preventDefault();
        E().setDragging('alpha');
        const onMove = (ev) => {
          E().handleAlphaMove(ev, alphaEl);
          _applyTokenEditToIframe();
          _partialUpdateTokenEditSliders();
        };
        const onUp = () => {
          E().setDragging(null);
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }

    // Cancel: revert to original
    const cancelBtn = _tokenEditPanel.querySelector('#cpk-token-edit-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        E().setColorFromHex(_tokenEditOldHex, 100);
        _applyTokenEditToIframe();
        _exitTokenEditMode(false);
      });
    }

    // Done: save change
    const doneBtn = _tokenEditPanel.querySelector('#cpk-token-edit-done');
    if (doneBtn) {
      doneBtn.addEventListener('click', () => {
        _exitTokenEditMode(true);
      });
    }
  }

  function _applyTokenEditToIframe() {
    if (!_tokenEditVar) return;
    const newHex = E().currentHex();
    const iframe = document.getElementById('target-frame');
    const iframeDoc = iframe && (iframe.contentDocument || iframe.contentWindow.document);
    if (!iframeDoc) return;

    const root = iframeDoc.documentElement;
    root.style.setProperty(_tokenEditVar, newHex);

    // Update preview
    const preview = _tokenEditPanel && _tokenEditPanel.querySelector('.cpk-token-edit__value');
    if (preview) preview.textContent = newHex;
    const swatch = _tokenEditPanel && _tokenEditPanel.querySelector('.cpk-token-edit__swatch');
    if (swatch) swatch.style.background = newHex;
  }

  function _partialUpdateTokenEditSliders() {
    if (!_tokenEditPanel) return;
    const specEl = _tokenEditPanel.querySelector('#cpk-token-spectrum');
    const hueEl = _tokenEditPanel.querySelector('#cpk-token-hue');
    const alphaEl = _tokenEditPanel.querySelector('#cpk-token-alpha');

    // Update spectrum cursor
    if (specEl) {
      const cur = E().spectrumCursorStyle();
      const cursor = specEl.querySelector('.cpk-spectrum__cursor');
      if (cursor) {
        cursor.style.left = cur.left;
        cursor.style.top = cur.top;
        cursor.style.background = cur.background;
      }
      specEl.style.setProperty('--hue-bg', E().spectrumBg());
    }

    // Update hue thumb
    if (hueEl) {
      const hueThumb = E().hueThumbStyle();
      const thumb = hueEl.querySelector('.cpk-slider__thumb');
      if (thumb) {
        thumb.style.left = hueThumb.left;
        thumb.style.background = hueThumb.background;
      }
    }

    // Update alpha thumb and gradient
    if (alphaEl) {
      const alphaGrad = E().alphaGradient();
      const gradEl = alphaEl.querySelector('.cpk-slider__alpha-gradient');
      if (gradEl) gradEl.style.background = alphaGrad;
      const alphaThumb = E().alphaThumbStyle();
      const thumb = alphaEl.querySelector('.cpk-slider__thumb');
      if (thumb) {
        thumb.style.left = alphaThumb.left;
        thumb.style.background = alphaThumb.background;
      }
    }
  }

  function _exitTokenEditMode(shouldSave) {
    const newHex = E().currentHex();
    const changed = newHex !== _tokenEditOldHex;

    if (shouldSave && changed) {
      const iframe = document.getElementById('target-frame');
      const iframeDoc = iframe && (iframe.contentDocument || iframe.contentWindow.document);
      if (iframeDoc) {
        const root = iframeDoc.documentElement;
        const win = iframe.contentWindow;
        const newResolved = win.getComputedStyle(root).getPropertyValue(_tokenEditVar).trim();

        // Record in Snapshot
        if (window.Snapshot) {
          Snapshot.recordCSSVarChange(_tokenEditVar, _tokenEditOldHex, newHex, _tokenEditDefInfo);
        }

        // Record in UndoStack
        if (window.UndoStack) {
          UndoStack.record({
            type: 'cssVariable',
            selector: ':root',
            property: _tokenEditVar,
            oldValue: _tokenEditOldResolved || _tokenEditOldHex,
            newValue: newResolved || newHex,
          });
        }

        // Emit change event
        if (window.EditorCore) EditorCore.emit('change', { property: _tokenEditVar });
      }
    }

    _tokenEditMode = false;
    _tokenEditVar = '';
    _tokenEditDefInfo = null;
    _tokenEditOldHex = '';
    _tokenEditOldResolved = '';
    if (_tokenEditPanel) _tokenEditPanel.style.display = 'none';
    document.removeEventListener('keydown', _tokenEditKeydown, true);
  }

  function _tokenEditKeydown(e) {
    if (!_tokenEditMode) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      const cancelBtn = _tokenEditPanel && _tokenEditPanel.querySelector('#cpk-token-edit-cancel');
      if (cancelBtn) cancelBtn.click();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const doneBtn = _tokenEditPanel && _tokenEditPanel.querySelector('#cpk-token-edit-done');
      if (doneBtn) doneBtn.click();
    }
  }

    _mode = mode || 'bg';
    _onColorChange = onColorChange || null;
    _colorNotes = E().loadColorNotes();

    // Support 5th argument: options object { defaultTab: 'custom'|'libraries' }
    var openOpts = arguments[4] || {};
    if (openOpts.defaultTab) _activeTab = openOpts.defaultTab;

    // Pre-load libraries data if defaulting to libraries tab
    if (_activeTab === 'libraries') _loadLibraries();

    if (!_panel) _buildPanel();

    if (initialColor) {
      // Use the caller-provided color instead of guessing from element styles
      _initColorFromValue(initialColor);
    } else {
      _initColorForMode();
    }
    _render();
    _position(popoverEl);
    _panel.style.display = 'block';

    document.addEventListener('mousemove', _onGlobalMove);
    document.addEventListener('mouseup',   _onGlobalUp);
    document.addEventListener('keydown',   _onDocKeydown, true);
    // Close on outside click
    setTimeout(() => document.addEventListener('mousedown', _onOutsideClick), 0);
  }

  function _onOutsideClick(e) {
    if (_panel && !_panel.contains(e.target) &&
        (!_colorSettingsEl || !_colorSettingsEl.contains(e.target)) &&
        !(e.target.closest && e.target.closest('.pp-dropdown'))) {
      close();
    }
  }

  function close() {
    if (_panel) _panel.style.display = 'none';
    if (_colorSettingsEl) _colorSettingsEl.style.display = 'none';
    E().setDragging(null);
    document.removeEventListener('mousemove', _onGlobalMove);
    document.removeEventListener('mouseup',   _onGlobalUp);
    document.removeEventListener('keydown',   _onDocKeydown, true);
    document.removeEventListener('mousedown', _onOutsideClick);
  }

  function destroy() {
    close();
    if (_panel) { _panel.remove(); _panel = null; }
    if (_colorSettingsEl) { _colorSettingsEl.remove(); _colorSettingsEl = null; }
  }

  function init() {
    // Pre-build panel DOM hidden
    if (!_panel) _buildPanel();
  }

  return { init, open, close, destroy };
}());
