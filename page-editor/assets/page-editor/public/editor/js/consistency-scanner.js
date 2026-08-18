/**
 * consistency-scanner.js — Style consistency analysis engine
 *
 * Scans all visible elements in the iframe for inconsistent but similar
 * CSS values (colors, font sizes, spacing, border radius).
 * Returns issues with suggested unification values.
 *
 * Pure client-side analysis, zero external dependencies.
 */
'use strict';

window.ConsistencyScanner = (function () {

  var MAX_ELEMENTS = 500;
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, META: 1, LINK: 1, BR: 1, HR: 1, NOSCRIPT: 1, TEMPLATE: 1 };

  // Color distance threshold (RGB Euclidean, 0-441 range)
  // ~30 catches visually similar grays/colors without false positives
  var COLOR_THRESHOLD = 30;
  var FONT_SIZE_THRESHOLD = 2;   // px
  var SPACING_THRESHOLD = 4;     // px
  var RADIUS_THRESHOLD = 2;      // px

  /**
   * Scan the iframe document for style inconsistencies.
   * @param {Document} iframeDoc
   * @returns {Array} issues — each with type, items, suggestedValue, property
   */
  function scan(iframeDoc) {
    if (!iframeDoc || !iframeDoc.body) return [];

    var win = iframeDoc.defaultView;
    if (!win) return [];

    // Collect computed styles from visible elements
    var colorMap = {};       // hex → { count, elements[] }
    var bgColorMap = {};
    var fontSizeMap = {};    // px string → { count, elements[] }
    var spacingMap = {};     // px string → { count, elements[], property }
    var radiusMap = {};      // px string → { count, elements[] }

    var walker = iframeDoc.createTreeWalker(iframeDoc.body, NodeFilter.SHOW_ELEMENT);
    var node;
    var count = 0;

    while ((node = walker.nextNode()) && count < MAX_ELEMENTS) {
      if (SKIP_TAGS[node.tagName]) continue;
      if (node.id && node.id.indexOf('__page-editor') === 0) continue;
      // Skip invisible elements
      if (node.offsetWidth === 0 && node.offsetHeight === 0) continue;
      count++;

      var cs;
      try { cs = win.getComputedStyle(node); } catch (e) { continue; }
      var sel = _quickSelector(node, iframeDoc);

      // ── Colors ──
      _collectColor(cs.color, sel, colorMap);
      var bg = cs.backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        _collectColor(bg, sel, bgColorMap);
      }

      // ── Font size ──
      var fs = parseFloat(cs.fontSize);
      if (fs > 0) _collectNumeric(fs, sel, fontSizeMap);

      // ── Spacing (padding, margin, gap) ──
      var pad = parseFloat(cs.paddingTop) || 0;
      if (pad > 0) _collectNumeric(pad, sel, spacingMap);
      var mar = parseFloat(cs.marginTop) || 0;
      if (mar > 0) _collectNumeric(mar, sel, spacingMap);
      var gap = parseFloat(cs.gap);
      if (gap > 0) _collectNumeric(gap, sel, spacingMap);

      // ── Border radius ──
      var rad = parseFloat(cs.borderTopLeftRadius) || 0;
      if (rad > 0) _collectNumeric(rad, sel, radiusMap);
    }

    // ── Analyze clusters ──
    var issues = [];

    var colorIssues = _analyzeColors(colorMap, 'color');
    if (colorIssues) issues.push(colorIssues);

    var bgIssues = _analyzeColors(bgColorMap, 'backgroundColor');
    if (bgIssues) issues.push(bgIssues);

    var fsIssues = _analyzeNumeric(fontSizeMap, 'fontSize', FONT_SIZE_THRESHOLD, 'px');
    if (fsIssues) issues.push(fsIssues);

    var spIssues = _analyzeNumeric(spacingMap, 'spacing', SPACING_THRESHOLD, 'px');
    if (spIssues) issues.push(spIssues);

    var radIssues = _analyzeNumeric(radiusMap, 'borderRadius', RADIUS_THRESHOLD, 'px');
    if (radIssues) issues.push(radIssues);

    return issues;
  }

  // ── Collectors ────────────────────────────────────────────────────────────

  function _collectColor(cssValue, selector, map) {
    var hex = _rgbToHex(cssValue);
    if (!hex) return;
    if (!map[hex]) map[hex] = { count: 0, elements: [] };
    map[hex].count++;
    if (map[hex].elements.length < 5) map[hex].elements.push(selector);
  }

  function _collectNumeric(value, selector, map) {
    var rounded = Math.round(value);
    var key = String(rounded);
    if (!map[key]) map[key] = { count: 0, elements: [] };
    map[key].count++;
    if (map[key].elements.length < 5) map[key].elements.push(selector);
  }

  // ── Analyzers ─────────────────────────────────────────────────────────────

  function _analyzeColors(map, property) {
    var hexes = Object.keys(map);
    if (hexes.length < 2) return null;

    // Cluster similar colors using RGB distance
    var clusters = _clusterColors(hexes, map);

    // Only report clusters with 2+ distinct values
    var issues = clusters.filter(function (c) { return c.values.length >= 2; });
    if (issues.length === 0) return null;

    // Pick the biggest cluster (most likely a real inconsistency)
    var biggest = issues.sort(function (a, b) { return b.totalCount - a.totalCount; })[0];

    // Suggested value = most common in the cluster
    var sorted = biggest.values.sort(function (a, b) { return b.count - a.count; });
    var suggested = sorted[0].value;

    var typeLabel = property === 'color' ? '文字颜色' : '背景颜色';
    return {
      type: 'similar-colors',
      severity: 'warning',
      property: property,
      description: '检测到 ' + biggest.values.length + ' 个相近的' + typeLabel,
      items: sorted.map(function (v) {
        return { value: v.value, elements: v.elements, count: v.count };
      }),
      suggestedValue: suggested,
    };
  }

  function _analyzeNumeric(map, property, threshold, unit) {
    var values = Object.keys(map).map(Number).sort(function (a, b) { return a - b; });
    if (values.length < 2) return null;

    // Find groups of similar values (within threshold)
    var clusters = _clusterNumeric(values, map, threshold);
    var issues = clusters.filter(function (c) { return c.values.length >= 2; });
    if (issues.length === 0) return null;

    var biggest = issues.sort(function (a, b) { return b.totalCount - a.totalCount; })[0];
    var sorted = biggest.values.sort(function (a, b) { return b.count - a.count; });
    var suggested = sorted[0].value;

    var typeLabels = {
      fontSize: '字号',
      spacing: '间距',
      borderRadius: '圆角',
    };
    return {
      type: 'similar-' + property,
      severity: 'info',
      property: property === 'spacing' ? 'padding' : property,
      description: '检测到 ' + biggest.values.length + ' 个相近的' + (typeLabels[property] || property),
      items: sorted.map(function (v) {
        return { value: v.value + unit, elements: v.elements, count: v.count };
      }),
      suggestedValue: suggested + unit,
    };
  }

  // ── Clustering ────────────────────────────────────────────────────────────

  function _clusterColors(hexes, map) {
    var used = {};
    var clusters = [];

    for (var i = 0; i < hexes.length; i++) {
      if (used[hexes[i]]) continue;
      var cluster = {
        values: [{ value: hexes[i], count: map[hexes[i]].count, elements: map[hexes[i]].elements }],
        totalCount: map[hexes[i]].count,
      };
      used[hexes[i]] = true;

      for (var j = i + 1; j < hexes.length; j++) {
        if (used[hexes[j]]) continue;
        if (_colorDistance(hexes[i], hexes[j]) < COLOR_THRESHOLD) {
          cluster.values.push({ value: hexes[j], count: map[hexes[j]].count, elements: map[hexes[j]].elements });
          cluster.totalCount += map[hexes[j]].count;
          used[hexes[j]] = true;
        }
      }
      clusters.push(cluster);
    }
    return clusters;
  }

  function _clusterNumeric(values, map, threshold) {
    var used = {};
    var clusters = [];

    for (var i = 0; i < values.length; i++) {
      var key = String(values[i]);
      if (used[key]) continue;
      var cluster = {
        values: [{ value: values[i], count: map[key].count, elements: map[key].elements }],
        totalCount: map[key].count,
      };
      used[key] = true;

      for (var j = i + 1; j < values.length; j++) {
        var key2 = String(values[j]);
        if (used[key2]) continue;
        if (Math.abs(values[i] - values[j]) <= threshold) {
          cluster.values.push({ value: values[j], count: map[key2].count, elements: map[key2].elements });
          cluster.totalCount += map[key2].count;
          used[key2] = true;
        }
      }
      clusters.push(cluster);
    }
    return clusters;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _rgbToHex(val) {
    if (!val || typeof val !== 'string') return null;
    var m = val.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) {
      // Already hex?
      if (/^#[0-9a-f]{6}$/i.test(val)) return val.toLowerCase();
      return null;
    }
    var r = parseInt(m[1], 10);
    var g = parseInt(m[2], 10);
    var b = parseInt(m[3], 10);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function _colorDistance(hex1, hex2) {
    var r1 = parseInt(hex1.slice(1, 3), 16);
    var g1 = parseInt(hex1.slice(3, 5), 16);
    var b1 = parseInt(hex1.slice(5, 7), 16);
    var r2 = parseInt(hex2.slice(1, 3), 16);
    var g2 = parseInt(hex2.slice(3, 5), 16);
    var b2 = parseInt(hex2.slice(5, 7), 16);
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
  }

  /** Quick selector for scan results (doesn't need to be as robust as SelectorEngine) */
  function _quickSelector(el, doc) {
    if (el.id) return '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      var cls = el.className.trim().split(/\s+/)[0];
      if (cls) {
        try {
          if (doc.querySelectorAll('.' + CSS.escape(cls)).length <= 3) return '.' + cls;
        } catch (e) {}
      }
    }
    return el.tagName.toLowerCase();
  }

  return { scan: scan };
}());
