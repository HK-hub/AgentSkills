/**
 * color-picker-engine.js — 颜色选择器引擎（从 useColorPicker.js 抽离）
 *
 * 暴露为 window.ColorPickerEngine，供 ColorPickerPanel 使用。
 * 无 Vue 依赖，纯原生 JS。
 */
'use strict';

window.ColorPickerEngine = (function () {

  // ===== 内部状态 =====
  let cpkState = { h: 0, s: 100, v: 100, a: 100 };
  let dragging = null; // null | 'spectrum' | 'hue' | 'alpha' | 'gradient-stop'

  // ===== 渐变状态 =====
  let fillType = 'solid'; // 'solid' | 'linear' | 'radial'
  let gradientAngle = 90;
  let gradientStops = [
    { hex: '#FF6600', a: 100, position: 0 },
    { hex: '#FFCC00', a: 100, position: 100 },
  ];
  let activeStopIndex = 0;

  // ===== HSV <-> RGB <-> HEX 工具 =====
  function hsvToRgb(h, s, v) {
    h = h / 360; s = s / 100; v = v / 100;
    const i = Math.floor(h * 6), f = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    let r, g, b;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h, s = max === 0 ? 0 : d / max, v = max;
    if (max === min) { h = 0; }
    else {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) };
  }

  function rgbToHex2(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
  }

  function hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length === 8) hex = hex.substring(0, 6);
    const num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function rgbToHex(rgb) {
    if (!rgb) return '#000000';
    if (rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return 'transparent';
    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return rgb;
    return rgbToHex2(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
  }

  function extractAlpha(colorStr) {
    if (!colorStr) return 100;
    if (colorStr === 'transparent' || colorStr === 'rgba(0, 0, 0, 0)') return 0;
    const match = colorStr.match(/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*([\d.]+)\s*\)/);
    if (match) return Math.round(parseFloat(match[1]) * 100);
    return 100;
  }

  function isValidColor(str) {
    if (!str) return false;
    const s = new Option().style;
    s.color = str;
    return s.color !== '';
  }

  // ===== 计算方法（替代 Vue computed）=====
  function currentRgb() { return hsvToRgb(cpkState.h, cpkState.s, cpkState.v); }
  function currentHex() { const rgb = currentRgb(); return rgbToHex2(rgb.r, rgb.g, rgb.b); }
  function hueRgb()     { return hsvToRgb(cpkState.h, 100, 100); }
  function spectrumBg() { const rgb = hueRgb(); return `rgb(${rgb.r},${rgb.g},${rgb.b})`; }

  function spectrumCursorStyle() {
    return {
      left: cpkState.s + '%',
      top: (100 - cpkState.v) + '%',
      background: currentHex(),
    };
  }

  function hueThumbStyle() {
    return {
      left: `calc(7px + (100% - 14px) * ${(cpkState.h / 360).toFixed(4)})`,
      background: `hsl(${cpkState.h},100%,50%)`,
    };
  }

  function alphaGradient() {
    return `linear-gradient(to right, transparent, ${currentHex()})`;
  }

  function alphaThumbStyle() {
    const rgb = currentRgb();
    const alpha = cpkState.a / 100;
    return {
      left: `calc(7px + (100% - 14px) * ${(cpkState.a / 100).toFixed(4)})`,
      background: `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`,
    };
  }

  function previewColor() {
    const rgb = currentRgb();
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${cpkState.a / 100})`;
  }

  // ===== 操作方法 =====
  function getCurrentColor() {
    const rgb = currentRgb();
    if (cpkState.a < 100) {
      return `rgba(${rgb.r},${rgb.g},${rgb.b},${(cpkState.a / 100).toFixed(2)})`;
    }
    return currentHex();
  }

  function getCurrentFill() {
    if (fillType === 'solid') return getCurrentColor();
    return buildGradientString();
  }

  function setColorFromHex(hex, alpha) {
    if (!hex || hex === 'transparent') {
      cpkState.h = 0;
      cpkState.s = 0;
      cpkState.v = 100;
      cpkState.a = alpha !== undefined ? alpha : 100;
    } else {
      hex = hex.replace(/^#/, '');
      if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      const rgb = hexToRgb(hex);
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      cpkState.h = hsv.h;
      cpkState.s = hsv.s;
      cpkState.v = hsv.v;
      if (alpha !== undefined) cpkState.a = alpha;
    }
  }

  // ===== 渐变方法 =====
  function setFillType(type) {
    fillType = type;
  }

  function selectGradientStop(idx) {
    if (idx < 0 || idx >= gradientStops.length) return;
    activeStopIndex = idx;
    const stop = gradientStops[idx];
    setColorFromHex(stop.hex, stop.a);
  }

  function addGradientStop(position) {
    const newStop = {
      hex: currentHex(),
      a: cpkState.a,
      position: Math.max(0, Math.min(100, position)),
    };
    gradientStops.push(newStop);
    gradientStops.sort((a, b) => a.position - b.position);
    activeStopIndex = gradientStops.indexOf(newStop);
  }

  function removeActiveStop() {
    if (gradientStops.length <= 2) return;
    gradientStops.splice(activeStopIndex, 1);
    activeStopIndex = Math.min(activeStopIndex, gradientStops.length - 1);
    selectGradientStop(activeStopIndex);
  }

  function updateActiveStopColor() {
    const idx = activeStopIndex;
    if (idx < 0 || idx >= gradientStops.length) return;
    gradientStops[idx] = {
      ...gradientStops[idx],
      hex: currentHex(),
      a: cpkState.a,
    };
  }

  function updateActiveStopPosition(position) {
    const idx = activeStopIndex;
    if (idx < 0 || idx >= gradientStops.length) return;
    gradientStops[idx] = {
      ...gradientStops[idx],
      position: Math.max(0, Math.min(100, position)),
    };
    const currentStop = gradientStops[idx];
    gradientStops.sort((a, b) => a.position - b.position);
    activeStopIndex = gradientStops.indexOf(currentStop);
  }

  function buildGradientString() {
    const stops = [...gradientStops].sort((a, b) => a.position - b.position);
    const stopStr = stops.map(s => {
      const rgb = hexToRgb(s.hex);
      const alpha = (s.a / 100).toFixed(2);
      return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha}) ${s.position}%`;
    }).join(', ');
    if (fillType === 'radial') return `radial-gradient(circle, ${stopStr})`;
    return `linear-gradient(${gradientAngle}deg, ${stopStr})`;
  }

  function parseGradientString(str) {
    if (!str) return false;
    const linearMatch = str.match(/linear-gradient\(([\d.]+)deg,\s*([\s\S]+)\)$/);
    const radialMatch = str.match(/radial-gradient\([^,]+,\s*([\s\S]+)\)$/);
    let rawStops = null;
    if (linearMatch) {
      gradientAngle = parseInt(linearMatch[1]) || 90;
      fillType = 'linear';
      rawStops = linearMatch[2];
    } else if (radialMatch) {
      fillType = 'radial';
      rawStops = radialMatch[1];
    } else {
      return false;
    }
    const stopPattern = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)\s+([\d.]+)%/g;
    const parsed = [];
    let m;
    while ((m = stopPattern.exec(rawStops)) !== null) {
      const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3]);
      const a = m[4] !== undefined ? Math.round(parseFloat(m[4]) * 100) : 100;
      const pos = parseFloat(m[5]);
      parsed.push({ hex: rgbToHex2(r, g, b), a, position: pos });
    }
    if (parsed.length >= 2) {
      gradientStops = parsed;
      activeStopIndex = 0;
      selectGradientStop(0);
      return true;
    }
    return false;
  }

  // ===== 拖拽处理 =====
  function handleSpectrumMove(e, spectrumEl) {
    if (!spectrumEl) return;
    const rect = spectrumEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    cpkState.s = Math.round(x / rect.width * 100);
    cpkState.v = Math.round(100 - y / rect.height * 100);
  }

  function handleHueMove(e, hueEl) {
    if (!hueEl) return;
    const rect = hueEl.getBoundingClientRect();
    const inner = rect.width - 14;
    const x = Math.max(0, Math.min(e.clientX - rect.left - 7, inner));
    cpkState.h = Math.round(x / inner * 360);
  }

  function handleAlphaMove(e, alphaEl) {
    if (!alphaEl) return;
    const rect = alphaEl.getBoundingClientRect();
    const inner = rect.width - 14;
    const x = Math.max(0, Math.min(e.clientX - rect.left - 7, inner));
    cpkState.a = Math.round(x / inner * 100);
  }

  function setHexFromInput(hexStr) {
    const val = hexStr.trim().replace(/^#/, '');
    if (val.length >= 3 && isValidColor('#' + val)) {
      setColorFromHex(val, cpkState.a);
    }
  }

  function setAlphaFromInput(alphaStr) {
    const val = parseInt(alphaStr);
    if (!isNaN(val)) cpkState.a = Math.max(0, Math.min(100, val));
  }

  // ===== 吸色 =====
  async function eyedrop() {
    if (window.EyeDropper) {
      try {
        const dropper = new EyeDropper();
        const result = await dropper.open();
        setColorFromHex(result.sRGBHex, 100);
        return getCurrentColor();
      } catch {}
    }
    return null;
  }

  function startIframePick(iframeEl) {
    return new Promise((resolve) => {
      try {
        const iframeDoc = iframeEl.contentDocument || iframeEl.contentWindow.document;
        const iframeWin = iframeEl.contentWindow;
        if (!iframeDoc) { resolve(null); return; }

        let pickStyle = iframeDoc.getElementById('cpk-pick-style');
        if (!pickStyle) {
          pickStyle = iframeDoc.createElement('style');
          pickStyle.id = 'cpk-pick-style';
          pickStyle.textContent = '* { cursor: crosshair !important; }';
          iframeDoc.head.appendChild(pickStyle);
        }

        let settled = false;
        const timeoutId = setTimeout(() => {
          if (settled) return;
          settled = true;
          iframeDoc.body.removeEventListener('click', pickHandler, true);
          if (pickStyle.parentNode) pickStyle.remove();
          resolve(null);
        }, 8000);

        function pickHandler(e) {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          e.preventDefault();
          e.stopPropagation();
          const cs = iframeWin.getComputedStyle(e.target);
          const color = cs.backgroundColor || cs.color;
          const hex = rgbToHex(color);
          if (hex && hex !== 'transparent') {
            setColorFromHex(hex, 100);
            resolve(getCurrentColor());
          } else {
            resolve(null);
          }
          iframeDoc.body.removeEventListener('click', pickHandler, true);
          if (pickStyle.parentNode) pickStyle.remove();
        }

        iframeDoc.body.addEventListener('click', pickHandler, true);
      } catch {
        resolve(null);
      }
    });
  }

  // ===== 提取页面颜色 =====
  function extractPageColors(iframeEl) {
    const colors = [];
    const seenHex = {};      // dedup non-token colors by hex
    const seenVar = {};      // dedup token colors by varName
    try {
      const iframeDoc = iframeEl.contentDocument || iframeEl.contentWindow.document;
      const iframeWin = iframeEl.contentWindow;
      if (!iframeDoc || !iframeWin) return colors;

      // ── Strategy 1: Read computed CSS custom properties from :root ──────
      // This catches ALL resolved variables regardless of source (inline, linked, etc.)
      try {
        const rootEl = iframeDoc.documentElement;
        const rootCS = iframeWin.getComputedStyle(rootEl);
        // getComputedStyle doesn't enumerate custom properties directly,
        // but we can scan all stylesheets for variable declarations
        const varNames = new Set();
        function _scanRules(rules) {
          for (let j = 0; j < rules.length; j++) {
            const rule = rules[j];
            if (rule.style) {
              for (let k = 0; k < rule.style.length; k++) {
                const prop = rule.style[k];
                if (prop.startsWith('--')) varNames.add(prop);
              }
            }
            // Recurse into @media, @supports, @layer etc.
            if (rule.cssRules) _scanRules(rule.cssRules);
          }
        }
        for (let i = 0; i < iframeDoc.styleSheets.length; i++) {
          try {
            const sheet = iframeDoc.styleSheets[i];
            const rules = sheet.cssRules || sheet.rules;
            if (rules) _scanRules(rules);
          } catch (e) { /* cross-origin sheet, skip */ }
        }
        // Also scan inline style on :root for dynamically set variables
        if (rootEl.style) {
          for (let k = 0; k < rootEl.style.length; k++) {
            const prop = rootEl.style[k];
            if (prop.startsWith('--')) varNames.add(prop);
          }
        }
        // Resolve each variable via getComputedStyle
        varNames.forEach(function(varName) {
          if (seenVar[varName]) return; // deduplicate by variable name, not hex
          const val = rootCS.getPropertyValue(varName).trim();
          if (!val) return;
          let hex = null;
          if (val.match(/^#[0-9a-fA-F]{3,8}$/)) {
            if (val.length <= 5) hex = _expandShortHex(val);
            else if (val.length === 9) hex = val.substring(0, 7); // #RRGGBBAA → #RRGGBB
            else hex = val;
          } else if (val.match(/^rgba?\(/)) {
            hex = rgbToHex(val);
          } else if (val.match(/^hsl/)) {
            // Skip hsl for now (complex to convert)
            return;
          } else {
            return; // Not a color value
          }
          if (hex && hex !== 'transparent') {
            seenVar[varName] = true;
            seenHex[hex.toUpperCase()] = true; // also mark hex as seen for strategy 3
            let cat = 'other';
            const ln = varName.toLowerCase();
            if (ln.includes('text') || ln.includes('font') || (ln.includes('color') && !ln.includes('bg') && !ln.includes('background') && !ln.includes('border'))) cat = 'text';
            else if (ln.includes('bg') || ln.includes('background') || ln.includes('surface')) cat = 'bg';
            else if (ln.includes('border') || ln.includes('stroke') || ln.includes('outline')) cat = 'border';
            colors.push({ varName: varName, hex: hex, category: cat });
          }
        });
      } catch (e) { /* stylesheet access error (cross-origin) — continue */ }

      // ── Strategy 2: Regex scan <style> tags (fallback for inline styles) ──
      if (colors.length === 0) {
        const rootStyles = iframeDoc.querySelectorAll('style');
        rootStyles.forEach(styleTag => {
          const text = styleTag.textContent || '';
          const varMatches = text.match(/--[\w-]+\s*:\s*(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g);
          if (varMatches) {
            varMatches.forEach(m => {
              const parts = m.split(':');
              const varName = parts[0].trim();
              if (seenVar[varName]) return;
              const valStr = parts.slice(1).join(':').trim();
              let hex = valStr;
              if (valStr.match(/^rgba?\(/)) hex = rgbToHex(valStr);
              if (hex && hex !== 'transparent') {
                seenVar[varName] = true;
                seenHex[hex.toUpperCase()] = true;
                let cat = 'other';
                const ln = varName.toLowerCase();
                if (ln.includes('text') || ln.includes('font') || (ln.includes('color') && !ln.includes('bg') && !ln.includes('background') && !ln.includes('border'))) cat = 'text';
                else if (ln.includes('bg') || ln.includes('background')) cat = 'bg';
                else if (ln.includes('border')) cat = 'border';
                colors.push({ varName, hex, category: cat });
              }
            });
          }
        });
      }

      // ── Strategy 3: Scan computed element colors (always runs as supplement) ──
      const allEls = iframeDoc.querySelectorAll('*');
      const limit = Math.min(allEls.length, 200);
      for (let i = 0; i < limit; i++) {
        try {
          const cs = iframeWin.getComputedStyle(allEls[i]);
          const tc = rgbToHex(cs.color);
          if (tc && tc !== 'transparent' && tc !== '#000000' && tc !== '#FFFFFF' && !seenHex[tc.toUpperCase()]) {
            seenHex[tc.toUpperCase()] = true;
            colors.push({ varName: '', hex: tc, category: 'text' });
          }
          const bc = rgbToHex(cs.backgroundColor);
          if (bc && bc !== 'transparent' && bc !== '#000000' && bc !== '#FFFFFF' && !seenHex[bc.toUpperCase()]) {
            seenHex[bc.toUpperCase()] = true;
            colors.push({ varName: '', hex: bc, category: 'bg' });
          }
          const bdc = rgbToHex(cs.borderColor);
          if (bdc && bdc !== 'transparent' && bdc !== '#000000' && bdc !== '#FFFFFF' && !seenHex[bdc.toUpperCase()]) {
            seenHex[bdc.toUpperCase()] = true;
            colors.push({ varName: '', hex: bdc, category: 'border' });
          }
        } catch {}
      }
    } catch (e) {
      console.warn('[ColorPickerEngine] extractPageColors error:', e);
    }
    return colors;
  }

  /** Expand #RGB / #RGBA to #RRGGBB / #RRGGBBAA */
  function _expandShortHex(hex) {
    if (hex.length === 4) return '#' + hex[1]+hex[1] + hex[2]+hex[2] + hex[3]+hex[3];
    if (hex.length === 5) return '#' + hex[1]+hex[1] + hex[2]+hex[2] + hex[3]+hex[3] + hex[4]+hex[4];
    return hex;
  }

  // ===== 颜色备注 =====
  const defaultColorNotes = {
    '#FF6600': '主操作色/一级按钮',
    '#FF8C4B': '主操作色-浅',
    '#F7D5A1': 'SVIP金色-浅',
    '#F0BE69': 'SVIP金色-深',
    '#000000': '主文字色/标题',
    '#8C8C8C': '辅助文字/摘要',
    '#FFFFFF': '反白文字/纯白',
    '#F6F7FA': '页面灰色背景',
    '#E8E8E8': '占位背景色',
  };

  function loadColorNotes() {
    const notes = { ...defaultColorNotes };
    try {
      const stored = localStorage.getItem('cpk_color_notes');
      if (stored) Object.assign(notes, JSON.parse(stored));
    } catch {}
    return notes;
  }

  function saveColorNotes(notes) {
    try { localStorage.setItem('cpk_color_notes', JSON.stringify(notes)); } catch {}
  }

  // ===== 状态访问器 =====
  function getState()           { return cpkState; }
  function getFillType()        { return fillType; }
  function getGradientAngle()   { return gradientAngle; }
  function setGradientAngle(v)  { gradientAngle = v; }
  function getGradientStops()   { return gradientStops; }
  function getActiveStopIndex() { return activeStopIndex; }
  function setActiveStopIndex(i){ activeStopIndex = i; }
  function getDragging()        { return dragging; }
  function setDragging(v)       { dragging = v; }

  return {
    // 状态访问
    getState, getFillType, getGradientAngle, setGradientAngle,
    getGradientStops, getActiveStopIndex, setActiveStopIndex,
    getDragging, setDragging,
    // 计算
    currentRgb, currentHex, hueRgb, spectrumBg,
    spectrumCursorStyle, hueThumbStyle, alphaGradient, alphaThumbStyle,
    previewColor,
    // 操作
    getCurrentColor, getCurrentFill,
    setColorFromHex, setHexFromInput, setAlphaFromInput,
    handleSpectrumMove, handleHueMove, handleAlphaMove,
    eyedrop, startIframePick, extractPageColors,
    // 渐变
    setFillType, selectGradientStop, addGradientStop, removeActiveStop,
    updateActiveStopColor, updateActiveStopPosition,
    buildGradientString, parseGradientString,
    // 工具
    hsvToRgb, rgbToHsv, rgbToHex2, hexToRgb, rgbToHex, extractAlpha, isValidColor,
    // 颜色备注
    defaultColorNotes, loadColorNotes, saveColorNotes,
  };
}());
