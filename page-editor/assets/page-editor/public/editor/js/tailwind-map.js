/**
 * tailwind-map.js — Tailwind CSS default value reverse lookup tables
 *
 * Maps CSS computed values back to Tailwind class names.
 * Used by snapshot.js to generate tailwindHint for AI output.
 *
 * Data is based on Tailwind CSS v3 default theme.
 * No runtime dependencies, pure static data + lookup functions.
 */
'use strict';

window.TailwindMap = (function () {

  // ── Color palette (hex → color name) ─────────────────────────────────────
  // Tailwind default colors: https://tailwindcss.com/docs/customizing-colors
  // Note: some hex values map to multiple color families (e.g. #fafafa → zinc-50/neutral-50)
  // COLORS_MULTI stores these collisions; lookupColor resolves by checking classList context.
  var COLORS = {
    '#000000': 'black', '#ffffff': 'white',
    // slate
    '#f8fafc': 'slate-50', '#f1f5f9': 'slate-100', '#e2e8f0': 'slate-200',
    '#cbd5e1': 'slate-300', '#94a3b8': 'slate-400', '#64748b': 'slate-500',
    '#475569': 'slate-600', '#334155': 'slate-700', '#1e293b': 'slate-800',
    '#0f172a': 'slate-900', '#020617': 'slate-950',
    // gray
    '#f9fafb': 'gray-50', '#f3f4f6': 'gray-100', '#e5e7eb': 'gray-200',
    '#d1d5db': 'gray-300', '#9ca3af': 'gray-400', '#6b7280': 'gray-500',
    '#4b5563': 'gray-600', '#374151': 'gray-700', '#1f2937': 'gray-800',
    '#111827': 'gray-900', '#030712': 'gray-950',
    // zinc (unique values only; shared hex goes to COLORS_MULTI)
    '#f4f4f5': 'zinc-100', '#e4e4e7': 'zinc-200',
    '#d4d4d8': 'zinc-300', '#a1a1aa': 'zinc-400', '#71717a': 'zinc-500',
    '#52525b': 'zinc-600', '#3f3f46': 'zinc-700', '#27272a': 'zinc-800',
    '#18181b': 'zinc-900',
    // neutral (unique values only)
    '#f5f5f5': 'neutral-100', '#e5e5e5': 'neutral-200',
    '#d4d4d4': 'neutral-300', '#a3a3a3': 'neutral-400', '#737373': 'neutral-500',
    '#525252': 'neutral-600', '#404040': 'neutral-700', '#262626': 'neutral-800',
    '#171717': 'neutral-900',
    // red
    '#fef2f2': 'red-50', '#fee2e2': 'red-100', '#fecaca': 'red-200',
    '#fca5a5': 'red-300', '#f87171': 'red-400', '#ef4444': 'red-500',
    '#dc2626': 'red-600', '#b91c1c': 'red-700', '#991b1b': 'red-800',
    '#7f1d1d': 'red-900', '#450a0a': 'red-950',
    // orange
    '#fff7ed': 'orange-50', '#ffedd5': 'orange-100', '#fed7aa': 'orange-200',
    '#fdba74': 'orange-300', '#fb923c': 'orange-400', '#f97316': 'orange-500',
    '#ea580c': 'orange-600', '#c2410c': 'orange-700', '#9a3412': 'orange-800',
    '#7c2d12': 'orange-900', '#431407': 'orange-950',
    // amber
    '#fffbeb': 'amber-50', '#fef3c7': 'amber-100', '#fde68a': 'amber-200',
    '#fcd34d': 'amber-300', '#fbbf24': 'amber-400', '#f59e0b': 'amber-500',
    '#d97706': 'amber-600', '#b45309': 'amber-700', '#92400e': 'amber-800',
    '#78350f': 'amber-900', '#451a03': 'amber-950',
    // yellow
    '#fefce8': 'yellow-50', '#fef9c3': 'yellow-100', '#fef08a': 'yellow-200',
    '#fde047': 'yellow-300', '#facc15': 'yellow-400', '#eab308': 'yellow-500',
    '#ca8a04': 'yellow-600', '#a16207': 'yellow-700', '#854d0e': 'yellow-800',
    '#713f12': 'yellow-900', '#422006': 'yellow-950',
    // green
    '#f0fdf4': 'green-50', '#dcfce7': 'green-100', '#bbf7d0': 'green-200',
    '#86efac': 'green-300', '#4ade80': 'green-400', '#22c55e': 'green-500',
    '#16a34a': 'green-600', '#15803d': 'green-700', '#166534': 'green-800',
    '#14532d': 'green-900', '#052e16': 'green-950',
    // emerald
    '#ecfdf5': 'emerald-50', '#d1fae5': 'emerald-100', '#a7f3d0': 'emerald-200',
    '#6ee7b7': 'emerald-300', '#34d399': 'emerald-400', '#10b981': 'emerald-500',
    '#059669': 'emerald-600', '#047857': 'emerald-700', '#065f46': 'emerald-800',
    '#064e3b': 'emerald-900', '#022c22': 'emerald-950',
    // teal
    '#f0fdfa': 'teal-50', '#ccfbf1': 'teal-100', '#99f6e4': 'teal-200',
    '#5eead4': 'teal-300', '#2dd4bf': 'teal-400', '#14b8a6': 'teal-500',
    '#0d9488': 'teal-600', '#0f766e': 'teal-700', '#115e59': 'teal-800',
    '#134e4a': 'teal-900', '#042f2e': 'teal-950',
    // cyan
    '#ecfeff': 'cyan-50', '#cffafe': 'cyan-100', '#a5f3fc': 'cyan-200',
    '#67e8f9': 'cyan-300', '#22d3ee': 'cyan-400', '#06b6d4': 'cyan-500',
    '#0891b2': 'cyan-600', '#0e7490': 'cyan-700', '#155e75': 'cyan-800',
    '#164e63': 'cyan-900', '#083344': 'cyan-950',
    // sky
    '#f0f9ff': 'sky-50', '#e0f2fe': 'sky-100', '#bae6fd': 'sky-200',
    '#7dd3fc': 'sky-300', '#38bdf8': 'sky-400', '#0ea5e9': 'sky-500',
    '#0284c7': 'sky-600', '#0369a1': 'sky-700', '#075985': 'sky-800',
    '#0c4a6e': 'sky-900', '#082f49': 'sky-950',
    // blue
    '#eff6ff': 'blue-50', '#dbeafe': 'blue-100', '#bfdbfe': 'blue-200',
    '#93c5fd': 'blue-300', '#60a5fa': 'blue-400', '#3b82f6': 'blue-500',
    '#2563eb': 'blue-600', '#1d4ed8': 'blue-700', '#1e40af': 'blue-800',
    '#1e3a8a': 'blue-900', '#172554': 'blue-950',
    // indigo
    '#eef2ff': 'indigo-50', '#e0e7ff': 'indigo-100', '#c7d2fe': 'indigo-200',
    '#a5b4fc': 'indigo-300', '#818cf8': 'indigo-400', '#6366f1': 'indigo-500',
    '#4f46e5': 'indigo-600', '#4338ca': 'indigo-700', '#3730a3': 'indigo-800',
    '#312e81': 'indigo-900', '#1e1b4b': 'indigo-950',
    // violet
    '#f5f3ff': 'violet-50', '#ede9fe': 'violet-100', '#ddd6fe': 'violet-200',
    '#c4b5fd': 'violet-300', '#a78bfa': 'violet-400', '#8b5cf6': 'violet-500',
    '#7c3aed': 'violet-600', '#6d28d9': 'violet-700', '#5b21b6': 'violet-800',
    '#4c1d95': 'violet-900', '#2e1065': 'violet-950',
    // purple
    '#faf5ff': 'purple-50', '#f3e8ff': 'purple-100', '#e9d5ff': 'purple-200',
    '#d8b4fe': 'purple-300', '#c084fc': 'purple-400', '#a855f7': 'purple-500',
    '#9333ea': 'purple-600', '#7e22ce': 'purple-700', '#6b21a8': 'purple-800',
    '#581c87': 'purple-900', '#3b0764': 'purple-950',
    // fuchsia
    '#fdf4ff': 'fuchsia-50', '#fae8ff': 'fuchsia-100', '#f5d0fe': 'fuchsia-200',
    '#f0abfc': 'fuchsia-300', '#e879f9': 'fuchsia-400', '#d946ef': 'fuchsia-500',
    '#c026d3': 'fuchsia-600', '#a21caf': 'fuchsia-700', '#86198f': 'fuchsia-800',
    '#701a75': 'fuchsia-900', '#4a044e': 'fuchsia-950',
    // pink
    '#fdf2f8': 'pink-50', '#fce7f3': 'pink-100', '#fbcfe8': 'pink-200',
    '#f9a8d4': 'pink-300', '#f472b6': 'pink-400', '#ec4899': 'pink-500',
    '#db2777': 'pink-600', '#be185d': 'pink-700', '#9d174d': 'pink-800',
    '#831843': 'pink-900', '#500724': 'pink-950',
    // rose
    '#fff1f2': 'rose-50', '#ffe4e6': 'rose-100', '#fecdd3': 'rose-200',
    '#fda4af': 'rose-300', '#fb7185': 'rose-400', '#f43f5e': 'rose-500',
    '#e11d48': 'rose-600', '#be123c': 'rose-700', '#9f1239': 'rose-800',
    '#881337': 'rose-900', '#4c0519': 'rose-950',
  };

  // Hex values shared by multiple color families — resolved by classList context
  var COLORS_MULTI = {
    '#fafafa': ['zinc-50', 'neutral-50'],
    '#09090b': ['zinc-950', 'neutral-950'],
  };

  // ── Spacing scale (px string → Tailwind suffix) ──────────────────────────
  var SPACING = {
    '0': '0', '1': 'px', '2': '0.5', '4': '1', '6': '1.5', '8': '2',
    '10': '2.5', '12': '3', '14': '3.5', '16': '4', '20': '5', '24': '6',
    '28': '7', '32': '8', '36': '9', '40': '10', '44': '11', '48': '12',
    '56': '14', '64': '16', '80': '20', '96': '24',
    '112': '28', '128': '32', '144': '36', '160': '40', '176': '44',
    '192': '48', '224': '56', '256': '64', '288': '72', '320': '80', '384': '96',
  };

  // ── Font size (px → class name) ──────────────────────────────────────────
  var FONT_SIZE = {
    '12': 'xs', '14': 'sm', '16': 'base', '18': 'lg', '20': 'xl',
    '24': '2xl', '30': '3xl', '36': '4xl', '48': '5xl', '60': '6xl',
    '72': '7xl', '96': '8xl', '128': '9xl',
  };

  // ── Font weight (value → class suffix) ───────────────────────────────────
  var FONT_WEIGHT = {
    '100': 'thin', '200': 'extralight', '300': 'light', '400': 'normal',
    '500': 'medium', '600': 'semibold', '700': 'bold', '800': 'extrabold', '900': 'black',
  };

  // ── Border radius (px → class suffix) ────────────────────────────────────
  var BORDER_RADIUS = {
    '0': 'none', '2': 'sm', '4': '', '6': 'md', '8': 'lg',
    '12': 'xl', '16': '2xl', '24': '3xl', '9999': 'full',
  };

  // ── Opacity (decimal → class suffix) ─────────────────────────────────────
  var OPACITY = {
    '0': '0', '0.05': '5', '0.1': '10', '0.2': '20', '0.25': '25',
    '0.3': '30', '0.4': '40', '0.5': '50', '0.6': '60', '0.7': '70',
    '0.75': '75', '0.8': '80', '0.9': '90', '0.95': '95', '1': '100',
  };

  // ── Property → Tailwind prefix mapping ───────────────────────────────────
  var PROPERTY_PREFIX = {
    // Colors
    'color': { prefix: 'text', table: 'color' },
    'backgroundColor': { prefix: 'bg', table: 'color' },
    'borderColor': { prefix: 'border', table: 'color' },
    // Spacing
    'padding': { prefix: 'p', table: 'spacing' },
    'paddingTop': { prefix: 'pt', table: 'spacing' },
    'paddingRight': { prefix: 'pr', table: 'spacing' },
    'paddingBottom': { prefix: 'pb', table: 'spacing' },
    'paddingLeft': { prefix: 'pl', table: 'spacing' },
    'margin': { prefix: 'm', table: 'spacing' },
    'marginTop': { prefix: 'mt', table: 'spacing' },
    'marginRight': { prefix: 'mr', table: 'spacing' },
    'marginBottom': { prefix: 'mb', table: 'spacing' },
    'marginLeft': { prefix: 'ml', table: 'spacing' },
    'gap': { prefix: 'gap', table: 'spacing' },
    'width': { prefix: 'w', table: 'spacing' },
    'height': { prefix: 'h', table: 'spacing' },
    // Typography
    'fontSize': { prefix: 'text', table: 'fontSize' },
    'fontWeight': { prefix: 'font', table: 'fontWeight' },
    // Border
    'borderRadius': { prefix: 'rounded', table: 'borderRadius' },
    // Opacity
    'opacity': { prefix: 'opacity', table: 'opacity' },
  };

  // ── Lookup functions ─────────────────────────────────────────────────────

  /**
   * Convert a CSS color value (hex, rgb) to Tailwind color name.
   * Optional classList helps disambiguate when hex maps to multiple families.
   * Returns null if no match.
   */
  function lookupColor(cssValue, classList) {
    if (!cssValue) return null;
    var hex = _normalizeToHex(cssValue);
    if (!hex) return null;

    // Check for exact single match
    if (COLORS[hex]) return COLORS[hex];

    // Check for multi-family collision
    var multi = COLORS_MULTI[hex];
    if (!multi) return null;

    // Try to pick the family that's already in use on the element
    if (classList && classList.length) {
      for (var i = 0; i < multi.length; i++) {
        var family = multi[i].split('-')[0]; // e.g. 'zinc' from 'zinc-50'
        for (var j = 0; j < classList.length; j++) {
          if (classList[j].indexOf(family) !== -1) return multi[i];
        }
      }
    }
    // Default to first option
    return multi[0];
  }

  /**
   * Convert a CSS pixel value to Tailwind spacing suffix.
   */
  function lookupSpacing(cssValue) {
    if (!cssValue) return null;
    var px = _extractPx(cssValue);
    if (px === null) return null;
    return SPACING[String(px)] || null;
  }

  /**
   * Look up the Tailwind class for a given CSS property and value.
   * Optional classList helps disambiguate color families.
   * Returns { className, confidence } or null.
   */
  function lookup(property, cssValue, classList) {
    var mapping = PROPERTY_PREFIX[property];
    if (!mapping) return null;

    var suffix = null;
    var confidence = 'exact';

    switch (mapping.table) {
      case 'color':
        suffix = lookupColor(cssValue, classList);
        if (!suffix) {
          // Use arbitrary value syntax
          var hex = _normalizeToHex(cssValue);
          if (hex) {
            return { className: mapping.prefix + '-[' + hex + ']', confidence: 'arbitrary' };
          }
          return null;
        }
        break;
      case 'spacing':
        suffix = lookupSpacing(cssValue);
        if (!suffix && suffix !== '0') {
          var px = _extractPx(cssValue);
          if (px !== null) {
            return { className: mapping.prefix + '-[' + px + 'px]', confidence: 'arbitrary' };
          }
          return null;
        }
        break;
      case 'fontSize':
        var fsPx = _extractPx(cssValue);
        suffix = fsPx !== null ? FONT_SIZE[String(fsPx)] : null;
        if (!suffix) {
          if (fsPx !== null) {
            return { className: 'text-[' + fsPx + 'px]', confidence: 'arbitrary' };
          }
          return null;
        }
        break;
      case 'fontWeight':
        suffix = FONT_WEIGHT[String(cssValue)] || null;
        if (!suffix) return null;
        break;
      case 'borderRadius':
        var brPx = _extractPx(cssValue);
        suffix = brPx !== null ? BORDER_RADIUS[String(brPx)] : null;
        if (suffix === undefined || suffix === null) {
          if (brPx !== null) {
            return { className: 'rounded-[' + brPx + 'px]', confidence: 'arbitrary' };
          }
          return null;
        }
        // 'rounded' (no suffix) is the default 4px
        break;
      case 'opacity':
        suffix = OPACITY[String(cssValue)] || null;
        if (!suffix && suffix !== '0') return null;
        break;
      default:
        return null;
    }

    // Build class name
    var cls;
    if (mapping.table === 'borderRadius') {
      cls = suffix === '' ? 'rounded' : 'rounded-' + suffix;
    } else {
      cls = mapping.prefix + '-' + suffix;
    }
    return { className: cls, confidence: confidence };
  }

  /**
   * Find the current Tailwind class in classList that matches a property prefix.
   * Handles the text- prefix collision between color and fontSize.
   */
  function findCurrentClass(property, classList) {
    var mapping = PROPERTY_PREFIX[property];
    if (!mapping || !classList) return null;

    var prefix = mapping.prefix + '-';
    // Special: 'rounded' with no dash for borderRadius base
    if (property === 'borderRadius') prefix = 'rounded';

    // Known fontSize suffixes to distinguish text-lg (size) from text-red-500 (color)
    var SIZE_SUFFIXES = /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|\[.+\])$/;

    for (var i = 0; i < classList.length; i++) {
      var cls = classList[i];
      if (cls === mapping.prefix || cls.indexOf(prefix) === 0) {
        // Disambiguate text- prefix: fontSize vs color
        if (mapping.prefix === 'text') {
          var isSize = SIZE_SUFFIXES.test(cls);
          if (mapping.table === 'fontSize' && !isSize) continue;  // skip color classes
          if (mapping.table === 'color' && isSize) continue;       // skip size classes
        }
        return cls;
      }
    }
    return null;
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  function _normalizeToHex(val) {
    if (!val || typeof val !== 'string') return null;
    val = val.trim().toLowerCase();

    // Already hex
    if (/^#[0-9a-f]{6}$/.test(val)) return val;
    if (/^#[0-9a-f]{3}$/.test(val)) {
      return '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
    }

    // rgb(r, g, b)
    var m = val.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
      var r = Math.min(255, parseInt(m[1], 10));
      var g = Math.min(255, parseInt(m[2], 10));
      var b = Math.min(255, parseInt(m[3], 10));
      return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    return null;
  }

  function _extractPx(val) {
    if (val === '0' || val === '0px') return 0;
    if (typeof val === 'number') return val;
    if (typeof val !== 'string') return null;
    var m = val.match(/^(\d+(?:\.\d+)?)\s*px$/);
    return m ? parseFloat(m[1]) : null;
  }

  return {
    lookup: lookup,
    lookupColor: lookupColor,
    lookupSpacing: lookupSpacing,
    findCurrentClass: findCurrentClass,
    PROPERTY_PREFIX: PROPERTY_PREFIX,
  };
}());
