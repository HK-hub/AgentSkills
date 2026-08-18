/**
 * state-editor.js — Pseudo-state editing for :hover, :active, :focus, :disabled
 *
 * Detects which pseudo-states have CSS rules for the selected element,
 * allows forcing a visual state (by injecting cloned rules with force classes),
 * and applies edits to an injected stylesheet instead of inline styles.
 *
 * Dependencies: SelectorEngine (selector.js)
 */
'use strict';

window.StateEditor = (function () {

  // ── State ──────────────────────────────────────────────────────────────────
  var _active = false;
  var _currentState = null;      // ':hover' | ':focus' | ':active' | ':disabled' | null
  var _currentEl = null;
  var _forceStyleEl = null;      // <style id="__pe-state-force__"> in iframe
  var _overrideStyleEl = null;   // <style id="__pe-state-overrides__"> in iframe
  var _overrides = {};           // { 'selector::state::property': value }
  var _forceClasses = [];        // classes added to elements (for cleanup)

  var SUPPORTED_STATES = [':hover', ':active', ':focus', ':focus-within', ':focus-visible', ':disabled', ':visited'];
  var STATE_REGEX = /:(?:hover|active|focus|focus-within|focus-visible|disabled|visited)/g;

  // ── Detection ─────────────────────────────────────────────────────────────

  /**
   * Detect which pseudo-states have CSS rules for this element.
   * @param {Element} el
   * @param {Document} iframeDoc
   * @returns {string[]} e.g. [':hover', ':focus']
   */
  function detectStates(el, iframeDoc) {
    if (!el || !iframeDoc) return [];
    var found = {};
    var sheets = iframeDoc.styleSheets;

    for (var i = 0; i < sheets.length; i++) {
      var rules;
      try { rules = sheets[i].cssRules || sheets[i].rules; } catch (e) { continue; }
      if (!rules) continue;

      for (var j = 0; j < rules.length; j++) {
        var rule = rules[j];
        if (rule.type !== 1) continue; // CSSStyleRule only
        var sel = rule.selectorText;
        if (!sel) continue;

        // Check if selector contains a pseudo-state
        var pseudoMatches = sel.match(STATE_REGEX);
        if (!pseudoMatches) continue;

        // Strip pseudo-states to get base selector
        var baseSel = sel.replace(STATE_REGEX, '').trim();
        if (!baseSel) baseSel = '*'; // edge case: `:hover` alone

        // Check if the element (or its ancestors) matches the base selector
        try {
          if (el.matches(baseSel)) {
            pseudoMatches.forEach(function (p) { found[p] = true; });
          }
          // Also check if pseudo is on an ancestor (e.g. .card:hover .title)
          // The base selector may target a parent
          var parent = el.parentElement;
          while (parent && parent !== iframeDoc.body) {
            try {
              if (parent.matches(baseSel)) {
                pseudoMatches.forEach(function (p) { found[p] = true; });
              }
            } catch (e2) {}
            parent = parent.parentElement;
          }
        } catch (e) { /* invalid selector */ }
      }
    }

    // Also detect Tailwind hover:/focus: classes
    if (el.className && typeof el.className === 'string') {
      var classes = el.className.split(/\s+/);
      for (var k = 0; k < classes.length; k++) {
        if (/^hover:/.test(classes[k])) found[':hover'] = true;
        if (/^focus:/.test(classes[k])) found[':focus'] = true;
        if (/^active:/.test(classes[k])) found[':active'] = true;
        if (/^disabled:/.test(classes[k])) found[':disabled'] = true;
      }
    }

    return Object.keys(found).sort();
  }

  // ── Activation ────────────────────────────────────────────────────────────

  /**
   * Activate a pseudo-state on the element.
   * Clones matching rules into a force-class variant and applies it.
   */
  function activateState(el, state, iframeDoc) {
    if (!el || !state) return;
    deactivateState(iframeDoc); // clean up any previous state

    _active = true;
    _currentState = state;
    _currentEl = el;

    var forceClass = '__pe-force' + state.replace(/:/g, '-'); // __pe-force-hover
    var win = iframeDoc.defaultView;

    // Ensure force style element exists
    _forceStyleEl = iframeDoc.getElementById('__pe-state-force__');
    if (!_forceStyleEl) {
      _forceStyleEl = iframeDoc.createElement('style');
      _forceStyleEl.id = '__pe-state-force__';
      iframeDoc.head.appendChild(_forceStyleEl);
    }

    // Ensure override style element exists
    _overrideStyleEl = iframeDoc.getElementById('__pe-state-overrides__');
    if (!_overrideStyleEl) {
      _overrideStyleEl = iframeDoc.createElement('style');
      _overrideStyleEl.id = '__pe-state-overrides__';
      iframeDoc.head.appendChild(_overrideStyleEl);
    }

    // Find all matching rules with this pseudo-state
    var cssText = '';
    var sheets = iframeDoc.styleSheets;
    for (var i = 0; i < sheets.length; i++) {
      var rules;
      try { rules = sheets[i].cssRules; } catch (e) { continue; }
      if (!rules) continue;

      for (var j = 0; j < rules.length; j++) {
        var rule = rules[j];
        if (rule.type !== 1) continue;
        var sel = rule.selectorText;
        if (!sel || sel.indexOf(state) === -1) continue;

        // Check if this rule targets our element
        var baseSel = sel.replace(STATE_REGEX, '').trim();
        if (!baseSel) baseSel = '*';
        var matches = false;
        try {
          matches = el.matches(baseSel);
          // Check ancestors
          if (!matches) {
            var p = el.parentElement;
            while (p && p !== iframeDoc.body) {
              try {
                if (p.matches(baseSel)) { matches = true; break; }
              } catch (e2) {}
              p = p.parentElement;
            }
          }
        } catch (e) {}

        if (matches) {
          // Clone the rule, replacing pseudo-state with force class
          var newSel = sel.replace(new RegExp(state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '.' + forceClass);
          cssText += newSel + ' { ' + rule.style.cssText + ' transition: none !important; }\n';
        }
      }
    }

    // Inject the force rules
    _forceStyleEl.textContent = cssText;

    // Apply the force class
    // Determine if the pseudo-state is on the element itself or an ancestor
    el.classList.add(forceClass);
    _forceClasses.push({ el: el, cls: forceClass });

    // Also check if we need to add force class to ancestors
    var ancestorParent = el.parentElement;
    while (ancestorParent && ancestorParent !== iframeDoc.body) {
      ancestorParent.classList.add(forceClass);
      _forceClasses.push({ el: ancestorParent, cls: forceClass });
      ancestorParent = ancestorParent.parentElement;
    }

    // Re-inject any persisted overrides for this element+state
    _rebuildOverrides(iframeDoc);
  }

  /**
   * Deactivate the current pseudo-state.
   * Removes visual force classes/styles but PRESERVES overrides for persistence.
   */
  function deactivateState(iframeDoc) {
    // Remove force classes
    _forceClasses.forEach(function (item) {
      try { item.el.classList.remove(item.cls); } catch (e) {}
    });
    _forceClasses = [];

    // Clear force styles (the cloned pseudo-state rules)
    if (_forceStyleEl) _forceStyleEl.textContent = '';

    // Clear override styles visually (they'll be re-injected on next activateState)
    if (_overrideStyleEl) _overrideStyleEl.textContent = '';

    _active = false;
    _currentState = null;
    _currentEl = null;
    // NOTE: _overrides is NOT cleared — it persists across activate/deactivate cycles
    // This ensures pseudo-state edits survive panel close/reopen
  }

  // ── Editing ───────────────────────────────────────────────────────────────

  /**
   * Apply a property change in pseudo-state mode.
   * Writes to the injected override stylesheet, not inline style.
   * @returns {{ oldValue: string }} for undo tracking
   */
  function applyStateProp(el, state, property, value, iframeDoc) {
    var selector = SelectorEngine.generate(el, iframeDoc);
    var forceClass = '__pe-force' + state.replace(/:/g, '-');
    var overrideKey = selector + '::' + state + '::' + property;

    var oldValue = _overrides[overrideKey] || _getOriginalPseudoValue(el, state, property, iframeDoc) || '';
    _overrides[overrideKey] = value;

    // Rebuild override stylesheet
    _rebuildOverrides(iframeDoc);

    return { oldValue: oldValue };
  }

  /**
   * Set a specific override (used by undo/redo).
   */
  function setOverride(selector, state, property, value, iframeDoc) {
    var overrideKey = selector + '::' + state + '::' + property;
    if (value === null || value === undefined) {
      delete _overrides[overrideKey];
    } else {
      _overrides[overrideKey] = value;
    }
    _rebuildOverrides(iframeDoc);
  }

  /**
   * Get all pending overrides as change records for saving.
   */
  function getOverrideChanges(iframeDoc) {
    var changes = [];
    var keys = Object.keys(_overrides);
    if (keys.length > 0) {
      console.log('[StateEditor] getOverrideChanges: _overrides has', keys.length, 'entries:', keys);
    }
    for (var key in _overrides) {
      if (!_overrides.hasOwnProperty(key)) continue;
      var parts = key.split('::');
      var selector = parts[0];
      var state = parts[1];
      var property = parts[2];
      var value = _overrides[key];

      // Look up original value from the element in DOM (not relying on _currentEl)
      var original = '';
      try {
        var el = iframeDoc.querySelector(selector);
        if (el) {
          original = _getOriginalPseudoValue(el, state, property, iframeDoc) || '';
        } else {
          console.warn('[StateEditor] getOverrideChanges: element not found for selector:', selector);
        }
      } catch (e) {
        console.warn('[StateEditor] getOverrideChanges: error querying selector:', selector, e);
      }

      console.log('[StateEditor] override:', property, 'value:', JSON.stringify(value), 'original:', JSON.stringify(original));

      // Skip if value unchanged from original
      if (value === original) {
        console.log('[StateEditor] skipping (value === original)');
        continue;
      }

      // Detect "removed" — value is transparent/none/empty while original was set
      var isRemoval = !!(original) && (
        value === 'transparent' || value === 'none' || value === '' || value === 'initial'
      );

      changes.push({
        selector: selector,
        property: property,
        oldValue: original,
        value: isRemoval ? null : value,
        type: 'style',
        source: isRemoval ? 'removed' : 'pseudo-state-edit',
        pseudoState: state,
      });
    }
    console.log('[StateEditor] getOverrideChanges returning', changes.length, 'changes');
    return changes;
  }

  function _rebuildOverrides(iframeDoc) {
    if (!_overrideStyleEl) return;
    var css = '';
    // Group overrides by selector+state
    var groups = {};
    for (var key in _overrides) {
      if (!_overrides.hasOwnProperty(key)) continue;
      var parts = key.split('::');
      var selector = parts[0];
      var state = parts[1];
      var property = parts[2];
      var value = _overrides[key];
      var groupKey = selector + '::' + state;
      if (!groups[groupKey]) groups[groupKey] = { selector: selector, state: state, props: {} };
      groups[groupKey].props[property] = value;
    }

    for (var gk in groups) {
      var g = groups[gk];
      // Use the state from the override key to build the force class
      var stateForceClass = '__pe-force' + g.state.replace(/:/g, '-');
      var ruleSel = g.selector + '.' + stateForceClass;
      var declarations = '';
      for (var p in g.props) {
        var kebab = p.replace(/([A-Z])/g, '-$1').toLowerCase();
        declarations += kebab + ': ' + g.props[p] + ' !important; ';
      }
      css += ruleSel + ' { ' + declarations + '}\n';
    }

    _overrideStyleEl.textContent = css;
  }

  /**
   * Get the original value of a property in a pseudo-state (from the original stylesheet).
   */
  function _getOriginalPseudoValue(el, state, property, iframeDoc) {
    var kebab = property.replace(/([A-Z])/g, '-$1').toLowerCase();
    var sheets = iframeDoc.styleSheets;
    var best = null;

    for (var i = 0; i < sheets.length; i++) {
      var rules;
      try { rules = sheets[i].cssRules; } catch (e) { continue; }
      if (!rules) continue;

      for (var j = 0; j < rules.length; j++) {
        var rule = rules[j];
        if (rule.type !== 1) continue;
        var sel = rule.selectorText;
        if (!sel || sel.indexOf(state) === -1) continue;

        var baseSel = sel.replace(STATE_REGEX, '').trim();
        if (!baseSel) baseSel = '*';
        var matches = false;
        try {
          matches = el.matches(baseSel);
          // Also check ancestors (for selectors like .card:hover .title)
          if (!matches) {
            var parent = el.parentElement;
            while (parent && parent !== iframeDoc.body) {
              try { if (parent.matches(baseSel)) { matches = true; break; } } catch (e2) {}
              parent = parent.parentElement;
            }
          }
        } catch (e) {}

        if (matches) {
          var val = rule.style.getPropertyValue(kebab);
          if (val) best = val.trim();
        }
      }
    }
    return best;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function isActive() { return _active; }
  function currentState() { return _currentState; }
  function currentEl() { return _currentEl; }

  /** Clear all overrides (call after successful save to start fresh) */
  function reset(iframeDoc) {
    deactivateState(iframeDoc);
    _overrides = {};
  }

  return {
    detectStates: detectStates,
    activateState: activateState,
    deactivateState: deactivateState,
    applyStateProp: applyStateProp,
    setOverride: setOverride,
    getOverrideChanges: getOverrideChanges,
    isActive: isActive,
    currentState: currentState,
    currentEl: currentEl,
    reset: reset,
  };
}());
