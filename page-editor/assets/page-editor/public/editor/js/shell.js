/**
 * shell.js — Top-bar orchestration: wires up EditorCore + PropertiesPanel + UndoStack
 * and handles save (POST /api/save-edits).
 */
'use strict';

(function () {
  const iframe        = document.getElementById('target-frame');
  const btnToggle     = document.getElementById('btn-toggle');
  const btnUndo       = document.getElementById('btn-undo');
  const btnRedo       = document.getElementById('btn-redo');
  const btnSave       = document.getElementById('btn-save');
  const btnTheme      = document.getElementById('btn-theme');
  const btnCloseEditor = document.getElementById('btn-close-editor');
  const changeCounter = document.getElementById('change-counter');
  const changeList    = document.getElementById('change-list');
  const alignToolbar  = document.getElementById('align-toolbar');

  // ── Safety: remove initial loading overlay after max 20s ──────────────
  // Only removes pe-init-loading (initial boot spinner), NEVER touches
  // pe-wait-overlay (post-save waiting state) which lives until SSE reload.
  (function _safetyRemoveInitLoading() {
    var el = document.getElementById('pe-init-loading');
    if (!el) return;
    setTimeout(function () {
      var el2 = document.getElementById('pe-init-loading');
      if (el2) {
        el2.style.opacity = '0';
        setTimeout(function () { try { el2.remove(); } catch(e) {} }, 300);
      }
    }, 20000);
  })();

  // ── Source file auto-reload via SSE ─────────────────────────────────────
  // AI rewrites target file on disk → server detects change → pushes event
  // → browser reloads iframe and re-inits editor. User sees updated page instantly.
  //
  // Lifecycle:
  //   [User saves] → show blur wait overlay ("等待AI应用修改...")
  //   [SSE source-updated] → overlay text → "样式已更新，正在刷新..." → force reload iframe
  //   [iframe load] → fade out overlay → back to editable
  let _sourceEventSource = null;
  let _reloadScheduled = null;
  let _waitOverlay = null;       // The DOM element shown after save, removed after reload

  function _connectSourceEvents() {
    if (_sourceEventSource) return; // already connected

    try {
      _sourceEventSource = new EventSource('/api/source-events');

      _sourceEventSource.onmessage = function (event) {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'source-updated') {
            console.log('[source-watch] 收到源码更新通知，准备刷新预览...');

            // Debounce: coalesce rapid events into one reload
            if (_reloadScheduled) clearTimeout(_reloadScheduled);
            _reloadScheduled = setTimeout(() => {
              _reloadScheduled = null;
              _triggerReloadAfterAI();
            }, 400);
          }
        } catch (e) {}
      };

      _sourceEventSource.onerror = function () {
        console.warn('[source-event] SSE 连接断开，2秒后重连...');
        _sourceEventSource.close();
        _sourceEventSource = null;
        setTimeout(_connectSourceEvents, 2000);
      };
    } catch (e) {
      console.warn('[source-event] SSE 初始化失败:', e.message);
    }
  }

  /**
   * Full-screen wait overlay — covers entire page including topbar.
   * Shows logo + title + hint, matching the design reference.
   */
  function _showWaitOverlay() {
    _removeWaitOverlay();

    var hintHTML =
      '<div class="pe-wait__hint">' +
        '你可以回去 IDE 确认 AI 是否收到改动，如果没有可以告诉它 ' +
        '<strong>我保存好了</strong>' +
      '</div>';

    var el = document.createElement('div');
    el.id = 'pe-wait-overlay';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML =
      '<div class="pe-wait__logo">' +
        '<img class="pe-wait__logo-dark" src="/editor-assets/logo-dark.svg" width="64" height="64" alt="logo" />' +
        '<img class="pe-wait__logo-light" src="/editor-assets/logo-light.svg" width="64" height="64" alt="logo" />' +
      '</div>' +
      '<div class="pe-wait__text">正在等待 AI 修改代码...</div>' +
      hintHTML;

    document.body.appendChild(el);

    _waitOverlay = el;

    _waitOverlay = el;

    // Exit edit mode while waiting
    if (window.EditorCore && EditorCore.isEditing()) EditorCore.exitEditMode();

    return el;
  }

  function _removeWaitOverlay() {
    if (_waitOverlay) {
      try { _waitOverlay.remove(); } catch(e) {}
      _waitOverlay = null;
    }
  }

  function _triggerReloadAfterAI() {
    if (!iframe) return;

    // Update overlay text
    if (_waitOverlay) {
      var txtEl = _waitOverlay.querySelector('.pe-wait__text');
      var hintEl = _waitOverlay.querySelector('.pe-wait__hint');
      if (txtEl) txtEl.textContent = '样式已更新';
      if (hintEl) hintEl.textContent = '正在加载最新预览…';
    }

    // Force a hard reload: blank the iframe first to flush all cached sub-resources,
    // then navigate to the target with a fresh cache-busting param.
    var ts = Date.now();
    var currentSrc = iframe.src.split('?')[0];
    var freshUrl = currentSrc + '?_t=' + ts;

    // Step 1: blank the iframe to force browser to discard cached CSS/JS
    iframe.src = 'about:blank';

    // Step 2: after a tick, navigate to the fresh URL
    setTimeout(function () {
      iframe.src = freshUrl;

      iframe.addEventListener('load', function _onReloaded() {
        iframe.removeEventListener('load', _onReloaded);

        // Re-initialize editor modules with fresh iframe content
        try {
          EditorCore.init(iframe);
          PropertiesPanel.init();
          if (window.Guides) Guides.init(iframe);
          if (window.ResizeHandles) ResizeHandles.init(iframe);
          if (window.FlexOverlay) FlexOverlay.init(iframe);
          if (window.NumberScrubber) NumberScrubber.init();

        // Don't auto-enter edit mode — let user review the result first
        // and click "开始编辑" when ready.

        // Reset change tracking — this is a fresh page after AI edits
        if (window.Snapshot) Snapshot.reset();
        if (window.UndoStack) UndoStack.clear();
        _updateChangeCounter();
        } catch (e) {
          console.warn('[source-watch] Re-init after reload failed:', e);
        }

        // Fade out wait overlay
        if (_waitOverlay) {
          _waitOverlay.classList.add('pe-wait--fading');
          setTimeout(function () { _removeWaitOverlay(); }, 400);
        }

        // Reset save button label
        var saveLabel = document.querySelector('#btn-save span');
        if (saveLabel) saveLabel.textContent = '保存';

        console.log('[source-watch] iframe 已重新加载并初始化完成');
      }, { once: true });
    }, 50);
  }

  // Start SSE connection immediately (don't wait for iframe)
  _connectSourceEvents();

  const _moonIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
  const _sunIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';

  // ── Theme init (apply saved preference immediately) ───────────────────────
  (function _initTheme() {
    const saved = localStorage.getItem('pe-theme');
    if (saved === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      if (btnTheme) btnTheme.innerHTML = _sunIcon;
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (btnTheme) btnTheme.innerHTML = _moonIcon;
    }
  })();

  // ── Change Manager helpers ────────────────────────────────────────────────
  function _getDirectText(el) {
    var text = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) text += el.childNodes[i].textContent;
    }
    return text.trim().substring(0, 500);
  }

  let _counterTimer = null;
  function _updateChangeCounter() {
    if (_counterTimer) cancelAnimationFrame(_counterTimer);
    _counterTimer = requestAnimationFrame(_doUpdateChangeCounter);
  }
  function _doUpdateChangeCounter() {
    _counterTimer = null;
    var dotGray = '<span class="change-dot"></span>';
    var dotGreen = '<span class="change-dot change-dot--active"></span>';
    if (!window.Snapshot || !Snapshot.hasSnapshot()) {
      changeCounter.innerHTML = dotGray + '暂无修改记录';
      return;
    }
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    const modified = Snapshot.getModifiedElements(iframeDoc);
    // Count active CSS variable changes
    let varCount = 0;
    try {
      const varChanges = Snapshot.getCSSVarChanges();
      const win = iframe.contentWindow;
      const root = iframeDoc.documentElement;
      Object.keys(varChanges).forEach(vn => {
        const vc = varChanges[vn];
        const current = win.getComputedStyle(root).getPropertyValue(vn).trim().toUpperCase();
        if (current !== (vc.oldValue || '').toUpperCase()) varCount++;
      });
    } catch(e) {}
    const total = modified.length + varCount;
    const prevHTML = changeCounter.innerHTML;
    if (total > 0) {
      const parts = [];
      if (modified.length > 0) parts.push(`${modified.length} 个元素`);
      if (varCount > 0) parts.push(`${varCount} 个变量`);
      changeCounter.innerHTML = dotGreen + parts.join(' + ') + ' 已修改';
    } else {
      changeCounter.innerHTML = dotGray + '暂无修改记录';
    }
    // Bump animation when text changes (only for actual modifications)
    if (total > 0 && changeCounter.innerHTML !== prevHTML) {
      changeCounter.classList.remove('change-counter--bump');
      void changeCounter.offsetWidth; // force reflow
      changeCounter.classList.add('change-counter--bump');
    }
    // Don't auto-refresh flyout content — it destroys hover state on rows.
    // Flyout re-renders on next open via click.
  }

  function _renderChangeList(modified, varItems) {
    const container = changeList.querySelector('.change-list-items');
    container.innerHTML = '';
    varItems = varItems || [];
    if (modified.length === 0 && varItems.length === 0) {
      changeList.classList.remove('change-list--visible');
      return;
    }

    // ── CSS Variable change rows ──
    varItems.forEach(({ varName, oldValue, newValue }) => {
      const row = document.createElement('div');
      row.className = 'change-list-item';
      const tagSpan = document.createElement('span');
      tagSpan.className = 'change-list-item-tag';
      tagSpan.textContent = 'var';
      tagSpan.style.color = 'var(--pe-color-accent)';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'change-list-item-label';
      labelSpan.textContent = varName;
      // Color preview swatch
      const swatch = document.createElement('span');
      swatch.style.cssText = 'display:inline-block;width:12px;height:12px;border-radius:3px;flex-shrink:0;border:1px solid rgba(128,128,128,0.3);background:' + (newValue || '#000');
      const closeBtn = document.createElement('button');
      closeBtn.className = 'change-list-item-close';
      closeBtn.title = '恢复此变量';
      closeBtn.textContent = '✕';
      row.appendChild(tagSpan);
      row.appendChild(labelSpan);
      row.appendChild(swatch);
      row.appendChild(closeBtn);

      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        row.remove();
        if (container.children.length === 0) _hideChangeList();
        _revertCSSVariable(varName, oldValue);
      });
      container.appendChild(row);
    });

    // ── Element change rows ──
    modified.forEach(({ el, tag, label, deleted }) => {
      const row = document.createElement('div');
      row.className = 'change-list-item';
      const tagSpan = document.createElement('span');
      tagSpan.className = 'change-list-item-tag';
      tagSpan.textContent = tag;
      const labelSpan = document.createElement('span');
      labelSpan.className = 'change-list-item-label';
      labelSpan.textContent = label || '(无名称)';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'change-list-item-close';
      closeBtn.title = deleted ? '恢复已删除元素' : '恢复此元素';
      closeBtn.textContent = '✕';
      row.appendChild(tagSpan);
      row.appendChild(labelSpan);
      row.appendChild(closeBtn);

      if (!deleted && el) {
        row.addEventListener('mouseenter', () => {
          el.style.outline = '1px dashed rgba(0,156,255,0.5)';
          el.style.outlineOffset = '1px';
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        row.addEventListener('mouseleave', () => {
          el.style.outline = '';
          el.style.outlineOffset = '';
        });
      }

      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Remove this row immediately from the UI
        row.remove();
        // Check if list is now empty
        if (container.children.length === 0) _hideChangeList();
        // Execute the revert
        if (deleted) {
          _revertDeletedElement(el);
        } else {
          _revertElement(el);
        }
      });
      container.appendChild(row);
    });
  }

  function _revertElement(el) {
    if (!window.Snapshot) return;
    const initial = Snapshot.getInitialState(el);
    if (!initial) return;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

    // Always capture full state for undo, then restore everything
    const cmd = UndoStack.capture(el, 'style', 'cssText', null, iframeDoc);
    const oldInnerHTML = el.innerHTML;

    // Restore inline styles
    el.style.cssText = initial.inlineStyles || '';
    cmd.newValue = el.style.cssText;

    // Restore text content (only direct text nodes)
    const currentText = _getDirectText(el);
    if (currentText !== initial.textContent) {
      for (let i = el.childNodes.length - 1; i >= 0; i--) {
        if (el.childNodes[i].nodeType === 3) el.childNodes[i].remove();
      }
      if (initial.textContent) {
        el.insertBefore(iframeDoc.createTextNode(initial.textContent), el.firstChild);
      }
    }

    // Restore image src
    if (el.tagName === 'IMG' && initial.src !== (el.getAttribute('src') || '')) {
      el.setAttribute('src', initial.src || '');
    }

    // Record as single batch: style + innerHTML (covers text + src changes)
    const cmds = [cmd];
    if (el.innerHTML !== oldInnerHTML) {
      // Also record innerHTML change for undo
      cmds.push({
        type: 'innerHTML',
        selector: cmd.selector,
        property: 'innerHTML',
        oldValue: oldInnerHTML,
        newValue: el.innerHTML,
      });
    }
    UndoStack.recordBatch(cmds);

    _updateChangeCounter();
    if (EditorCore.getSelectedEl() === el) EditorCore.emit('deselect', null);
  }

  function _revertDeletedElement(origEl) {
    if (!origEl) return;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

    // Undo the delete operation via UndoStack
    try {
      UndoStack.undo(iframeDoc);
    } catch (e) { console.warn('[RevertDelete] undo failed:', e); }

    // Undo restores a NEW node (from outerHTML), not the original reference.
    // Remove origEl from snapshot tracking so it's no longer detected as deleted.
    if (Snapshot.removeFromTracking) Snapshot.removeFromTracking(origEl);

    _updateChangeCounter();
  }

  function _revertCSSVariable(varName, oldValue) {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    const root = iframeDoc.documentElement;
    const win = iframe.contentWindow;
    const currentValue = win.getComputedStyle(root).getPropertyValue(varName).trim();

    // Revert: remove the inline override (restores to stylesheet-defined value)
    root.style.removeProperty(varName);

    // Record undo so Ctrl+Z re-applies the change
    if (window.UndoStack) {
      UndoStack.record({
        type: 'cssVariable',
        selector: ':root',
        property: varName,
        oldValue: currentValue,
        newValue: oldValue,
      });
    }

    // Remove from Snapshot tracking
    if (window.Snapshot) Snapshot.removeCSSVarChange(varName);

    _updateChangeCounter();
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  // Track the original target URL so we can detect unwanted navigations
  let _expectedIframeSrc = null;

  iframe.addEventListener('load', () => {
    EditorCore.init(iframe);
    PropertiesPanel.init();
    if (window.Guides) Guides.init(iframe);
    if (window.ResizeHandles) ResizeHandles.init(iframe);
    if (window.FlexOverlay) FlexOverlay.init(iframe);
    if (window.NumberScrubber) NumberScrubber.init();
    _bindEvents();
    _bindAlignToolbar();
    _bindChangeList();

    // ── Navigation guard: prevent iframe from navigating away ──────
    // If user clicks a link or JS triggers navigation while not in edit mode,
    // it would destroy all pending edits. We intercept click events on <a> elements
    // at the document level inside the iframe to block navigation at all times.
    _installNavigationGuard();

    // Remember the initial iframe src for navigation recovery
    if (!_expectedIframeSrc) {
      _expectedIframeSrc = iframe.src;
    }

    // ── Remove initial loading overlay ───────────────────────
    var loadingEl = document.getElementById('pe-init-loading');
    if (loadingEl) {
      loadingEl.style.opacity = '0';
      setTimeout(function () { loadingEl.remove(); }, 300);
    }
  });

  /**
   * Install a persistent navigation guard inside the iframe.
   * This prevents link clicks, form submissions, and JS-triggered navigations
   * from destroying pending edits when not in edit mode.
   */
  function _installNavigationGuard() {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      const iframeWin = iframe.contentWindow;
      if (!iframeDoc || !iframeWin) return;

      // 1. Intercept all click events on <a> elements (capture phase)
      iframeDoc.addEventListener('click', function _navGuardClick(e) {
        // If EditorCore is in edit mode, its own blockHandler handles this
        if (EditorCore.isEditing()) return;

        // Walk up from target to find an <a> with href
        let node = e.target;
        while (node && node !== iframeDoc) {
          if (node.tagName === 'A' && node.hasAttribute('href')) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          node = node.parentElement;
        }
      }, true);

      // 2. Block form submissions
      iframeDoc.addEventListener('submit', function _navGuardSubmit(e) {
        if (EditorCore.isEditing()) return;
        e.preventDefault();
        e.stopPropagation();
      }, true);

      // 3. Intercept beforeunload to warn about navigation
      iframeWin.addEventListener('beforeunload', function _navGuardUnload(e) {
        // Allow navigation during controlled reloads (SSE source-updated)
        if (_reloadScheduled) return;
        // Allow navigation to about:blank (our controlled reload step)
        // Already navigating — can't reliably block this, but the click guard should prevent most cases
      });

    } catch (e) {
      console.warn('[shell] Could not install navigation guard:', e.message);
    }
  }

  function _bindEvents() {
    // EditorCore events
    EditorCore.on('editModeChanged', ({ active }) => {
      const toggleLabel = btnToggle.querySelector('span');
      if (active) {
        if (toggleLabel) toggleLabel.textContent = '退出编辑';
        btnToggle.classList.add('btn-active');
      } else {
        if (toggleLabel) toggleLabel.textContent = '开始编辑';
        btnToggle.classList.remove('btn-active');
        PropertiesPanel.hide();
        if (window.Guides) { Guides.clear(); Guides.clearSelect(); Guides.clearHover(); }
        if (window.ResizeHandles) ResizeHandles.hide();
        if (window.FlexOverlay) FlexOverlay.hide();
        _hideAlignToolbar();
        _hideChangeList();
      }
    });

    EditorCore.on('select', ({ el, rect, tagName }) => {
      if (EditorCore.isEditing()) {
        PropertiesPanel.show(rect);
        if (window.Guides) {
          Guides.showForElement(rect, el);
          Guides.clearHover();           // hide hover overlay once selected
          Guides.showSelect(el);         // draw selection outline on SVG layer
        }
        if (window.ResizeHandles) ResizeHandles.show(el);
        // FlexOverlay is triggered by property editing, not element select
      }
      // If we had a multi-select going, collapse to single
      _hideAlignToolbar();
    });

    EditorCore.on('deselect', () => {
      PropertiesPanel.hide();
      if (window.Guides) { Guides.clear(); Guides.clearSelect(); }
      if (window.ResizeHandles) ResizeHandles.hide();
      if (window.FlexOverlay) FlexOverlay.hide();
      _hideAlignToolbar();
    });

    // ── Double-click inline text editing ──────────────────────────────────
    EditorCore.on('dblclick', ({ el }) => {
      EditorCore.startInlineEdit(el);
    });

    EditorCore.on('inlineEditStart', () => {
      PropertiesPanel.hide();
      if (window.Guides) { Guides.clear(); Guides.clearSelect(); Guides.clearHover(); }
      if (window.ResizeHandles) ResizeHandles.hide();
    });

    EditorCore.on('inlineEditEnd', () => {
      // Deselect element so user can review the result
      EditorCore.emit('deselect', null);
    });

    // Feature 5: multi-select event — show align toolbar
    EditorCore.on('multiselect', ({ els, rects }) => {
      if (!alignToolbar || els.length < 2) return;
      // Position toolbar above the bounding box of all selected elements
      const minTop  = Math.min(...rects.map(r => r.top));
      const minLeft = Math.min(...rects.map(r => r.left));
      const maxRight = Math.max(...rects.map(r => r.right));
      const midX   = (minLeft + maxRight) / 2;
      const MARGIN  = 8;
      const tbW     = alignToolbar.offsetWidth || 260;
      const left    = Math.max(4, midX - tbW / 2);
      const top     = Math.max(4, minTop - (alignToolbar.offsetHeight || 40) - MARGIN);

      alignToolbar.style.left = left + 'px';
      alignToolbar.style.top  = top  + 'px';
      alignToolbar.classList.add('align-toolbar--visible');

      // Also hide main panel when multi-select
      PropertiesPanel.hide();
    });

    EditorCore.on('change', ({ count }) => {
      _updateChangeCounter();

      // Refresh panel values + guides after any style change
      if (PropertiesPanel.isVisible()) {
        const el = EditorCore.getSelectedEl();
        if (el) {
          const screenRect = PPHelpers.getScreenRect(iframe, el);

          PropertiesPanel.show(screenRect);
          if (window.Guides) { Guides.showForElement(screenRect, el); Guides.showSelect(el); }
          if (window.ResizeHandles) ResizeHandles.show(el);
          // FlexOverlay is triggered by property editing, not here
        }
      }
    });

    // UndoStack notifications
    UndoStack.onChange(({ canUndo, canRedo, size }) => {
      btnUndo.disabled = !canUndo;
      btnRedo.disabled = !canRedo;
      _updateChangeCounter();

      // Refresh panel after undo/redo so displayed values match actual state
      if (PropertiesPanel.isVisible()) {
        const el = EditorCore.getSelectedEl();
        if (el) {
          const screenRect = PPHelpers.getScreenRect(iframe, el);

          PropertiesPanel.show(screenRect);
          if (window.Guides) { Guides.showForElement(screenRect, el); Guides.showSelect(el); }
          if (window.ResizeHandles) ResizeHandles.show(el);
          // FlexOverlay is triggered by property editing, not here
        }
      }
    });

    // Top bar button clicks
    btnToggle.addEventListener('click', () => {
      if (EditorCore.isEditing()) {
        EditorCore.exitEditMode();
      } else {
        EditorCore.enterEditMode();
      }
    });

    btnUndo.addEventListener('click', () => {
      try {
        UndoStack.undo(iframe.contentDocument || iframe.contentWindow.document);
      } catch (e) { console.warn('[Undo] error:', e); }
    });

    btnRedo.addEventListener('click', () => {
      try {
        UndoStack.redo(iframe.contentDocument || iframe.contentWindow.document);
      } catch (e) { console.warn('[Redo] error:', e); }
    });

    btnSave.addEventListener('click', _save);

    // Close editor button
    if (btnCloseEditor) {
      btnCloseEditor.addEventListener('click', async () => {
        try {
          await fetch('/api/shutdown', { method: 'POST' });
        } catch (e) {}
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#888;font-size:16px;">设计模式已关闭</div>';
      });
    }

    // Theme toggle
    if (btnTheme) {
      btnTheme.addEventListener('click', () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        if (isLight) {
          document.documentElement.removeAttribute('data-theme');
          localStorage.setItem('pe-theme', 'dark');
          btnTheme.innerHTML = _moonIcon;
        } else {
          document.documentElement.setAttribute('data-theme', 'light');
          localStorage.setItem('pe-theme', 'light');
          btnTheme.innerHTML = _sunIcon;
        }
      });
    }

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;

      // Escape: clear selection entirely
      if (e.key === 'Escape') {
        if (window.EditorCore && EditorCore.isEditing()) {
          EditorCore.clearMultiSelect();
          _hideAlignToolbar();
        }
        return;
      }

      // Arrow keys: reorder flex child along its parent's flex direction
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !mod) {
        if (EditorCore.isEditing() && EditorCore.getSelectedEl()) {
          const el = EditorCore.getSelectedEl();
          const parent = el.parentElement;
          if (parent) {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const iframeWin = iframeDoc.defaultView || iframe.contentWindow;
            const cs = iframeWin.getComputedStyle(parent);
            const isFlexParent = /flex/.test(cs.display || '');
            if (isFlexParent) {
              const flexDir = (cs.flexDirection || 'row').toLowerCase();
              const isColumn = flexDir.startsWith('column');
              const isReverse = flexDir.includes('reverse');
              // Map key to move direction: +1 = move later, -1 = move earlier
              let move = 0;
              if (isColumn) {
                if (e.key === 'ArrowDown') move = isReverse ? -1 : 1;
                if (e.key === 'ArrowUp')   move = isReverse ? 1 : -1;
              } else {
                if (e.key === 'ArrowRight') move = isReverse ? -1 : 1;
                if (e.key === 'ArrowLeft')  move = isReverse ? 1 : -1;
              }
              if (move !== 0) {
                e.preventDefault();
                const oldIndex = Array.from(parent.children).indexOf(el);
                const cmd = UndoStack.capture(parent, 'innerHTML', 'innerHTML', null, iframeDoc);
                if (move === -1) {
                  const prev = el.previousElementSibling;
                  if (prev) parent.insertBefore(el, prev);
                } else {
                  const next = el.nextElementSibling;
                  if (next) parent.insertBefore(next, el);
                }
                cmd.newValue = parent.innerHTML;
                UndoStack.record(cmd);
                const newIndex = Array.from(parent.children).indexOf(el);
                if (oldIndex !== newIndex) {
                  EditorCore.trackChange(el, '__reorder__', move === -1 ? 'before' : 'after', `index:${oldIndex}->${newIndex}`, 'reorder');
                  EditorCore.emit('change', { changes: EditorCore.getChanges(), count: EditorCore.getChanges().length });
                }
                return;
              }
            }
          }
        }
        return;
      }

      // [ / ]: move element earlier/later in DOM order
      if ((e.key === '[' || e.key === ']') && !mod) {
        if (EditorCore.isEditing() && EditorCore.getSelectedEl()) {
          e.preventDefault();
          const el     = EditorCore.getSelectedEl();
          const parent = el.parentElement;
          if (!parent) return;
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          const oldIndex = Array.from(parent.children).indexOf(el);
          if (e.key === '[') {
            const prev = el.previousElementSibling;
            if (prev) {
              const cmd = UndoStack.capture(parent, 'innerHTML', 'innerHTML', null, iframeDoc);
              parent.insertBefore(el, prev);
              cmd.newValue = parent.innerHTML;
              UndoStack.record(cmd);
            }
          } else {
            const next = el.nextElementSibling;
            if (next) {
              const cmd = UndoStack.capture(parent, 'innerHTML', 'innerHTML', null, iframeDoc);
              parent.insertBefore(next, el);
              cmd.newValue = parent.innerHTML;
              UndoStack.record(cmd);
            }
          }
          const newIndex = Array.from(parent.children).indexOf(el);
          if (oldIndex !== newIndex) {
            EditorCore.trackChange(el, '__reorder__', e.key === '[' ? 'before' : 'after', `index:${oldIndex}->${newIndex}`, 'reorder');
            EditorCore.emit('change', { changes: EditorCore.getChanges(), count: EditorCore.getChanges().length });
          }
        }
        return;
      }

      // Delete: remove selected element
      if (e.key === 'Delete' && !mod) {
        if (EditorCore.isEditing() && EditorCore.getSelectedEl()) {
          e.preventDefault();
          EditorCore.deleteElement();
        }
        return;
      }

      if (!mod) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        btnUndo.click();
      } else if (e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        btnRedo.click();
      } else if (e.key === 's') {
        e.preventDefault();
        _save();
      }
    });

    // ── iframe scroll: hide handles instantly, redraw after settle ───────────
    // Hides resize handles immediately during scroll to avoid drift,
    // then redraws them and refreshes guides 100ms after scrolling stops.
    let _scrollTimer = null;
    function _onIframeScroll() {
      // Instantly clear all overlays to avoid drift during scroll
      if (window.ResizeHandles) ResizeHandles.hideForScroll();
      if (window.Guides) {
        Guides.clearSelect();
        Guides.clearHover();   // remove children dashed outlines immediately
      }

      if (_scrollTimer) clearTimeout(_scrollTimer);
      _scrollTimer = setTimeout(() => {
        _scrollTimer = null;
        if (window.ResizeHandles) ResizeHandles.refresh();
        if (window.Guides) Guides.refreshPosition();
        // Re-draw select outline at updated position (hover redraws on next mousemove)
        const sel = EditorCore.getSelectedEl();
        if (sel && window.Guides) Guides.showSelect(sel);
      }, 100);
    }

    // Bind to the iframe's scroll event (fires on iframe's window)
    iframe.addEventListener('load', () => {
      const iframeWin = iframe.contentWindow;
      if (iframeWin) {
        iframeWin.addEventListener('scroll', _onIframeScroll, { passive: true });
      }
    });
    // Also bind immediately in case iframe already loaded
    try {
      const iframeWin = iframe.contentWindow;
      if (iframeWin) {
        iframeWin.addEventListener('scroll', _onIframeScroll, { passive: true });
      }
    } catch (e) {}

    // ── Shell panels: clear hover when cursor enters any shell panel ──────────
    // The iframe's mouseover/mouseout events don't fire when the cursor moves
    // onto shell-layer panels (pp-panel, cpk-panel, editor-bar, etc.).
    // Strategy: use mouseover capture on document so it fires for every
    // element regardless of stopPropagation, then check if it's inside a panel.
    const _shellPanelSelectors = '#pp-panel, #cpk-panel, #editor-bar, #change-list, #pe-wait-overlay, #bar-logo-popup';
    document.addEventListener('mouseover', (e) => {
      if (!window.Guides) return;
      if (e.target && e.target.closest && e.target.closest(_shellPanelSelectors)) {
        Guides.clearHover();
      }
    }, true /* capture — fires even if child stops propagation */);
  }

  // ── Change list flyout ──────────────────────────────────────────────────
  function _hideChangeList() {
    if (!changeList) return;
    changeList.classList.remove('change-list--visible');
    // Clean up any lingering hover highlights in iframe
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.querySelectorAll('[data-edit-hover]').forEach(el => el.removeAttribute('data-edit-hover'));
      // Also clean inline outline set by change list hover
      iframeDoc.querySelectorAll('[style*="outline"]').forEach(el => {
        if (el.style.outline.includes('dashed')) {
          el.style.outline = '';
          el.style.outlineOffset = '';
        }
      });
    } catch (e) { /* ignore */ }
  }

  function _bindChangeList() {
    if (!changeCounter || !changeList) return;

    changeCounter.addEventListener('click', () => {
      if (changeList.classList.contains('change-list--visible')) {
        _hideChangeList();
        return;
      }
      if (!window.Snapshot || !Snapshot.hasSnapshot()) return;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      const modified = Snapshot.getModifiedElements(iframeDoc);
      // Gather active CSS variable changes
      const varItems = [];
      try {
        const varChanges = Snapshot.getCSSVarChanges();
        const win = iframe.contentWindow;
        const root = iframeDoc.documentElement;
        Object.keys(varChanges).forEach(vn => {
          const vc = varChanges[vn];
          const current = win.getComputedStyle(root).getPropertyValue(vn).trim().toUpperCase();
          if (current !== (vc.oldValue || '').toUpperCase()) {
            varItems.push({ varName: vn, oldValue: vc.oldValue, newValue: current || vc.newValue });
          }
        });
      } catch(e) {}
      if (modified.length === 0 && varItems.length === 0) return;
      _renderChangeList(modified, varItems);
      changeList.classList.add('change-list--visible');
    });

    document.addEventListener('mousedown', (e) => {
      if (changeList.classList.contains('change-list--visible') &&
          !changeList.contains(e.target) && e.target !== changeCounter) {
        _hideChangeList();
      }
    });
  }

  // ── Align toolbar logic ────────────────────────────────────────────────────
  function _hideAlignToolbar() {
    if (alignToolbar) alignToolbar.classList.remove('align-toolbar--visible');
  }

  function _bindAlignToolbar() {
    if (!alignToolbar) return;

    alignToolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-align]');
      if (!btn) return;
      const action = btn.dataset.align;
      _doAlign(action);
    });
  }

  function _doAlign(action) {
    if (!window.EditorCore || !EditorCore.getSelectedEls) return;
    const els = EditorCore.getSelectedEls();
    if (els.length < 2) return;

    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    const iframeWin = iframe.contentWindow;
    const iBox = iframe.getBoundingClientRect();

    // Capture before-snapshots for batch undo
    const cmds = els.map(el => UndoStack.capture(el, 'style', 'cssText', null, iframeDoc));

    // Get rects in iframe coords
    const rects = els.map(el => el.getBoundingClientRect());

    switch (action) {
      case 'left': {
        const minLeft = Math.min(...rects.map(r => r.left));
        els.forEach((el, i) => {
          const cs = iframeWin.getComputedStyle(el);
          const pos = cs.position;
          if (pos === 'absolute' || pos === 'fixed') {
            const delta = rects[i].left - minLeft;
            const curLeft = parseFloat(cs.left) || 0;
            el.style.left = (curLeft - delta) + 'px';
          } else {
            const delta = rects[i].left - minLeft;
            const curML = parseFloat(cs.marginLeft) || 0;
            el.style.marginLeft = (curML - delta) + 'px';
          }
        });
        break;
      }
      case 'right': {
        const maxRight = Math.max(...rects.map(r => r.right));
        els.forEach((el, i) => {
          const cs = iframeWin.getComputedStyle(el);
          const pos = cs.position;
          if (pos === 'absolute' || pos === 'fixed') {
            const delta = maxRight - rects[i].right;
            const curLeft = parseFloat(cs.left) || 0;
            el.style.left = (curLeft + delta) + 'px';
          } else {
            const delta = maxRight - rects[i].right;
            const curML = parseFloat(cs.marginLeft) || 0;
            el.style.marginLeft = (curML + delta) + 'px';
          }
        });
        break;
      }
      case 'centerH': {
        const minLeft  = Math.min(...rects.map(r => r.left));
        const maxRight = Math.max(...rects.map(r => r.right));
        const midX = (minLeft + maxRight) / 2;
        els.forEach((el, i) => {
          const cs = iframeWin.getComputedStyle(el);
          const elMid = rects[i].left + rects[i].width / 2;
          const delta = midX - elMid;
          const pos = cs.position;
          if (pos === 'absolute' || pos === 'fixed') {
            const curLeft = parseFloat(cs.left) || 0;
            el.style.left = (curLeft + delta) + 'px';
          } else {
            const curML = parseFloat(cs.marginLeft) || 0;
            el.style.marginLeft = (curML + delta) + 'px';
          }
        });
        break;
      }
      case 'top': {
        const minTop = Math.min(...rects.map(r => r.top));
        els.forEach((el, i) => {
          const cs = iframeWin.getComputedStyle(el);
          const delta = rects[i].top - minTop;
          const pos = cs.position;
          if (pos === 'absolute' || pos === 'fixed') {
            const curTop = parseFloat(cs.top) || 0;
            el.style.top = (curTop - delta) + 'px';
          } else {
            const curMT = parseFloat(cs.marginTop) || 0;
            el.style.marginTop = (curMT - delta) + 'px';
          }
        });
        break;
      }
      case 'bottom': {
        const maxBottom = Math.max(...rects.map(r => r.bottom));
        els.forEach((el, i) => {
          const cs = iframeWin.getComputedStyle(el);
          const delta = maxBottom - rects[i].bottom;
          const pos = cs.position;
          if (pos === 'absolute' || pos === 'fixed') {
            const curTop = parseFloat(cs.top) || 0;
            el.style.top = (curTop + delta) + 'px';
          } else {
            const curMT = parseFloat(cs.marginTop) || 0;
            el.style.marginTop = (curMT + delta) + 'px';
          }
        });
        break;
      }
      case 'centerV': {
        const minTop    = Math.min(...rects.map(r => r.top));
        const maxBottom = Math.max(...rects.map(r => r.bottom));
        const midY = (minTop + maxBottom) / 2;
        els.forEach((el, i) => {
          const cs = iframeWin.getComputedStyle(el);
          const elMid = rects[i].top + rects[i].height / 2;
          const delta = midY - elMid;
          const pos = cs.position;
          if (pos === 'absolute' || pos === 'fixed') {
            const curTop = parseFloat(cs.top) || 0;
            el.style.top = (curTop + delta) + 'px';
          } else {
            const curMT = parseFloat(cs.marginTop) || 0;
            el.style.marginTop = (curMT + delta) + 'px';
          }
        });
        break;
      }
      case 'distributeH': {
        if (els.length < 3) break;
        const sorted = els.slice().sort((a, b) => {
          return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
        });
        const sortedRects = sorted.map(el => el.getBoundingClientRect());
        const firstLeft = sortedRects[0].left;
        const lastLeft  = sortedRects[sortedRects.length - 1].left;
        const step = (lastLeft - firstLeft) / (sorted.length - 1);

        sorted.forEach((el, i) => {
          if (i === 0 || i === sorted.length - 1) return;
          const targetLeft = firstLeft + step * i;
          const delta = targetLeft - sortedRects[i].left;
          const cs = iframeWin.getComputedStyle(el);
          const pos = cs.position;
          if (pos === 'absolute' || pos === 'fixed') {
            const curLeft = parseFloat(cs.left) || 0;
            el.style.left = (curLeft + delta) + 'px';
          } else {
            const curML = parseFloat(cs.marginLeft) || 0;
            el.style.marginLeft = (curML + delta) + 'px';
          }
        });
        break;
      }
    }

    // Record batch undo — set newValue for each cmd after mutations
    cmds.forEach(cmd => {
      const el = els[cmds.indexOf(cmd)];
      cmd.newValue = el ? el.style.cssText : cmd.oldValue;
    });
    UndoStack.recordBatch(cmds);

    // Notify change counter
    _updateChangeCounter();
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function _save() {
    console.log('[Save] ENTERED _save()');
    const saveLabel = btnSave.querySelector('span');
    try {
    console.time('[Save] total');
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

    // ── Build change list using hybrid approach ──
    // Snapshot diff: accurate property changes (handles undo correctly)
    // EditorCore._changes[]: structural changes (delete, reorder, video)
    let changes;
    console.time('[Save] snapshot.diff');
    if (window.Snapshot && Snapshot.hasSnapshot()) {
      try {
        const propChanges = Snapshot.diff(iframeDoc);
        console.timeEnd('[Save] snapshot.diff');

        const trackingChanges = EditorCore.getChanges(false);
        const structuralChanges = trackingChanges.filter(c =>
          c.type === 'delete' || c.property === '__delete__'
        );
        // Filter out delete records for elements that were restored (back in DOM)
        const activeDeletes = structuralChanges.filter(c => {
          if (!c.selector) return true;
          try { return !iframeDoc.querySelector(c.selector); }
          catch (e) { return true; }
        });
        const snapshotReorders = new Set(
          propChanges.filter(c => c.type === 'reorder').map(c => c.selector)
        );
        const filteredStructural = activeDeletes.filter(c =>
          !(c.type === 'reorder' && snapshotReorders.has(c.selector))
        );
        changes = [...propChanges, ...filteredStructural];
      } catch (diffErr) {
        console.warn('[Save] Snapshot.diff failed, falling back:', diffErr);
        console.timeEnd('[Save] snapshot.diff');
        changes = EditorCore.getChanges(true);
      }
    } else {
      console.timeEnd('[Save] snapshot.diff');
      changes = EditorCore.getChanges(true);
    }

    // ── Merge pseudo-state overrides from StateEditor ──
    if (window.StateEditor && StateEditor.getOverrideChanges) {
      const stateChanges = StateEditor.getOverrideChanges(iframeDoc);
      if (stateChanges.length > 0) {
        // Add pseudoState into context for each
        stateChanges.forEach(c => {
          if (!c.context) c.context = {};
          c.context.pseudoState = c.pseudoState;
          c.context.tag = c.context.tag || 'unknown';
          // Try to enrich with element info + find matching CSS rule
          try {
            const el = iframeDoc.querySelector(c.selector);
            if (el) {
              c.context.tag = el.tagName.toLowerCase();
              if (el.id) c.context.id = el.id;
              if (el.className && typeof el.className === 'string') {
                c.context.classList = el.className.trim().split(/\s+/).filter(Boolean);
              }
              // Find the matching pseudo-state CSS rule
              const win = iframeDoc.defaultView;
              const kebab = c.property.replace(/([A-Z])/g, '-$1').toLowerCase();
              const state = c.pseudoState;
              const sheets = iframeDoc.styleSheets;
              for (let si = 0; si < sheets.length; si++) {
                let rules;
                try { rules = sheets[si].cssRules; } catch(e) { continue; }
                if (!rules) continue;
                for (let ri = 0; ri < rules.length; ri++) {
                  const rule = rules[ri];
                  if (rule.type !== 1 || !rule.selectorText) continue;
                  if (rule.selectorText.indexOf(state) === -1) continue;
                  const baseSel = rule.selectorText.replace(/:(?:hover|active|focus|focus-within|focus-visible|disabled|visited)/g, '').trim();
                  try {
                    if (el.matches(baseSel || '*')) {
                      let src = '<style>';
                      if (sheets[si].href) {
                        const url = sheets[si].href;
                        src = url.substring(url.lastIndexOf('/') + 1) || url;
                      }
                      c.context.matchedRule = {
                        selector: rule.selectorText,
                        file: src,
                        value: rule.style.getPropertyValue(kebab) || '',
                        fullRuleText: rule.cssText,
                      };
                    }
                  } catch(e) {}
                }
              }
            }
          } catch(e) {}
        });
        changes = [...changes, ...stateChanges];
        console.log('[Save] added', stateChanges.length, 'pseudo-state override(s)');
      }
    }

    console.log('[Save] changes count:', changes.length);

    // Enrich with _trackChange metadata where available
    console.time('[Save] enrich');
    const trackingMeta = new Map();
    for (const c of EditorCore.getChanges(true)) {
      trackingMeta.set(c.selector + '::' + c.property, c.meta);
    }
    changes = changes.map(c => ({
      ...c,
      meta: c.meta || trackingMeta.get(c.selector + '::' + c.property) || null,
      timestamp: c.timestamp || Date.now(),
    }));
    console.timeEnd('[Save] enrich');

    if (changes.length === 0) {
      console.log('[Save] no changes, aborting');
      alert('没有改动可以保存。');
      return;
    }

    btnSave.disabled = true;
    if (saveLabel) saveLabel.textContent = '保存中…';
    console.time('[Save] fetch');

      const resp = await fetch('/api/save-edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes }),
      });
      const data = await resp.json();
      if (data.ok) {
        // Reset snapshot so next edit session starts from new baseline
        if (window.Snapshot) Snapshot.reset();

        const parts = [];
        if (data.changeCount > 0) parts.push(`${data.changeCount} 处改动`);
        if (saveLabel) saveLabel.textContent = `已保存 ✓ AI处理中`;

        // Show wait overlay: blur + spinner + copy-prompt
        _showWaitOverlay();

        // Re-enable save button but keep "AI处理中" label until reload completes
        btnSave.disabled = false;
      } else {
        throw new Error(data.error || 'unknown');
      }
    } catch (err) {
      console.error('[Save] failed:', err);
      alert('保存失败: ' + err.message);
      if (saveLabel) saveLabel.textContent = '保存';
      btnSave.disabled = false;
    }
  }

}());
