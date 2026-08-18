/**
 * consistency-dialog.js — Modal dialog for style consistency issues
 *
 * Shows detected inconsistencies after user clicks save.
 * User can confirm/dismiss each issue, then proceed to save.
 *
 * Returns a Promise that resolves with accepted fixes (as change records)
 * or null if user dismisses all / closes dialog.
 */
'use strict';

window.ConsistencyDialog = (function () {

  var _overlay = null;
  var _dialog = null;

  /**
   * Show the consistency dialog with detected issues.
   * @param {Array} issues — from ConsistencyScanner.scan()
   * @param {Document} iframeDoc — for building context
   * @returns {Promise<Array|null>} — accepted changes or null
   */
  function show(issues, iframeDoc) {
    return new Promise(function (resolve) {
      if (!issues || issues.length === 0) { resolve(null); return; }

      // Track each issue's state
      var issueStates = issues.map(function () { return 'pending'; }); // pending | accepted | dismissed

      // ── Build overlay ──
      _overlay = document.createElement('div');
      _overlay.className = 'cs-overlay';

      _dialog = document.createElement('div');
      _dialog.className = 'cs-dialog';

      // ── Header ──
      var header = document.createElement('div');
      header.className = 'cs-header';
      header.innerHTML = '<span class="cs-title">样式一致性检查</span>';
      var closeBtn = document.createElement('button');
      closeBtn.className = 'cs-close';
      closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
      closeBtn.onclick = function () { _close(); resolve(null); };
      header.appendChild(closeBtn);
      _dialog.appendChild(header);

      // ── Issues list ──
      var list = document.createElement('div');
      list.className = 'cs-list';

      issues.forEach(function (issue, idx) {
        var card = _buildIssueCard(issue, idx, issueStates);
        list.appendChild(card);
      });

      _dialog.appendChild(list);

      // ── Footer ──
      var footer = document.createElement('div');
      footer.className = 'cs-footer';

      var ignoreAllBtn = document.createElement('button');
      ignoreAllBtn.className = 'cs-btn cs-btn--secondary';
      ignoreAllBtn.textContent = '全部忽略';
      ignoreAllBtn.onclick = function () { _close(); resolve(null); };

      var confirmBtn = document.createElement('button');
      confirmBtn.className = 'cs-btn cs-btn--primary';
      confirmBtn.textContent = '确认并保存';
      confirmBtn.onclick = function () {
        var changes = _collectAcceptedChanges(issues, issueStates, iframeDoc);
        _close();
        resolve(changes.length > 0 ? changes : null);
      };

      footer.appendChild(ignoreAllBtn);
      footer.appendChild(confirmBtn);
      _dialog.appendChild(footer);

      _overlay.appendChild(_dialog);
      document.body.appendChild(_overlay);

      // Animate in
      requestAnimationFrame(function () {
        _overlay.classList.add('cs-overlay--visible');
      });
    });
  }

  function _buildIssueCard(issue, idx, issueStates) {
    var card = document.createElement('div');
    card.className = 'cs-card';
    card.dataset.idx = idx;

    // Icon + title
    var icons = {
      'similar-colors': '🎨',
      'similar-fontSize': '📏',
      'similar-spacing': '📐',
      'similar-borderRadius': '◻️',
    };
    var titleEl = document.createElement('div');
    titleEl.className = 'cs-card-title';
    titleEl.textContent = (icons[issue.type] || '⚠️') + ' ' + issue.description;
    card.appendChild(titleEl);

    // Items list
    var itemsList = document.createElement('div');
    itemsList.className = 'cs-card-items';
    issue.items.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'cs-item-row';

      // Color swatch for color issues
      if (issue.type === 'similar-colors') {
        var swatch = document.createElement('span');
        swatch.className = 'cs-color-swatch';
        swatch.style.background = item.value;
        row.appendChild(swatch);
      }

      var valSpan = document.createElement('span');
      valSpan.className = 'cs-item-value';
      valSpan.textContent = item.value;
      row.appendChild(valSpan);

      var elemsSpan = document.createElement('span');
      elemsSpan.className = 'cs-item-elements';
      var elText = item.elements.slice(0, 3).join(', ');
      if (item.count > 3) elText += ' 等';
      elemsSpan.textContent = elText + ' (' + item.count + ' 处)';
      row.appendChild(elemsSpan);

      itemsList.appendChild(row);
    });
    card.appendChild(itemsList);

    // Action row: suggestion + buttons
    var actionRow = document.createElement('div');
    actionRow.className = 'cs-card-actions';

    var suggestLabel = document.createElement('span');
    suggestLabel.className = 'cs-suggest-label';
    suggestLabel.textContent = '统一为 ';

    // Value selector (dropdown of available values)
    var select = document.createElement('select');
    select.className = 'cs-suggest-select';
    issue.items.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = item.value;
      opt.textContent = item.value;
      if (item.value === issue.suggestedValue) opt.selected = true;
      select.appendChild(opt);
    });
    select.onchange = function () {
      issue.suggestedValue = this.value;
    };

    var dismissBtn = document.createElement('button');
    dismissBtn.className = 'cs-btn cs-btn--small cs-btn--ghost';
    dismissBtn.textContent = '忽略';
    dismissBtn.onclick = function () {
      issueStates[idx] = 'dismissed';
      card.classList.add('cs-card--dismissed');
      _updateActionLabel(card, '已忽略');
    };

    var acceptBtn = document.createElement('button');
    acceptBtn.className = 'cs-btn cs-btn--small cs-btn--accent';
    acceptBtn.textContent = '确认修改';
    acceptBtn.onclick = function () {
      issueStates[idx] = 'accepted';
      card.classList.add('cs-card--accepted');
      _updateActionLabel(card, '✓ 已确认');
    };

    actionRow.appendChild(suggestLabel);
    actionRow.appendChild(select);
    actionRow.appendChild(dismissBtn);
    actionRow.appendChild(acceptBtn);
    card.appendChild(actionRow);

    return card;
  }

  function _updateActionLabel(card, text) {
    var actions = card.querySelector('.cs-card-actions');
    if (actions) {
      actions.innerHTML = '<span class="cs-card-status">' + text + '</span>';
    }
  }

  function _collectAcceptedChanges(issues, issueStates, iframeDoc) {
    var changes = [];
    for (var i = 0; i < issues.length; i++) {
      if (issueStates[i] !== 'accepted') continue;
      var issue = issues[i];
      var targetValue = issue.suggestedValue;

      issue.items.forEach(function (item) {
        if (item.value === targetValue) return; // already correct
        item.elements.forEach(function (selector) {
          changes.push({
            selector: selector,
            property: issue.property,
            oldValue: item.value,
            value: targetValue,
            type: 'style',
            source: 'consistency-fix',
            context: {
              tag: 'unknown',
              styleOrigin: 'stylesheet',
              consistencyFix: {
                type: issue.type,
                originalValue: item.value,
                unifiedValue: targetValue,
              },
            },
          });
        });
      });
    }
    return changes;
  }

  function _close() {
    if (_overlay) {
      _overlay.classList.remove('cs-overlay--visible');
      setTimeout(function () {
        if (_overlay && _overlay.parentNode) {
          _overlay.parentNode.removeChild(_overlay);
        }
        _overlay = null;
        _dialog = null;
      }, 200);
    }
  }

  return { show: show };
}());
