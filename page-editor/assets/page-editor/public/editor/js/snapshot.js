/**
 * snapshot.js — DOM snapshot diff for accurate change detection
 *
 * Captures the initial state of all elements when entering edit mode,
 * then diffs against the current DOM state at save time.
 *
 * Key design decisions:
 *  - Uses WeakMap<Element, Data> — keyed on element references, NOT selectors.
 *    This avoids the selector-drift problem where the same element gets
 *    different selectors after DOM mutations.
 *  - Selectors are generated only at diff output time (on the final DOM state).
 *  - Snapshot persists across edit-mode toggles; only cleared after successful save.
 *  - Structural changes (delete, reorder) are supplemented from EditorCore._changes[].
 *
 * Dependencies: SelectorEngine (selector.js)
 */
'use strict';

window.Snapshot = (function () {

  // ── State ──────────────────────────────────────────────────────────────────
  var _initialByRef = null;   // WeakMap<Element, SnapshotData>
  var _initialElements = null; // Set<Element> — for deletion detection
  // ── Editor UI Property Filter ──────────────────────────────────────────────
  // Properties injected by the editor for selection/hover feedback only.
  // These should NOT be reported even on user-modified elements.
  var EDITOR_UI_PROPERTIES = new Set([
    'cursor',
  ]);

  // ── Editor UI Element Filter ───────────────────────────────────────────────
  // ID or class patterns that belong to the editor UI
  var EDITOR_UI_PATTERNS = [
    /__page-editor/,      // Any editor-injected element
    /^__pe-/,             // Editor UI prefix variations
  ];


  // CSS properties that are inherited (only check parent-match for these)
  var INHERITED_PROPS = new Set([
    'color', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
    'lineHeight', 'letterSpacing', 'textAlign', 'textTransform',
    'textDecoration', 'visibility', 'cursor', 'direction', 'wordSpacing',
  ]);

  // ── Capture ────────────────────────────────────────────────────────────────

  /**
   * Capture initial state of all elements in the iframe.
   * Called on enterEditMode(). Does NOT overwrite if a snapshot already exists
   * (supports enter/exit/re-enter without losing baseline).
   */
  function capture(iframeDoc) {
    if (_initialByRef) return; // already captured — don't overwrite
    _initialByRef = new WeakMap();
    _initialElements = new Set();

    var walker = iframeDoc.createTreeWalker(
      iframeDoc.body, NodeFilter.SHOW_ELEMENT
    );
    var node;
    while (node = walker.nextNode()) {
      if (_shouldSkip(node)) continue;
      _initialElements.add(node);
      _initialByRef.set(node, {
        inlineStyles: node.style.cssText,
        textContent: _getDirectText(node),
        tagName: node.tagName.toLowerCase(),
        src: node.tagName === 'IMG' ? (node.getAttribute('src') || '') : null,
        childOrder: _getChildOrder(node),
      });
    }
  }

  // ── Diff ───────────────────────────────────────────────────────────────────

  /**
   * Diff current DOM state against initial snapshot.
   * Returns an array of property-level changes with context metadata.
   * Structural changes (delete/reorder) from _changes[] should be merged by caller.
   */
  function diff(iframeDoc) {
    if (!_initialByRef) return [];
    var changes = [];
    var visited = new Set();
    var _diffStart = Date.now();
    var _nodeCount = 0;

    var walker = iframeDoc.createTreeWalker(
      iframeDoc.body, NodeFilter.SHOW_ELEMENT
    );
    var node;
    while (node = walker.nextNode()) {
      if (_shouldSkip(node)) continue;
      visited.add(node);
      _nodeCount++;

      // Safety: abort if taking too long (>3s)
      if (_nodeCount % 50 === 0 && (Date.now() - _diffStart) > 3000) {
        console.warn('[Snapshot.diff] Aborted after ' + _nodeCount + ' nodes (' + (Date.now() - _diffStart) + 'ms). Returning partial results.');
        break;
      }

      var initial = _initialByRef.get(node);
      if (!initial) continue; // new element (e.g. dynamically inserted video)

      // ── Filter: only process elements the user actually modified ──
      // Target page scripts may modify inline styles after snapshot capture,
      // causing false positives. EditorCore tracks which elements were touched
      // by user actions — skip elements not in that set for style changes.
      var isUserModified = window.EditorCore && EditorCore.isModifiedByUser && EditorCore.isModifiedByUser(node);

      var win = node.ownerDocument.defaultView;

      // ── Quick check: has anything changed? ──
      // Compare inline styles + text + src + child order BEFORE expensive selector generation
      var oldStyles = _parseStyles(initial.inlineStyles);
      var newStyles = _parseStyles(node.style.cssText);
      var oldText = initial.textContent;
      var newText = _getDirectText(node);
      var oldSrc = initial.src || '';
      var newSrc = node.tagName === 'IMG' ? (node.getAttribute('src') || '') : oldSrc;
      var oldOrder = initial.childOrder;
      var newOrder = _getChildOrder(node);

      var hasStyleChange = false;
      var allProps = _unionKeys(oldStyles, newStyles);
      for (var i = 0; i < allProps.length; i++) {
        if ((oldStyles[allProps[i]] || '') !== (newStyles[allProps[i]] || '')) {
          hasStyleChange = true;
          break;
        }
      }
      var hasTextChange = oldText !== newText;
      var hasSrcChange = node.tagName === 'IMG' && oldSrc !== newSrc;
      var hasOrderChange = oldOrder && newOrder && oldOrder.length > 0 &&
        (oldOrder.length !== newOrder.length || oldOrder.some(function (tag, idx) { return tag !== newOrder[idx]; }));

      // Skip expensive operations if nothing changed on this element
      if (!hasStyleChange && !hasTextChange && !hasSrcChange && !hasOrderChange) continue;

      // For style changes, only report elements actually modified by user actions.
      // This filters out noise from target page scripts modifying inline styles.
      if (hasStyleChange && !isUserModified) {
        hasStyleChange = false;
        if (!hasTextChange && !hasSrcChange && !hasOrderChange) continue;
      }

      // ── Only now generate selector (expensive) ──
      var selector = SelectorEngine.generate(node, iframeDoc);
      var alternates = SelectorEngine.generateAlternates ? SelectorEngine.generateAlternates(node, iframeDoc) : [];

      // ── Emit style changes ──
      if (hasStyleChange) {
        for (var si = 0; si < allProps.length; si++) {
          var prop = allProps[si];
          // Skip editor UI properties (outline, z-index, etc.)
          if (EDITOR_UI_PROPERTIES.has(prop)) {
            continue;
          }
          var oldVal = oldStyles[prop] || '';
          var newVal = newStyles[prop] || '';
          if (oldVal !== newVal) {
            var camelProp = _kebabToCamel(prop);
            var ctx = _buildContext(node, camelProp, win);

            if (ctx.cssFramework && ctx.cssFramework.name === 'tailwind') {
              var twHint = _generateTailwindHint(camelProp, oldVal, newVal, ctx.classList);
              if (twHint) ctx.tailwindHint = twHint;
            }

            changes.push({
              selector: selector,
              alternateSelectors: alternates.length ? alternates : undefined,
              property: camelProp,
              oldValue: oldVal || null,
              value: newVal || null,
              type: 'style',
              source: oldVal ? 'modified' : 'added',
              context: ctx,
            });
          }
        }
      }

      // ── Emit text change ──
      if (hasTextChange) {
        changes.push({
          selector: selector,
          alternateSelectors: alternates.length ? alternates : undefined,
          property: 'textContent',
          oldValue: oldText,
          value: newText,
          type: 'text',
          source: 'modified',
          context: _buildContext(node, null, win),
        });
      }

      // ── Emit img src change ──
      if (hasSrcChange) {
        changes.push({
          selector: selector,
          alternateSelectors: alternates.length ? alternates : undefined,
          property: 'src',
          oldValue: oldSrc,
          value: newSrc,
          type: 'attribute',
          source: 'modified',
          context: _buildContext(node, null, win),
        });
      }

      // ── Emit child order change ──
      if (hasOrderChange) {
        changes.push({
          selector: selector,
          alternateSelectors: alternates.length ? alternates : undefined,
          property: '__reorder__',
          oldValue: oldOrder.join(','),
          value: newOrder.join(','),
          type: 'reorder',
          source: 'modified',
          context: _buildContext(node, null, win),
        });
      }
    }

    // ── Detect deleted elements ──
    _initialElements.forEach(function (el) {
      if (!visited.has(el) && !el.isConnected) {
        var data = _initialByRef.get(el);
        changes.push({
          selector: null,
          property: '__delete__',
          oldValue: data ? data.tagName : 'unknown',
          value: null,
          type: 'delete',
          source: 'removed',
          context: { tag: data ? data.tagName : 'unknown' },
        });
      }
    });

    // ── Append CSS variable changes (verify against live DOM) ──
    var varNames = Object.keys(_cssVarChanges);
    for (var vi = 0; vi < varNames.length; vi++) {
      var vn = varNames[vi];
      var vc = _cssVarChanges[vn];
      // Verify: check current resolved value against the recorded newValue
      // If undo has reverted the change, the current value will match oldValue
      var currentVal = '';
      try {
        var win = iframeDoc.defaultView;
        currentVal = win.getComputedStyle(iframeDoc.documentElement).getPropertyValue(vn).trim();
      } catch(e) {}
      // Normalize both to uppercase hex for comparison
      var normCurrent = currentVal.toUpperCase();
      var normOld = (vc.oldValue || '').toUpperCase();
      // Skip if current matches old (change was undone)
      if (normCurrent === normOld) continue;
      changes.push({
        selector: vc.definedIn || ':root',
        property: vn,
        oldValue: vc.oldValue,
        value: currentVal || vc.newValue,
        type: 'cssVariable',
        source: 'modified',
        context: {
          tag: 'html',
          definedIn: vc.definedIn || ':root',
          file: vc.file || null,
        },
      });
    }

    return changes;
  }

  // ── Context builder ────────────────────────────────────────────────────────

  function _buildContext(el, property, win) {
    var ctx = {};
    ctx.tag = el.tagName.toLowerCase();

    // Full class list (valuable for Tailwind/utility-first frameworks)
    if (el.className && typeof el.className === 'string' && el.className.trim()) {
      ctx.classList = el.className.trim().split(/\s+/);
    }
    if (el.id) ctx.id = el.id;

    // All data-* attributes (framework markers: data-testid, data-component, data-v-xxx, etc.)
    var dataAttrs = {};
    var attrs = el.attributes;
    for (var i = 0; i < attrs.length; i++) {
      var name = attrs[i].name;
      if (name.startsWith('data-') && !name.startsWith('data-edit-') && !name.startsWith('data-pe')) {
        dataAttrs[name] = attrs[i].value;
      }
    }
    if (Object.keys(dataAttrs).length > 0) ctx.dataAttributes = dataAttrs;

    // Semantic role
    var role = el.getAttribute('role');
    if (role) {
      ctx.role = role;
    } else {
      var semanticMap = {
        h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
        p: 'paragraph', a: 'link', button: 'button', img: 'image', nav: 'navigation',
        header: 'banner', footer: 'contentinfo', main: 'main', aside: 'complementary',
        ul: 'list', ol: 'list', li: 'listitem', table: 'table',
      };
      if (semanticMap[ctx.tag]) ctx.role = semanticMap[ctx.tag];
    }

    // Parent context
    var parent = el.parentElement;
    if (parent && parent !== el.ownerDocument.body) {
      ctx.parentTag = parent.tagName.toLowerCase();
      if (parent.id) ctx.parentId = parent.id;
      if (parent.className && typeof parent.className === 'string') {
        var parentCls = parent.className.trim().split(/\s+/).filter(Boolean);
        if (parentCls.length) ctx.parentClassList = parentCls;
      }
      try {
        var pcs = win.getComputedStyle(parent);
        ctx.parentDisplay = pcs.display;
      } catch (e) { /* ignore */ }

      // Child position info (for AI to disambiguate same-class siblings)
      var children = Array.from(parent.children);
      ctx.childIndex = children.indexOf(el);
      ctx.siblingCount = children.length;

      // Parent selector (for building .parent > tag:nth-child(n))
      if (window.SelectorEngine) {
        try {
          ctx.parentSelector = window.SelectorEngine.generate(parent, el.ownerDocument);
        } catch (e) {}
      }
    }

    // Recommended selector — always precise, safe for AI to use directly
    if (window.SelectorEngine && window.SelectorEngine.generateRecommended) {
      try {
        ctx.recommendedSelector = window.SelectorEngine.generateRecommended(el, el.ownerDocument);
      } catch (e) {}
    }

    // Style origin diagnosis (only for style properties)
    if (property && property !== 'textContent') {
      ctx.styleOrigin = _detectStyleOrigin(el, property, win);
      // Find matching CSS rule for this property (helps AI locate where to edit)
      var ruleInfo = _findMatchingRule(el, property, win);
      if (ruleInfo) ctx.matchedRule = ruleInfo;

      // Detect CSS variable usage for this property
      var varInfo = _detectCSSVariables(el, property, win);
      if (varInfo) ctx.cssVariable = varInfo;
    }

    // Detect utility-first CSS framework (Tailwind, etc.)
    if (ctx.classList && ctx.classList.length >= 3) {
      var framework = _detectCSSFramework(ctx.classList);
      if (framework) ctx.cssFramework = framework;
    }

    // Pseudo-state context (if editing in :hover/:focus/etc mode)
    if (typeof window !== 'undefined' && window.StateEditor && window.StateEditor.isActive()) {
      ctx.pseudoState = window.StateEditor.currentState();
    }

    return ctx;
  }

  /** Find the CSS rule that defines a property for this element */
  function _findMatchingRule(el, property, win) {
    try {
      var doc = el.ownerDocument;
      var kebabProp = property.replace(/([A-Z])/g, '-$1').toLowerCase();
      var sheets = doc.styleSheets;
      var bestRule = null;

      for (var i = 0; i < sheets.length; i++) {
        var sheet = sheets[i];
        var rules;
        try { rules = sheet.cssRules || sheet.rules; } catch (e) { continue; }
        if (!rules) continue;

        for (var j = 0; j < rules.length; j++) {
          var rule = rules[j];
          if (rule.type !== 1) continue; // CSSStyleRule only
          try {
            if (!el.matches(rule.selectorText)) continue;
          } catch (e) { continue; }

          var val = rule.style.getPropertyValue(kebabProp);
          if (val) {
            // Determine source file
            var source = '<style>';
            if (sheet.href) {
              var url = sheet.href;
              var lastSlash = url.lastIndexOf('/');
              source = lastSlash >= 0 ? url.substring(lastSlash + 1) : url;
            }
            bestRule = {
              selector: rule.selectorText,
              file: source,
              value: val.trim(),
              fullRuleText: rule.cssText,
            };
            // Don't break — later rules have higher specificity, keep last match
          }
        }
      }
      return bestRule;
    } catch (e) {
      return null;
    }
  }

  /** Detect if a CSS property's value comes from a CSS variable (custom property) */
  function _detectCSSVariables(el, property, win) {
    try {
      var doc = el.ownerDocument;
      var kebabProp = property.replace(/([A-Z])/g, '-$1').toLowerCase();
      var sheets = doc.styleSheets;
      var varMatch = null;

      // 1. Find the matching rule that uses var(--xxx) for this property
      for (var i = 0; i < sheets.length; i++) {
        var sheet = sheets[i];
        var rules;
        try { rules = sheet.cssRules || sheet.rules; } catch (e) { continue; }
        if (!rules) continue;

        for (var j = 0; j < rules.length; j++) {
          var rule = rules[j];
          if (rule.type !== 1) continue;
          try { if (!el.matches(rule.selectorText)) continue; } catch (e) { continue; }

          // Get the raw value (not computed) — this preserves var() expressions
          var rawVal = rule.style.getPropertyValue(kebabProp);
          if (!rawVal) continue;

          // Check for var(--xxx) pattern — only capture the variable name
          // Avoids issues with nested var() or complex fallbacks
          var varRegex = /var\(\s*(--[a-zA-Z0-9_-]+)/;
          var m = rawVal.match(varRegex);
          if (m) {
            var varName = m[1];
            // Extract fallback by finding content after first comma (simplified)
            var fallback = null;
            var commaIdx = rawVal.indexOf(',', rawVal.indexOf(varName) + varName.length);
            if (commaIdx !== -1) {
              // Get everything between the comma and the matching closing paren
              var rest = rawVal.substring(commaIdx + 1);
              var depth = 1;
              var end = -1;
              for (var fi = 0; fi < rest.length; fi++) {
                if (rest[fi] === '(') depth++;
                else if (rest[fi] === ')') { depth--; if (depth === 0) { end = fi; break; } }
              }
              if (end > 0) fallback = rest.substring(0, end).trim();
            }
            varMatch = {
              name: varName,
              rawExpression: rawVal.trim(),
              fallback: fallback,
              ruleSelector: rule.selectorText,
            };
            // Keep last match (higher specificity)
          }
        }
      }

      if (!varMatch) return null;

      // 2. Resolve the current computed value of the variable
      var computed = win.getComputedStyle(el);
      var resolvedValue = computed.getPropertyValue(varMatch.name);
      if (resolvedValue) resolvedValue = resolvedValue.trim();

      // 3. Find where the variable is defined (:root, body, or specific selector)
      var definition = _findVariableDefinition(doc, varMatch.name);

      return {
        name: varMatch.name,
        value: resolvedValue || null,
        rawExpression: varMatch.rawExpression,
        fallback: varMatch.fallback,
        definedIn: definition ? definition.selector : null,
        file: definition ? definition.file : null,
      };
    } catch (e) {
      return null;
    }
  }

  /** Find where a CSS custom property is defined */
  function _findVariableDefinition(doc, varName) {
    var sheets = doc.styleSheets;
    var bestDef = null;

    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      var rules;
      try { rules = sheet.cssRules || sheet.rules; } catch (e) { continue; }
      if (!rules) continue;

      for (var j = 0; j < rules.length; j++) {
        var rule = rules[j];
        if (rule.type !== 1) continue;
        var val = rule.style.getPropertyValue(varName);
        if (val) {
          var source = '<style>';
          if (sheet.href) {
            var url = sheet.href;
            var lastSlash = url.lastIndexOf('/');
            source = lastSlash >= 0 ? url.substring(lastSlash + 1) : url;
          }
          bestDef = {
            selector: rule.selectorText,
            file: source,
            value: val.trim(),
          };
          // Prefer :root definition over more specific selectors
          if (rule.selectorText === ':root' || rule.selectorText === 'html') break;
        }
      }
      if (bestDef && (bestDef.selector === ':root' || bestDef.selector === 'html')) break;
    }
    return bestDef;
  }

  /** Detect utility-first CSS frameworks from class names */
  function _detectCSSFramework(classList) {
    // Tailwind patterns
    var twPatterns = /^(text-|bg-|p-|px-|py-|pt-|pb-|pl-|pr-|m-|mx-|my-|mt-|mb-|ml-|mr-|w-|h-|min-w-|max-w-|flex|grid|gap-|rounded|border|shadow|opacity-|font-|leading-|tracking-|items-|justify-|self-|col-|row-|space-|divide-|ring-|transition|duration-|ease-|hover:|focus:|dark:|sm:|md:|lg:|xl:)/;
    var twCount = 0;
    for (var i = 0; i < classList.length; i++) {
      if (twPatterns.test(classList[i])) twCount++;
    }
    if (twCount >= 3) return { name: 'tailwind', confidence: twCount >= 5 ? 'high' : 'medium' };

    // Bootstrap patterns
    var bsPatterns = /^(btn|btn-|col-|row|container|card|modal|nav|navbar|badge|alert|form-|input-|d-|p-|m-|text-|bg-|border-|rounded|shadow|flex-|align-|justify-)/;
    var bsCount = 0;
    for (var j = 0; j < classList.length; j++) {
      if (bsPatterns.test(classList[j])) bsCount++;
    }
    if (bsCount >= 3) return { name: 'bootstrap', confidence: bsCount >= 5 ? 'high' : 'medium' };

    return null;
  }

  /** Generate Tailwind class replacement hint using TailwindMap lookup tables */
  function _generateTailwindHint(property, oldValue, newValue, classList) {
    // TailwindMap must be loaded (tailwind-map.js)
    if (typeof window.TailwindMap === 'undefined') return null;
    var TW = window.TailwindMap;

    // Check if this property has a Tailwind mapping
    if (!TW.PROPERTY_PREFIX[property]) return null;

    // Find the current Tailwind class for this property in the element's classList
    var currentClass = TW.findCurrentClass(property, classList || []);

    // Look up the suggested class for the new value
    var result = TW.lookup(property, newValue, classList);
    if (!result) return null;

    // Don't suggest if the suggested class is the same as current
    if (currentClass === result.className) return null;

    return {
      currentClass: currentClass || null,
      suggestedClass: result.className,
      action: currentClass ? 'replace' : 'add',
      confidence: result.confidence,
    };
  }

  function _detectStyleOrigin(el, property, win) {
    // If element has this property set inline, it's inline
    if (el.style[property]) return 'inline';

    try {
      var computed = win.getComputedStyle(el)[property];
      // Only check inheritance for actually-inheritable properties
      if (INHERITED_PROPS.has(property)) {
        var parent = el.parentElement;
        if (parent) {
          var parentComputed = win.getComputedStyle(parent)[property];
          if (computed === parentComputed) return 'inherited';
        }
      }
    } catch (e) { /* ignore */ }

    return 'stylesheet';
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function _isEditorUIElement(node) {
    // Check ID for editor patterns
    if (node.id) {
      for (var i = 0; i < EDITOR_UI_PATTERNS.length; i++) {
        if (EDITOR_UI_PATTERNS[i].test(node.id)) return true;
      }
    }
    // Check class for editor patterns
    if (node.className && typeof node.className === 'string') {
      for (var j = 0; j < EDITOR_UI_PATTERNS.length; j++) {
        if (EDITOR_UI_PATTERNS[j].test(node.className)) return true;
      }
    }
    return false;
  }

  function _shouldSkip(node) {
    // Skip editor UI elements and our injected style element
    return node.id === '__page-editor-style__' || _isEditorUIElement(node);
  }

  function _getDirectText(el) {
    var text = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) {
        text += el.childNodes[i].textContent;
      }
    }
    return text.trim().substring(0, 500);
  }

  function _getChildOrder(el) {
    if (el.children.length === 0) return null;
    var order = [];
    var max = Math.min(el.children.length, 20);
    for (var i = 0; i < max; i++) {
      order.push(el.children[i].tagName.toLowerCase());
    }
    return order;
  }

  function _parseStyles(cssText) {
    var result = {};
    if (!cssText) return result;
    // Use a temporary element to let the browser parse cssText correctly,
    // avoiding manual semicolon splitting that breaks on data URIs etc.
    var tempEl = document.createElement('div');
    tempEl.style.cssText = cssText;
    for (var i = 0; i < tempEl.style.length; i++) {
      var prop = tempEl.style[i]; // browser-normalized property name (kebab-case)
      var val = tempEl.style.getPropertyValue(prop);
      if (val) {
        // Strip !important — we track it separately
        result[prop] = val.replace(/\s*!important\s*$/i, '');
      }
    }
    return result;
  }

  function _kebabToCamel(str) {
    return str.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
  }

  function _unionKeys(a, b) {
    var set = {};
    var key;
    for (key in a) { if (a.hasOwnProperty(key)) set[key] = true; }
    for (key in b) { if (b.hasOwnProperty(key)) set[key] = true; }
    return Object.keys(set);
  }

  // ── CSS Variable change tracking ──────────────────────────────────────────

  /**
   * Map of CSS variable changes: varName → { oldValue, newValue, file, definedIn }
   * Populated by color-picker-panel when user edits tokens in the palette library.
   */
  var _cssVarChanges = {};

  /**
   * Record a CSS variable change for later inclusion in diff() output.
   * If the same variable is changed again, update the newValue (keep original oldValue).
   * If newValue reverts back to oldValue, remove the entry.
   */
  function recordCSSVarChange(varName, oldValue, newValue, context) {
    var existing = _cssVarChanges[varName];
    if (existing) {
      // Keep original old value, update new value
      existing.newValue = newValue;
      // If reverted to original, remove entry
      if (existing.oldValue === newValue) {
        delete _cssVarChanges[varName];
      }
    } else {
      _cssVarChanges[varName] = {
        oldValue: oldValue,
        newValue: newValue,
        file: (context && context.file) || null,
        definedIn: (context && context.definedIn) || ':root',
      };
    }
  }

  /** Remove a CSS variable change record (used when undoing) */
  function removeCSSVarChange(varName) {
    delete _cssVarChanges[varName];
  }

  /** Get current CSS variable changes (for change counter display) */
  function getCSSVarChanges() {
    return Object.assign({}, _cssVarChanges);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Reset snapshot after successful save (next edit starts from new baseline) */
  function reset() {
    _initialByRef = null;
    _initialElements = null;
    _cssVarChanges = {};
  }

  /** Remove an element from tracking (used when a deleted element is restored) */
  function removeFromTracking(el) {
    if (_initialElements) _initialElements.delete(el);
  }

  /** Re-snapshot an element's current state as its new baseline (used after revert) */
  function resnapshot(el) {
    if (!_initialByRef) return;
    _initialByRef.set(el, {
      inlineStyles: el.style.cssText,
      textContent: _getDirectText(el),
      tagName: el.tagName.toLowerCase(),
      src: el.tagName === 'IMG' ? (el.getAttribute('src') || '') : null,
      childOrder: _getChildOrder(el),
    });
  }

  /** Check if a snapshot exists */
  function hasSnapshot() {
    return !!_initialByRef;
  }

  /**
   * Lightweight scan: returns array of { el, tag, label } for modified elements.
   * No selector generation, no context — just refs + display info for UI.
   */
  function getModifiedElements(iframeDoc) {
    if (!_initialByRef) return [];
    var result = [];
    var walker = iframeDoc.createTreeWalker(iframeDoc.body, NodeFilter.SHOW_ELEMENT);
    var node;
    while (node = walker.nextNode()) {
      if (_shouldSkip(node)) continue;
      var initial = _initialByRef.get(node);
      if (!initial) continue;
      // Quick string comparison first, then parsed comparison for style
      var styleChanged = false;
      if (initial.inlineStyles !== node.style.cssText) {
        // Browser may normalize cssText — do property-level comparison
        var oldS = _parseStyles(initial.inlineStyles);
        var newS = _parseStyles(node.style.cssText);
        var allKeys = _unionKeys(oldS, newS);
        for (var ki = 0; ki < allKeys.length; ki++) {
          if ((oldS[allKeys[ki]] || '') !== (newS[allKeys[ki]] || '')) {
            styleChanged = true;
            break;
          }
        }
      }
      var textChanged = initial.textContent !== _getDirectText(node);
      var srcChanged = node.tagName === 'IMG' && initial.src !== (node.getAttribute('src') || '');
      // Filter style noise: only count style changes on user-modified elements
      if (styleChanged && !(window.EditorCore && EditorCore.isModifiedByUser && EditorCore.isModifiedByUser(node))) {
        styleChanged = false;
      }
      if (!styleChanged && !textChanged && !srcChanged) continue;
      var tag = node.tagName.toLowerCase();
      var label = '';
      if (node.id) label = '#' + node.id;
      else {
        var cls = (typeof node.className === 'string' ? node.className : '').split(/\s+/).filter(Boolean);
        var meaningful = cls.find(function(c) { return c.length > 2 && !/^(text-|bg-|p-|m-|flex|grid|w-|h-)/.test(c); });
        label = meaningful ? '.' + meaningful : (cls[0] ? '.' + cls[0] : '');
      }
      // Add text snippet to disambiguate elements with identical class
      var snippet = _getDirectText(node);
      if (snippet) {
        snippet = snippet.substring(0, 20);
        label = label ? label + ' "' + snippet + '"' : '"' + snippet + '"';
      }
      result.push({ el: node, tag: tag, label: label });
    }
    // Detect deleted elements (in initial snapshot but no longer in DOM)
    // Only report top-level deleted elements (skip children of deleted parents)
    if (_initialElements) {
      var deletedSet = new Set();
      _initialElements.forEach(function(origEl) {
        if (!iframeDoc.body.contains(origEl)) deletedSet.add(origEl);
      });
      deletedSet.forEach(function(origEl) {
        // Skip if any ancestor is also deleted (this is a child of a deleted parent)
        var ancestor = origEl.parentElement;
        var isChild = false;
        while (ancestor) {
          if (deletedSet.has(ancestor)) { isChild = true; break; }
          ancestor = ancestor.parentElement;
        }
        if (isChild) return;

        var initial = _initialByRef.get(origEl);
        if (!initial) return;
        var tag = initial.tagName || 'div';
        var label = '(已删除)';
        result.push({ el: origEl, tag: tag, label: label, deleted: true });
      });
    }
    return result;
  }

  /**
   * Get initial snapshot data for an element (for revert operations).
   */
  function getInitialState(el) {
    if (!_initialByRef) return null;
    return _initialByRef.get(el) || null;
  }

  return {
    capture: capture,
    diff: diff,
    reset: reset,
    hasSnapshot: hasSnapshot,
    getModifiedElements: getModifiedElements,
    getInitialState: getInitialState,
    removeFromTracking: removeFromTracking,
    resnapshot: resnapshot,
    recordCSSVarChange: recordCSSVarChange,
    removeCSSVarChange: removeCSSVarChange,
    getCSSVarChanges: getCSSVarChanges,
  };
}());
