/**
 * undo-stack.js — Command pattern undo/redo stack
 *
 * Each command: { type, selector, property, oldValue, newValue, el (runtime ref) }
 * Commands are replayed by re-applying oldValue / newValue to matched elements.
 */
'use strict';

window.UndoStack = (function () {
  const MAX_SIZE = 200;
  let _stack = [];   // { type, selector, property, oldValue, newValue }
  let _cursor = -1;  // points to last applied command

  // ── helpers ──────────────────────────────────────────────────────────────

  /**
   * Build a unique-ish CSS selector for an element within iframeDoc.
   * Falls back to position-based selectors when needed.
   */
  function selectorFor(el, iframeDoc) {
    return SelectorEngine.generate(el, iframeDoc);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function record(command) {
    // Discard any redo history above cursor
    if (_cursor < _stack.length - 1) {
      _stack = _stack.slice(0, _cursor + 1);
    }
    _stack.push(command);
    if (_stack.length > MAX_SIZE) _stack.shift();
    _cursor = _stack.length - 1;
    _notifyChange();
  }

  function canUndo() { return _cursor >= 0; }
  function canRedo() { return _cursor < _stack.length - 1; }
  function size()    { return _cursor + 1; }

  function undo(iframeDoc) {
    if (!canUndo()) return;
    const cmd = _stack[_cursor];
    _applyCommand(cmd, 'old', iframeDoc);
    _cursor--;
    _notifyChange();
  }

  function redo(iframeDoc) {
    if (!canRedo()) return;
    _cursor++;
    const cmd = _stack[_cursor];
    _applyCommand(cmd, 'new', iframeDoc);
    _notifyChange();
  }

  function clear() {
    _stack = [];
    _cursor = -1;
    _notifyChange();
  }

  /**
   * Build a command object for recording (caller should call record() with it).
   * Captures oldValue from the live element.
   */
  function capture(el, type, property, newValue, iframeDoc) {
    let oldValue;
    if (type === 'style') {
      oldValue = el.style.cssText;
    } else if (type === 'attribute') {
      oldValue = el.getAttribute(property);
    } else if (type === 'text') {
      oldValue = el.textContent;
    } else if (type === 'innerHTML') {
      oldValue = el.innerHTML;
    } else if (type === 'remove') {
      oldValue = { parent: el.parentElement, nextSibling: el.nextSibling, outerHTML: el.outerHTML };
    }
    return {
      type,
      selector: selectorFor(el, iframeDoc),
      property,
      oldValue,
      newValue,
    };
  }

  function _applyCommand(cmd, direction, iframeDoc) {
    // Handle batch
    if (cmd.type === '__batch__') {
      const cmds = direction === 'old' ? [...cmd.cmds].reverse() : cmd.cmds;
      cmds.forEach(c => _applyCommand(c, direction, iframeDoc));
      return;
    }

    const value = direction === 'old' ? cmd.oldValue : cmd.newValue;

    if (cmd.type === 'remove') {
      if (direction === 'old') {
        // Restore removed element
        const { parent, nextSibling, outerHTML } = cmd.oldValue;
        if (parent && parent.ownerDocument) {
          const ownerDoc = parent.ownerDocument || iframeDoc;
          const tmp = ownerDoc.createElement('div');
          tmp.innerHTML = outerHTML;
          if (tmp.firstChild) {
            parent.insertBefore(tmp.firstChild, nextSibling);
          }
        }
      } else {
        // Re-remove
        const el = iframeDoc.querySelector(cmd.selector);
        if (el) el.remove();
      }
      return;
    }

    const el = iframeDoc.querySelector(cmd.selector);
    if (!el) return;

    if (cmd.type === 'style') {
      el.style.cssText = value || '';
    } else if (cmd.type === 'stateStyle') {
      // Pseudo-state edit: update the injected override stylesheet
      if (window.StateEditor) {
        StateEditor.setOverride(cmd.selector, cmd.pseudoState, cmd.property, value, iframeDoc);
      }
    } else if (cmd.type === 'attribute') {
      if (value == null) el.removeAttribute(cmd.property);
      else el.setAttribute(cmd.property, value);
    } else if (cmd.type === 'text') {
      el.textContent = value || '';
    } else if (cmd.type === 'innerHTML') {
      el.innerHTML = value || '';
    } else if (cmd.type === 'cssVariable') {
      // Modify CSS custom property on :root (documentElement)
      var root = iframeDoc.documentElement;
      if (value == null || value === '') {
        root.style.removeProperty(cmd.property);
      } else {
        root.style.setProperty(cmd.property, value);
      }
    }
  }

  // Change notification for UI buttons
  let _changeCallback = null;
  function onChange(fn) { _changeCallback = fn; }
  function _notifyChange() {
    if (_changeCallback) _changeCallback({ canUndo: canUndo(), canRedo: canRedo(), size: size() });
  }

  /**
   * Record multiple commands as a single atomic batch.
   * Undo/redo will replay all commands in the batch together.
   */
  function recordBatch(cmds) {
    if (!cmds || cmds.length === 0) return;
    if (cmds.length === 1) { record(cmds[0]); return; }
    // Wrap as a batch command
    const batch = { type: '__batch__', cmds };
    if (_cursor < _stack.length - 1) {
      _stack = _stack.slice(0, _cursor + 1);
    }
    _stack.push(batch);
    if (_stack.length > MAX_SIZE) _stack.shift();
    _cursor = _stack.length - 1;
    _notifyChange();
  }

  return { record, recordBatch, capture, canUndo, canRedo, size, undo, redo, clear, onChange };
}());
