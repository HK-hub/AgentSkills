/**
 * ImagePickerPanel — Floating image picker popup (mirrors ColorPickerPanel architecture).
 * Provides local file upload + remote URL input with preview and fit mode control.
 * Uses the same glass-morphism panel style as ColorPickerPanel.
 */
;(function () {
  'use strict';

  var _panel = null;
  var _triggerEl = null;
  var _onImageChange = null;
  var _currentSrc = '';
  var _activeTab = 'local';  // 'local' | 'remote'
  var _debounceTimer = null;
  var _fitSelect = null;     // PPHelpers.createSelect instance

  // Cached DOM refs (set after build)
  var _els = {};

  // ===== DOM Build =====
  function _buildPanel() {
    var div = document.createElement('div');
    div.id = 'ipk-panel';
    div.className = 'ipk-panel';
    div.style.display = 'none';
    document.body.appendChild(div);
    _panel = div;

    // Prevent outside-click from firing when clicking inside panel
    _panel.addEventListener('mousedown', function (e) { e.stopPropagation(); });

    _render();
    return _panel;
  }

  function _render() {
    if (!_panel) return;

    // Build innerHTML (everything except the fit select which is created via JS)
    _panel.innerHTML =
      '<!-- Toolbar -->' +
      '<div class="ipk-toolbar">' +
        '<div class="ipk-tabs-mini">' +
          '<button class="ipk-tab-mini' + (_activeTab === 'local' ? ' ipk-tab-mini--on' : '') + '" data-tab="local">本地文件</button>' +
          '<button class="ipk-tab-mini' + (_activeTab === 'remote' ? ' ipk-tab-mini--on' : '') + '" data-tab="remote">远程 URL</button>' +
        '</div>' +
        '<div class="ipk-toolbar-spacer"></div>' +
        '<button class="ipk-close-btn" title="关闭">' +
          '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
            '<line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/>' +
          '</svg>' +
        '</button>' +
      '</div>' +

      '<!-- Tab: local -->' +
      '<div class="ipk-tab-body" data-tab-body="local"' + (_activeTab !== 'local' ? ' style="display:none"' : '') + '>' +
        '<div class="ipk-preview-area">' +
          '<img class="ipk-preview-img" data-preview="local" src="' + _escAttr(_currentSrc) + '" />' +
          '<div class="ipk-preview-empty">暂无图片</div>' +
        '</div>' +
        '<input type="file" class="ipk-file-input" accept="image/*" style="display:none">' +
        '<button class="ipk-upload-btn">' +
          '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1L7 9M7 1L4.5 3.5M7 1L9.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M1.5 10.5V12C1.5 12.2761 1.72386 12.5 2 12.5H12C12.2761 12.5 12.5 12.2761 12.5 12V10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
          ' 选择本地图片…' +
        '</button>' +
      '</div>' +

      '<!-- Tab: remote -->' +
      '<div class="ipk-tab-body" data-tab-body="remote"' + (_activeTab !== 'remote' ? ' style="display:none"' : '') + '>' +
        '<div class="ipk-preview-area">' +
          '<img class="ipk-preview-img" data-preview="remote" src="' + _escAttr(_currentSrc) + '" />' +
          '<div class="ipk-preview-empty">输入 URL 预览</div>' +
        '</div>' +
        '<div class="ipk-url-row">' +
          '<input class="ipk-url-input" type="text" placeholder="https://example.com/image.png" value="' + _escAttr(_currentSrc.startsWith('./') || _currentSrc.startsWith('data:') ? '' : _currentSrc) + '" />' +
          '<button class="ipk-url-apply-btn">应用</button>' +
        '</div>' +
      '</div>' +

      '';

    _cacheEls();
    _bindEvents();
  }

  function _escAttr(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function _cacheEls() {
    _els.closeBtn      = _panel.querySelector('.ipk-close-btn');
    _els.tabs          = _panel.querySelectorAll('.ipk-tab-mini');
    _els.tabBodies     = _panel.querySelectorAll('.ipk-tab-body');
    _els.fileInput     = _panel.querySelector('.ipk-file-input');
    _els.uploadBtn     = _panel.querySelector('.ipk-upload-btn');
    _els.urlInput      = _panel.querySelector('.ipk-url-input');
    _els.urlApply      = _panel.querySelector('.ipk-url-apply-btn');
    _els.previewLocal  = _panel.querySelector('[data-preview="local"]');
    _els.previewRemote = _panel.querySelector('[data-preview="remote"]');
  }

  // ===== Events =====
  function _bindEvents() {
    // Tab switching
    _els.tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        _switchTab(tab.dataset.tab);
      });
    });

    // Close button
    if (_els.closeBtn) _els.closeBtn.addEventListener('click', close);

    // Local: upload button → trigger file input
    if (_els.uploadBtn) _els.uploadBtn.addEventListener('click', function () {
      if (_els.fileInput) _els.fileInput.click();
    });

    // Local: file selected → upload
    if (_els.fileInput) _els.fileInput.addEventListener('change', _handleFileSelect);

    // Remote: URL input → only apply on Enter or button click (no auto-preview while typing)
    if (_els.urlInput) {
      _els.urlInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); _applyRemoteUrl(); }
      });
    }

    // Remote: apply button
    if (_els.urlApply) _els.urlApply.addEventListener('click', _applyRemoteUrl);
  }

  function _switchTab(tab) {
    _activeTab = tab;
    _els.tabs.forEach(function (t) {
      t.classList.toggle('ipk-tab-mini--on', t.dataset.tab === tab);
    });
    _els.tabBodies.forEach(function (body) {
      body.style.display = body.dataset.tabBody === tab ? '' : 'none';
    });
  }

  function _handleFileSelect(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;

    var formData = new FormData();
    formData.append('image', file, file.name);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload-image');
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          var res = JSON.parse(xhr.responseText);
          if (res.path) {
            _currentSrc = res.path;
            // Use previewUrl for both browser display AND iframe DOM
            // (relative path ./file.ext won't resolve correctly inside iframe due to <base>)
            var displayUrl = res.previewUrl || res.path;
            _updatePreviews(displayUrl);
            if (_onImageChange) _onImageChange(displayUrl, res.path);
          }
        } catch (ex) { console.error('[ipk] parse error', ex); }
      } else {
        console.error('[ipk] upload failed', xhr.status);
      }
      // Reset so same file can be re-selected
      e.target.value = '';
    };
    xhr.onerror = function () { console.error('[ipk] upload network error'); };
    xhr.send(formData);
  }

  function _handleUrlInput() {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(function () {
      var url = (_els.urlInput ? _els.urlInput.value.trim() : '');
      if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:'))) {
        if (_els.previewRemote) _els.previewRemote.src = url;
      }
    }, 500);
  }

  function _applyRemoteUrl() {
    var url = (_els.urlInput ? _els.urlInput.value.trim() : '');
    if (!url) return;
    _currentSrc = url;
    _updatePreviews(url);
    if (_onImageChange) _onImageChange(url);
  }

  function _updatePreviews(src) {
    if (_els.previewLocal)  _els.previewLocal.src  = src || '';
    if (_els.previewRemote) _els.previewRemote.src = src || '';
  }

  // ===== Positioning (mirrors ColorPickerPanel._position) =====
  function _position(triggerEl) {
    if (!triggerEl || !_panel) return;
    var pr = triggerEl.getBoundingClientRect();
    var pw = 260, gap = 8;

    // Anchor: flyout → pp-panel → trigger itself
    var flyoutParent = triggerEl.closest && triggerEl.closest('.pp-flyout');
    var panelParent  = triggerEl.closest && triggerEl.closest('#pp-panel');
    var anchor = (flyoutParent || panelParent || triggerEl).getBoundingClientRect();

    var left = anchor.left - pw - gap;
    if (left < 8) {
      left = anchor.right + gap;
      if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pw - 8);
    }
    var top = pr.top;
    var panelH = 340;
    if (top + panelH > window.innerHeight - 8) top = window.innerHeight - panelH - 8;
    if (top < 8) top = 8;

    _panel.style.left = left + 'px';
    _panel.style.top  = top  + 'px';
  }

  // ===== Global event handlers =====
  function _onOutsideClick(e) {
    // Don't close if clicking inside dropdown menus
    if (e.target.closest && e.target.closest('.pp-dropdown')) return;
    if (_panel && !_panel.contains(e.target) && (!_triggerEl || !_triggerEl.contains(e.target))) {
      close();
    }
  }

  function _onKeyDown(e) {
    if (e.key === 'Escape') close();
  }

  function _addGlobalListeners() {
    document.addEventListener('mousedown', _onOutsideClick, true);
    document.addEventListener('keydown', _onKeyDown, true);
  }

  function _removeGlobalListeners() {
    document.removeEventListener('mousedown', _onOutsideClick, true);
    document.removeEventListener('keydown', _onKeyDown, true);
  }

  // ===== Public API =====
  function open(triggerEl, currentSrc, onImageChange, fitMode) {
    _triggerEl = triggerEl;
    _onImageChange = onImageChange || null;
    _currentSrc = currentSrc || '';
    _activeTab = 'local';

    if (!_panel) _buildPanel();
    else _render();

    _panel.style.display = '';
    _position(triggerEl);
    _addGlobalListeners();
  }

  function close() {
    if (!_panel) return;
    _panel.style.display = 'none';
    _removeGlobalListeners();
    clearTimeout(_debounceTimer);
    _triggerEl = null;
    _onImageChange = null;
  }

  function isOpen() {
    return _panel && _panel.style.display !== 'none';
  }

  // ===== Expose =====
  window.ImagePickerPanel = {
    open: open,
    close: close,
    isOpen: isOpen,
  };
})();
