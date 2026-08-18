/**
 * selector.js — Unified CSS selector generator
 *
 * Replaces the duplicated _selectorFor() in editor-core.js and undo-stack.js.
 * Uses css-selector-generator for smart, short, unique selectors,
 * with stable-anchor priority (id, data-module-id) and a fallback path.
 *
 * Dependencies: css-selector-generator (loaded as global CssSelectorGenerator)
 */
'use strict';

window.SelectorEngine = (function () {

  /**
   * Generate a unique CSS selector for `el` within `rootDoc`.
   * @param {Element} el - Target element
   * @param {Document} rootDoc - The iframe document (not the parent frame)
   * @returns {string} A CSS selector that uniquely identifies the element
   */
  function generate(el, rootDoc) {
    if (!el || el === rootDoc.body) return 'body';

    // ── Priority 1: Stable ID anchor ──
    if (el.id) return '#' + CSS.escape(el.id);

    // ── Priority 2: data-module-id anchor ──
    const modEl = el.closest('[data-module-id]');
    if (modEl) {
      const base = '[data-module-id="' + CSS.escape(modEl.getAttribute('data-module-id')) + '"]';
      if (modEl === el) return base;
      // Build relative selector inside module
      const tag = el.tagName.toLowerCase();
      const siblings = Array.from(modEl.querySelectorAll(tag));
      const idx = siblings.indexOf(el);
      if (idx !== -1) return base + ' ' + tag + ':nth-of-type(' + (idx + 1) + ')';
    }

    // ── Priority 3: Semantic class selector (avoids fragile nth-of-type) ──
    var semanticSel = _trySemanticSelector(el, rootDoc);
    if (semanticSel) return semanticSel;

    // ── Priority 4: css-selector-generator (smart, short, unique) ──
    if (typeof CssSelectorGenerator !== 'undefined' && CssSelectorGenerator.getCssSelector) {
      try {
        var selector = CssSelectorGenerator.getCssSelector(el, {
          root: rootDoc.body,
          blacklist: ['[data-edit-hover]', '[data-edit-selected]', '[style]'],
          combineWithinSelector: true,
          combineBetweenSelectors: true,
        });
        // Validate: must be unique AND not contain [style] (unreliable for AI)
        if (selector && rootDoc.querySelectorAll(selector).length === 1 &&
            selector.indexOf('[style') === -1) {
          return selector;
        }
      } catch (e) {
        // Fall through to manual fallback
      }
    }

    // ── Priority 5: Manual fallback with class hints ──
    return _fallbackSelector(el, rootDoc);
  }

  /**
   * Generate a recommended selector for AI — always precise and safe.
   * Uses parent context + nth-child to guarantee uniqueness even for
   * elements without id/class (e.g. inline-styled divs).
   *
   * Priority: class → .parent > tag:nth-child(n) → full DOM path
   */
  function generateRecommended(el, rootDoc) {
    if (!el || el === rootDoc.body) return 'body';

    // 1. If element has a unique semantic class, use it
    var semanticSel = _trySemanticSelector(el, rootDoc);
    if (semanticSel) return semanticSel;

    // 2. If element has an id, use it
    if (el.id) return '#' + CSS.escape(el.id);

    // 3. Try parent-class + tag:nth-child(n)
    var parent = el.parentElement;
    if (parent) {
      var parentSel = null;
      // Try parent's unique class
      if (parent.id) {
        parentSel = '#' + CSS.escape(parent.id);
      } else if (parent.className && typeof parent.className === 'string') {
        var parentClasses = parent.className.trim().split(/\s+/);
        for (var i = 0; i < parentClasses.length; i++) {
          if (_isUtilityClass(parentClasses[i])) continue;
          var pSel = '.' + CSS.escape(parentClasses[i]);
          try {
            if (rootDoc.querySelectorAll(pSel).length === 1) {
              parentSel = pSel;
              break;
            }
          } catch (e) {}
        }
      }

      if (parentSel) {
        var childIdx = Array.from(parent.children).indexOf(el) + 1;
        var tag = el.tagName.toLowerCase();
        var combined = parentSel + ' > ' + tag + ':nth-child(' + childIdx + ')';
        try {
          if (rootDoc.querySelectorAll(combined).length === 1) return combined;
        } catch (e) {}
        // Try without nth-child if tag alone is unique under parent
        var simpler = parentSel + ' > ' + tag;
        try {
          if (rootDoc.querySelectorAll(simpler).length === 1) return simpler;
        } catch (e) {}
      }
    }

    // 4. Full DOM path fallback (always unique)
    return _fallbackSelector(el, rootDoc);
  }

  /**
   * Generate multiple alternate selectors for AI to choose from.
   * Returns array of unique selectors sorted by readability.
   */
  function generateAlternates(el, rootDoc) {
    if (!el || el === rootDoc.body) return [];
    var primary = generate(el, rootDoc);
    var alts = new Set();
    alts.add(primary);

    // Try ID
    if (el.id) alts.add('#' + CSS.escape(el.id));

    // Try unique class (non-utility)
    if (el.className && typeof el.className === 'string') {
      var classes = el.className.trim().split(/\s+/);
      for (var i = 0; i < classes.length; i++) {
        var cls = classes[i];
        if (!cls || _isUtilityClass(cls)) continue;
        var sel = '.' + CSS.escape(cls);
        try {
          if (rootDoc.querySelectorAll(sel).length === 1) {
            alts.add(sel);
          }
        } catch (e) { /* invalid selector */ }
      }
    }

    // Try data-testid / data-component
    var testAttrs = ['data-testid', 'data-component', 'data-section', 'data-id'];
    for (var j = 0; j < testAttrs.length; j++) {
      var val = el.getAttribute(testAttrs[j]);
      if (val) {
        var sel2 = '[' + testAttrs[j] + '="' + CSS.escape(val) + '"]';
        try {
          if (rootDoc.querySelectorAll(sel2).length === 1) alts.add(sel2);
        } catch (e) {}
      }
    }

    // Try tag.class (parent context)
    var parent = el.parentElement;
    if (parent && parent.className && typeof parent.className === 'string') {
      var parentClasses = parent.className.trim().split(/\s+/);
      for (var k = 0; k < parentClasses.length; k++) {
        if (_isUtilityClass(parentClasses[k])) continue;
        var parentSel = '.' + CSS.escape(parentClasses[k]);
        var tag = el.tagName.toLowerCase();
        var combined = parentSel + ' > ' + tag;
        try {
          if (rootDoc.querySelectorAll(combined).length === 1) {
            alts.add(combined);
          }
        } catch (e) {}
      }
    }

    // Remove primary from alts (it's the main selector)
    alts.delete(primary);
    return Array.from(alts);
  }

  /** Try to build a selector from semantic class names (non-utility, meaningful) */
  function _trySemanticSelector(el, doc) {
    if (!el.className || typeof el.className !== 'string') return null;
    var classes = el.className.trim().split(/\s+/);
    for (var i = 0; i < classes.length; i++) {
      var cls = classes[i];
      if (!cls || _isUtilityClass(cls)) continue;
      var sel = '.' + CSS.escape(cls);
      try {
        if (doc.querySelectorAll(sel).length === 1) return sel;
      } catch (e) {}
    }
    return null;
  }

  /** Check if a class name looks like a utility class (Tailwind, Bootstrap, etc.) */
  function _isUtilityClass(cls) {
    return /^(text-|bg-|p-|px-|py-|pt-|pb-|pl-|pr-|m-|mx-|my-|mt-|mb-|ml-|mr-|w-|h-|min-|max-|flex|grid|gap-|rounded|border|shadow|opacity-|font-|leading-|tracking-|items-|justify-|self-|col-|row-|space-|divide-|ring-|transition|duration-|ease-|overflow-|z-|absolute|relative|fixed|sticky|hidden|block|inline|table|sm:|md:|lg:|xl:|2xl:|hover:|focus:|dark:|btn-|d-|container|card|modal|nav)/.test(cls);
  }

  /**
   * Fallback selector builder using tag + first class + nth-of-type path.
   */
  function _fallbackSelector(el, doc) {
    var parts = [];
    var cur = el;
    while (cur && cur !== doc.body) {
      var seg = cur.tagName.toLowerCase();
      if (cur.className && typeof cur.className === 'string') {
        var cls = cur.className.trim().split(/\s+/).find(function (c) { return c && !_isUtilityClass(c); });
        if (cls) {
          seg += '.' + CSS.escape(cls);
        }
      }
      var parent = cur.parentElement;
      if (parent) {
        var sibs = Array.from(parent.children).filter(function (c) {
          return c.tagName === cur.tagName;
        });
        if (sibs.length > 1) {
          seg += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
        }
      }
      parts.unshift(seg);
      cur = cur.parentElement;
    }
    return 'body > ' + parts.join(' > ');
  }

  return { generate: generate, generateAlternates: generateAlternates, generateRecommended: generateRecommended };
}());
