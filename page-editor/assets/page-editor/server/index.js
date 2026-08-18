'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');

async function openBrowser(url) {
  const { exec } = require('child_process');
  const plat = process.platform;
  const cmd = plat === 'darwin' ? 'open' : plat === 'win32' ? 'start' : 'xdg-open';
  return new Promise((resolve, reject) => {
    exec(`${cmd} "${url}"`, (err) => err ? reject(err) : resolve());
  });
}

// Read properties-panel HTML partial once at startup
const _ppHtml = (() => {
  try {
    return fs.readFileSync(
      path.join(__dirname, '..', 'public', 'editor', 'partials', 'properties-panel.html'),
      'utf8'
    );
  } catch (e) {
    console.warn('[server] Could not read properties-panel.html partial:', e.message);
    return '<!-- properties-panel.html not found -->';
  }
})();

function startServer({ targetFile, targetUrl, port, outputPath }) {
  // ── Shutdown state (declared early for guard middleware) ────────────────
  let _shutdownRequested = false;
  let _exitScheduled = false;
  const _shutdownMsg = {
    type: 'page-editor:closed',
    message: '用户关闭了设计模式。',
  };

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // ── Shutdown guard: after close, block target page but allow editor shell ──
  app.use((req, res, next) => {
    if (!_shutdownRequested) return next();
    // Always allow: API endpoints, editor assets, and the shell page itself
    if (req.path.startsWith('/api/') ||
        req.path.startsWith('/editor-assets/') ||
        req.path === '/') return next();
    // Block target page and assets (the actual edited content)
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache');
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="Cache-Control" content="no-store"><title>设计模式已关闭</title></head>
<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,-apple-system,sans-serif;background:#111;color:#888;font-size:16px;">
设计模式已关闭</body></html>`);
  });

  // ── Port file: write to target file's directory for project isolation ───
  // Use target file's directory (or CWD as fallback) to avoid cross-project conflicts
  const _targetDir = targetFile ? path.dirname(targetFile) : process.cwd();
  const portFilePath = path.join(_targetDir, '.page-editor.port');

  function _writePortFile(actualPort) {
    try {
      // Write JSON with target info for multi-instance conflict detection
      const data = JSON.stringify({
        port: actualPort,
        target: targetFile || targetUrl || null,
        targetDir: _targetDir,
        pid: process.pid,
        startedAt: new Date().toISOString(),
      });
      fs.writeFileSync(portFilePath, data, 'utf8');
    }
    catch (e) { console.warn('[server] Could not write .page-editor.port:', e.message); }
  }

  function _cleanupPortFile() {
    try { fs.unlinkSync(portFilePath); } catch (e) { /* ignore */ }
  }

  // Clean up port file on exit
  process.on('exit', _cleanupPortFile);
  process.on('SIGINT', () => { _cleanupPortFile(); process.exit(0); });
  process.on('SIGTERM', () => { _cleanupPortFile(); process.exit(0); });

  // ── SSE: push reload signal to browser ──────────────────────────────────
  let _sourceEventClients = [];
  let _fallbackTimer = null;

  function _pushReloadSignal(source) {
    // Cancel any pending fallback
    if (_fallbackTimer) { clearTimeout(_fallbackTimer); _fallbackTimer = null; }
    console.log(`  [reload] 通知浏览器刷新 (source: ${source})`);
    const msg = JSON.stringify({ type: 'source-updated', source, timestamp: Date.now() });
    _sourceEventClients.forEach(client => {
      try { client.write(`data: ${msg}\n\n`); } catch (e) {}
    });
  }

  // ── POST /api/reload — AI calls this after finishing all source edits ──
  app.post('/api/reload', (req, res) => {
    _resetIdleTimer();
    _reloadPending = false;
    _pushReloadSignal('api');
    res.json({ ok: true });
  });

  // ── Reload state ────────────────────────────────────────────────────────────
  // After user saves → wait overlay shown → AI rewrites source code →
  // AI MUST call POST /api/reload to dismiss the overlay and refresh the iframe.
  // No automatic fallback — if AI doesn't call /api/reload, the overlay stays.
  let _reloadPending = false;

  function _startSourceWatch() {
    // File watching removed — only /api/reload triggers refresh.
    // This prevents premature dismissal of the wait overlay before AI finishes edits.
  }

  app.get('/api/source-events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    _sourceEventClients.push(res);
    req.on('close', () => {
      const idx = _sourceEventClients.indexOf(res);
      if (idx !== -1) _sourceEventClients.splice(idx, 1);
    });
  });

  // ── Wait-for-save: pending response queue for --wait clients ────────────
  let _waitClients = [];

  // Save result buffer: holds the most recent save result so that a late-connecting
  // --wait client can receive it even if the save happened while no one was listening.
  let _saveBuffer = null;   // { timestamp, aiMessage } or null

  const publicDir = path.join(__dirname, '..', 'public');
  app.use('/editor-assets', express.static(path.join(publicDir, 'editor'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
    }
  }));

  // Serve uploaded images from a dedicated subdirectory (not the entire CWD)
  const uploadDir = path.join(process.cwd(), '.page-editor-uploads');
  try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (e) {}
  app.use('/uploaded-assets', express.static(uploadDir));


  // ── Upload image endpoint ─────────────────────────────────────────────────
  app.post('/api/upload-image', (req, res) => {
    const boundary = (() => {
      const ct = req.headers['content-type'] || '';
      const m = ct.match(/boundary=([^\s;]+)/);
      return m ? m[1] : null;
    })();
    if (!boundary) return res.status(400).json({ error: 'no boundary' });

    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks);
        const boundaryBuf = Buffer.from('--' + boundary);

        // Split into parts
        let start = buf.indexOf(boundaryBuf) + boundaryBuf.length;
        while (start < buf.length) {
          // Skip CRLF after boundary
          if (buf[start] === 0x0d && buf[start + 1] === 0x0a) start += 2;
          const nextBoundary = buf.indexOf(boundaryBuf, start);
          if (nextBoundary === -1) break;
          const partBuf = buf.slice(start, nextBoundary - 2); // strip trailing CRLF

          // Parse headers
          const headerEnd = partBuf.indexOf('\r\n\r\n');
          if (headerEnd === -1) { start = nextBoundary + boundaryBuf.length; continue; }
          const headerStr = partBuf.slice(0, headerEnd).toString('utf8');
          const fileData  = partBuf.slice(headerEnd + 4);

          // Extract filename
          const fnMatch = headerStr.match(/filename="([^"]+)"/);
          if (!fnMatch) { start = nextBoundary + boundaryBuf.length; continue; }

          const origName = path.basename(fnMatch[1]);
          const safeName = origName.replace(/[^a-zA-Z0-9._-]/g, '_');
          const destPath = path.join(uploadDir, safeName);
          fs.writeFileSync(destPath, fileData);

          return res.json({ path: './' + safeName, previewUrl: '/uploaded-assets/' + safeName });
        }
        res.status(400).json({ error: 'no file found in upload' });
      } catch (e) {
        console.error('[upload-image]', e);
        res.status(500).json({ error: e.message });
      }
    });
  });

  // ── Save endpoint ─────────────────────────────────────────────────────────
  app.post('/api/save-edits', (req, res) => {
    try {
    _resetIdleTimer();
    const { changes } = req.body || {};
    if (!Array.isArray(changes)) {
      return res.status(400).json({ error: 'changes must be an array' });
    }

    const elementsModified = new Set(changes.map(c => c.selector).filter(Boolean)).size;

    // ── Build per-element grouped view (smart complete version) ──
    const byElement = {};
    for (const c of changes) {
      const key = c.selector || '__deleted__';
      const ctx = c.context || {};
      if (!byElement[key]) {
        byElement[key] = {
          selector: c.selector,
          recommendedSelector: ctx.recommendedSelector || null,
          tag: ctx.tag || (c.meta && c.meta.tag) || 'unknown',
          classList: ctx.classList || [],
          id: ctx.id || null,
          role: ctx.role || null,
          parentSelector: ctx.parentSelector || null,
          parentClassList: ctx.parentClassList || [],
          childIndex: ctx.childIndex != null ? ctx.childIndex : null,
          siblingCount: ctx.siblingCount != null ? ctx.siblingCount : null,
          changes: [],
        };
      }
      // Build rich change entry with all context inline
      const entry = {
        property: c.property,
        oldValue: c.oldValue,
        newValue: c.value,
        type: c.type,
        source: c.source || null,
        styleOrigin: ctx.styleOrigin || null,
        pseudoState: ctx.pseudoState || c.pseudoState || null,
      };
      // Inline matched CSS rule (full text for precise location)
      if (ctx.matchedRule) {
        entry.matchedRule = {
          selector: ctx.matchedRule.selector,
          file: ctx.matchedRule.file,
          fullRuleText: ctx.matchedRule.fullRuleText || null,
          value: ctx.matchedRule.value || null,
        };
      }
      // CSS variable tracking
      if (ctx.cssVariable) {
        entry.cssVariable = {
          name: ctx.cssVariable.name,
          value: ctx.cssVariable.value,
          definedIn: ctx.cssVariable.definedIn || null,
          file: ctx.cssVariable.file || null,
        };
      }
      // Tailwind hint
      if (ctx.tailwindHint) {
        entry.tailwindHint = {
          currentClass: ctx.tailwindHint.currentClass || null,
          suggestedClass: ctx.tailwindHint.suggestedClass || null,
          confidence: ctx.tailwindHint.confidence || null,
        };
      }
      byElement[key].changes.push(entry);
    }

    // ── Analyze target file type ──
    const targetAnalysis = _analyzeTargetFile(targetFile);

    // ── Generate per-element intent summaries ──
    for (const group of Object.values(byElement)) {
      group.intent = _inferIntent(group.changes);
    }

    // ── Detect cross-element patterns ──
    const patterns = _detectPatterns(Object.values(byElement), changes);

    // ── Generate per-change strategies ──
    for (const c of changes) {
      c.strategy = _generateStrategy(c, targetAnalysis);
    }

    // ── Generate per-element group strategies ──
    for (const group of Object.values(byElement)) {
      group.strategy = _generateGroupStrategy(group, targetAnalysis, changes);
    }

    // ── Generate per-element CSS diff view ──
    for (const group of Object.values(byElement)) {
      group.cssDiff = _buildCssDiff(group);
    }

    const instructions = `请根据以下改动记录修改源码。

## 操作指引
1. byElement 按元素聚合所有变更，每个元素包含完整的定位信息（classList、parentSelector、childIndex 等）。
2. cssDiff 展示需要修改/添加/删除的属性，ruleSelector + file 标明来源。
3. 每条 change 的 matchedRule.fullRuleText 是完整的原始 CSS 规则文本，可精确定位。
4. styleOrigin 标明值来源："inline"（行内）、"stylesheet"（样式表）、"inherited"（继承）。
5. source="removed" 表示用户删除了该属性，请从 CSS 规则中移除它。
6. pseudoState 标明这是伪状态（如 :hover）下的修改，需修改对应的伪状态 CSS 规则。
7. cssVariable 字段包含变量名和定义位置，请修改 :root 中的变量定义而非使用处。
8. tailwindHint 提示应替换的 Tailwind class。
9. patterns 描述跨元素批量修改模式，建议修改共同的 CSS 规则而非逐个元素改。
10. 当 selector 不够精确时（如含 [style]），用 classList + parentSelector + childIndex 辅助定位。`;

    // ── Build clean byElement for output (strip null/empty fields) ──
    const cleanByElement = Object.values(byElement).map(group => {
      const g = { selector: group.selector, tag: group.tag };
      if (group.recommendedSelector) g.recommendedSelector = group.recommendedSelector;
      if (group.classList && group.classList.length) g.classList = group.classList;
      if (group.id) g.id = group.id;
      if (group.role) g.role = group.role;
      if (group.parentSelector) g.parentSelector = group.parentSelector;
      if (group.parentClassList && group.parentClassList.length) g.parentClassList = group.parentClassList;
      if (group.childIndex != null) g.childIndex = group.childIndex;
      if (group.siblingCount != null) g.siblingCount = group.siblingCount;
      if (group.intent) g.intent = group.intent;
      if (group.strategy) g.strategy = group.strategy;
      if (group.cssDiff) g.cssDiff = group.cssDiff;
      return g;
    });

    // ── Single output (smart complete version) ──
    const output = {
      version: '4.0',
      savedAt: new Date().toISOString(),
      targetFile: targetFile || targetUrl,
      instructions,
      targetAnalysis,
      summary: {
        totalChanges: changes.length,
        elementsModified,
      },
      patterns: patterns.length > 0 ? patterns : undefined,
      byElement: cleanByElement,
    };

      // Write single output file
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
      console.log(`\n  ✅ page-edits.json saved -> ${outputPath}`);
      console.log(`    ${changes.length} change(s).\n`);

      // ── Emit to stdout for AI agent consumption ──────────────────────
      const aiMessage = {
        type: 'page-editor:changes',
        file: outputPath,
        target: targetFile || targetUrl,
        instructions,
        summary: `用户通过 Page Editor 修改了 ${elementsModified} 个元素，共 ${changes.length} 处样式改动。`,
        patterns: output.patterns,
        byElement: cleanByElement,
      };

      // Print readable summary + full JSON for AI parsing
      console.log('\n📋 ─── PAGE EDITOR CHANGES ───');
      console.log(`目标文件: ${targetFile || targetUrl}`);
      console.log(`修改元素: ${elementsModified} 个`);
      for (const group of cleanByElement) {
        const props = (group.cssDiff || []).flatMap(r => r.changes.map(c => c.property)).join(', ');
        console.log(`  ${group.selector || '[已删除]'} (${group.tag}) — ${props}`);
      }
      if (patterns.length) {
        console.log(`模式检测: ${patterns.length} 个批量修改模式`);
        for (const p of patterns) {
          console.log(`  → ${p.description}`);
        }
      }
      console.log(`\n输出文件: ${outputPath}`);
      console.log(JSON.stringify(aiMessage, null, 2));
      console.log('─── END CHANGES ───\n');

      res.json({
        ok: true,
        path: outputPath,
        changeCount: changes.length,
      });

      // ── Mark: waiting for AI to finish editing and call /api/reload ──
      _reloadPending = true;

      // ── Notify --wait clients ──────────────────────────────────────
      if (_waitClients.length > 0) {
        // Someone is listening — send directly, no need to buffer
        _waitClients.forEach(waitRes => {
          try { waitRes.json(aiMessage); } catch (e) {}
        });
        _waitClients = [];
        _saveBuffer = null;  // clear any stale buffer
      } else {
        // No one listening (--wait in timeout/restart gap) — buffer for late pickup
        _saveBuffer = {
          timestamp: Date.now(),
          aiMessage: aiMessage,
        };
      }
    } catch (err) {
      console.error('[page-editor] save failed:', err.message, err.stack);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Wait-for-save endpoint (long-poll for --wait clients) ───────────────
  app.get('/api/wait-for-save', (req, res) => {
    // Support ?timeout=N (seconds). 0 or absent = 10 min default
    const timeoutSec = parseInt(req.query.timeout, 10) || 0;

    // ── Check save buffer: if user saved while no --wait was listening, return it immediately ──
    if (_saveBuffer && Date.now() - _saveBuffer.timestamp < 120_000) {
      const buffered = _saveBuffer.aiMessage;
      _saveBuffer = null;   // consume: only deliver once per reconnect
      return res.json(buffered);
    }

    // If shutdown was already requested, return immediately
    if (_shutdownRequested) {
      res.json(_shutdownMsg);
      if (!_exitScheduled) {
        _exitScheduled = true;
        _cleanupPortFile();
        setTimeout(() => process.exit(0), 500);
      }
      return;
    }

    const timeoutMs = timeoutSec > 0 ? timeoutSec * 1000 : 10 * 60 * 1000;

    const timeout = setTimeout(() => {
      const idx = _waitClients.indexOf(res);
      if (idx !== -1) _waitClients.splice(idx, 1);
      if (timeoutSec > 0) {
        // Short-timeout poll mode: return a parseable timeout signal (not an error)
        res.json({ type: 'timeout' });
      } else {
        // Legacy long-timeout: return 408
        res.status(408).json({ error: 'timeout', message: 'No save within 10 minutes' });
      }
    }, timeoutMs);

    res.on('close', () => {
      clearTimeout(timeout);
      const idx = _waitClients.indexOf(res);
      if (idx !== -1) _waitClients.splice(idx, 1);
    });

    _waitClients.push(res);
  });

  // ── Health check (for --wait to verify server is running) ───────────────
  app.get('/api/ping', (req, res) => {
    _resetIdleTimer();
    res.json({ ok: true, port });
  });

  // ── Shutdown endpoint (from close button or AI) ────────────────────────
  app.post('/api/shutdown', (req, res) => {
    console.log('\n  🛑 Shutdown requested.');
    _shutdownRequested = true;

    console.log('\n📋 ─── PAGE EDITOR CLOSED ───');
    console.log('用户关闭了设计模式。');
    console.log(JSON.stringify(_shutdownMsg, null, 2));
    console.log('─── END ───\n');

    // Notify any currently waiting --wait clients immediately
    if (_waitClients.length > 0) {
      _waitClients.forEach(waitRes => {
        try { waitRes.json(_shutdownMsg); } catch (e) {}
      });
      _waitClients = [];
    }

    res.json({ ok: true });

    // Keep port file alive so AI's next --wait poll can connect
    // Auto-exit after 60s as safety net
    setTimeout(() => {
      if (!_exitScheduled) {
        _exitScheduled = true;
        _cleanupPortFile();
        console.log('  [shutdown] 60s safety timeout, exiting.');
        process.exit(0);
      }
    }, 60000);
  });

  // ── Idle timeout: auto-exit after 30 minutes of no activity ────────────
  const IDLE_TIMEOUT = 30 * 60 * 1000;
  let _idleTimer = null;
  function _resetIdleTimer() {
    if (_idleTimer) clearTimeout(_idleTimer);
    _idleTimer = setTimeout(() => {
      console.log('\n  ⏰ Idle timeout (30 min). Auto-shutting down...');
      process.exit(0);
    }, IDLE_TIMEOUT);
  }

  // ── Target page routing ───────────────────────────────────────────────────
  if (targetFile) {
    // Serve the local file and its sibling assets
    const fileDir = path.dirname(targetFile);
    const fileName = path.basename(targetFile);

    app.get('/target', (req, res) => {
      const html = fs.readFileSync(path.resolve(targetFile), 'utf8');
      // Inject <base> so relative asset paths inside the iframe resolve via /target-assets/
      const injected = html.replace(/(<head[^>]*>)/i, '$1<base href="/target-assets/">');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(injected);
    });
    app.use('/target-assets', express.static(fileDir, {
      etag: false,
      lastModified: false,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
      }
    }));
    // Serve demo-partials relative to the target file's directory
    app.use('/demo-partials', express.static(path.join(fileDir, 'demo-partials'), {
      etag: false,
      lastModified: false,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
      }
    }));

  } else if (targetUrl) {
    // Proxy remote URL
    const url = new URL(targetUrl);
    app.use('/target-proxy', createProxyMiddleware({
      target: `${url.protocol}//${url.host}`,
      changeOrigin: true,
      pathRewrite: { '^/target-proxy': '' },
    }));
  }

  // ── Editor shell (main page served at /) ─────────────────────────────────
  app.get('/', (req, res) => {
    // Detect requests from CodeBuddy's internal embedded browser (webview).
    // The internal browser promotes iframe content to top-level, destroying the
    // editor Shell layer (toolbar, buttons, etc.). Return a guidance page instead.
    if (_isInternalBrowser(req)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache');
      return res.send(_buildInternalBrowserWarning());
    }

    const iframeSrc = targetFile
      ? `/target`
      : `/target-proxy${new URL(targetUrl).pathname || '/'}`;

    const html = buildShell(iframeSrc, port);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // ── Start with auto-port ───────────────────────────────────────────────
  const MAX_PORT = port + 100; // try up to 100 ports

  // ── Conflict detection: warn if another instance is editing a different file ──
  try {
    const existingContent = fs.readFileSync(portFilePath, 'utf8').trim();
    try {
      const existing = JSON.parse(existingContent);
      const curTarget = targetFile || targetUrl;
      if (existing.target && curTarget && existing.target !== curTarget) {
        console.warn(`\n  ⚠️  另一个 page-editor 实例正在编辑不同文件：`);
        console.warn(`      已有: ${existing.target} (port ${existing.port}, pid ${existing.pid})`);
        console.warn(`      当前: ${curTarget}`);
        console.warn(`      将覆盖 .page-editor.port，--monitor/--reload 将连接到本实例。\n`);
      }
    } catch (e) { /* old format or invalid JSON, just proceed */ }
  } catch (e) { /* no port file, clean start */ }

  function _tryListen(tryPort) {
    const server = app.listen(tryPort, () => {
      const editorUrl = `http://localhost:${tryPort}`;
      console.log(`\n🎨  page-editor running at ${editorUrl}`);
      console.log(`    target: ${targetFile || targetUrl}`);
      console.log(`    output: ${outputPath}`);
      console.log(`    idle timeout: 30 min`);
      console.log(`    Press Ctrl+C to stop.\n`);
      _writePortFile(tryPort);
      _resetIdleTimer();
      // Delay browser open to let frontend JS (15+ scripts) and iframe fully load.
      // A full-screen "正在初始化..." loading overlay is shown until all JS inits complete,
      // so we can afford a generous delay here — better to show the loading state than
      // present a half-functional page. 4s covers most local-file scenarios.
      setTimeout(() => {
        openBrowser(editorUrl).catch(() => {
          console.log(`    Auto-open failed. Open manually: ${editorUrl}`);
        });
      }, 4000);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && tryPort < MAX_PORT) {
        console.log(`    Port ${tryPort} in use, trying ${tryPort + 1}...`);
        _tryListen(tryPort + 1);
      } else {
        console.error(`\n  Error: could not start server on ports ${port}-${MAX_PORT}`);
        console.error(`  ${err.message}\n`);
        process.exit(1);
      }
    });
  }

  _tryListen(port);

  // Start watching target file for AI rewrites → auto-push reload to browser
  _startSourceWatch();
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal browser detection & warning
// ─────────────────────────────────────────────────────────────────────────────

function _isInternalBrowser(req) {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  // CodeBuddy internal webview typically identifies itself via User-Agent
  // or by the absence of common browser features.
  // Known indicators:
  // - UA contains "electron", "codebuddy", "vscode-webview", or "cef"
  // - No standard browser brand (no Chrome/Firefox/Safari/Edg)
  // - Referer header suggests an IDE context
  const indicators = ['electron', 'codebuddy', 'vscode', 'webview', 'cef ', 'chromiumembedded'];
  if (indicators.some(i => ua.includes(i))) return true;

  // Also check for missing browser brands — internal webviews often have minimal UAs
  const hasBrand = /chrome|firefox|safari|edg|opera|msie/.test(ua);
  if (!hasBrand && ua.length > 5) return true;

  return false;
}

function _buildInternalBrowserWarning() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>请在浏览器中打开</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1c1c1e;
    color: rgba(255,255,255,0.92);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 3rem 2rem;
  }
  .content { max-width: 480px; text-align: center; }

  /* ── Title — matches pe-wait__text (32px/700) ── */
  h1 {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.3;
    color: rgba(255,255,255,0.92);
    margin-bottom: 1.5rem;
  }

  /* ── Body — matches pe-wait__hint weight & size ── */
  p {
    font-size: 15px;
    font-weight: 400;
    line-height: 1.65;
    color: rgba(255,255,255,0.55);
    margin-bottom: 0.75rem;
  }
  p strong { color: rgba(255,255,255,0.82); font-weight: 600; }

  /* ── Tip — subtle, compact, no heavy card feel ── */
  .tip {
    margin-top: 2rem;
    padding-top: 1.25rem;
    border-top: 1px solid rgba(255,255,255,0.08);
    text-align: left;
  }
  .tip strong {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: rgba(255,255,255,0.4);
    margin-bottom: 0.3rem;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .tip span {
    font-size: 13px;
    color: rgba(255,255,255,0.45);
    line-height: 1.6;
  }
</style>
</head>
<body>
<div class="content">
  <h1>检测到 IDE 内置浏览器</h1>
  <p>编辑器需要在外部浏览器中运行。IDE 内置浏览器会将 iframe 内容提升到顶层，导致编辑工具栏和按钮丢失。</p>
  <p>已自动在<strong>系统默认浏览器</strong>中打开编辑器页面，请切换到该浏览器窗口操作即可。</p>
  <div class="tip">
    <strong>提示</strong>
    <span>如果外部浏览器没有自动打开，请手动复制地址栏中的 URL 在浏览器中打开。</span>
  </div>
</div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the outer shell HTML
// ─────────────────────────────────────────────────────────────────────────────
const _icon = (paths) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

function buildShell(iframeSrc, port) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Page Editor</title>
  <link rel="stylesheet" href="/editor-assets/css/shell.css" />
</head>
<body>
  <!-- ── Initial loading overlay: shown until editor JS fully initializes ── -->
  <div id="pe-init-loading" style="
    position:fixed;top:0;left:0;width:100%;height:100%;
    z-index:999999;display:flex;flex-direction:column;
    align-items:center;justify-content:center;
    background:#111;color:#fff;font-family:system-ui,-apple-system,sans-serif;
    transition:opacity 0.3s ease;
  ">
    <div class="pe-spinner" style="
      width:28px;height:28px;border:3px solid rgba(255,255,255,0.15);
      border-top-color:#5b8def;border-radius:50%;
      animation:pe-spin 0.7s linear infinite;margin-bottom:16px;
    "></div>
    <div id="pe-init-text" style="font-size:14px;color:rgba(255,255,255,0.55);letter-spacing:0.02em;">
      正在初始化编辑器...
    </div>
  </div>
  <style>
    @keyframes pe-spin{to{transform:rotate(360deg)}}
  </style>

  <!-- ── Top bar ─────────────────────────────────────────────────── -->
  <div id="editor-bar">
    <!-- Left: logo + sep + hint -->
    <div class="bar-left">
      <span class="bar-logo" id="bar-logo">
        <img class="bar-logo-dark" src="/editor-assets/logo-dark.svg" width="18" height="18" alt="logo" />
        <img class="bar-logo-light" src="/editor-assets/logo-light.svg" width="18" height="18" alt="logo" />
        <div class="bar-logo-popup" id="bar-logo-popup">
          <div class="bar-logo-popup-row">Page Editor <span style="opacity:0.5">v2.3.4</span></div>
          <div class="bar-logo-popup-row bar-logo-popup-row--sub">by mabeima</div>
        </div>
      </span>
      <div class="bar-sep"></div>
      <button id="btn-close-editor" class="bar-btn bar-btn--close" title="关闭设计模式">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
        </svg>
        <span>关闭设计模式</span>
      </button>
    </div>

    <!-- Center: undo / redo / counter (absolutely centered) -->
    <div class="bar-center">
      <button id="btn-undo" class="bar-btn bar-btn--icon" disabled title="撤销 (Cmd/Ctrl+Z)">
        ${_icon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>')}
      </button>
      <button id="btn-redo" class="bar-btn bar-btn--icon" disabled title="重做 (Cmd/Ctrl+Shift+Z)">
        ${_icon('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>')}
      </button>
      <span id="change-counter" class="change-counter"></span>
      <div id="change-list" class="change-list">
        <div class="change-list-items"></div>
      </div>
    </div>

    <!-- Right: edit-mode toggle + sep + theme toggle + send-to-ai -->
    <div class="bar-right">
      <button id="btn-toggle" class="bar-btn bar-btn--icon" title="进入/退出编辑模式">
        ${_icon('<path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"/><path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h2"/><path d="M14 3h1"/><path d="M3 9v1"/><path d="M21 9v2"/><path d="M3 14v1"/>')}
        <span>开始编辑</span>
      </button>
      <div class="bar-sep"></div>
      <button id="btn-theme" class="bar-btn bar-btn--icon" title="切换深色/浅色主题">
        ${_icon('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>')}
      </button>
      <button id="btn-feedback" class="bar-btn bar-btn--icon" title="用户反馈" onclick="window.open('https://wj.qq.com/s2/26454399/6957/','_blank')">
        ${_icon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>')}
      </button>
      <button id="btn-save" class="bar-btn bar-btn--icon bar-btn--primary" title="将编辑发送给 AI (Cmd/Ctrl+S)">
        ${_icon('<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>')}
        <span>保存</span>
      </button>
    </div>
  </div>

  <!-- ── Iframe ──────────────────────────────────────────────────── -->
  <div id="frame-container">
    <iframe
      id="target-frame"
      src="${iframeSrc}"
      sandbox="allow-scripts allow-same-origin allow-forms"
      frameborder="0"
    ></iframe>
  </div>

  <!-- ── Flex overlay (z-index 9996) ─────────────────────── -->
  <svg id="flex-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9996;"></svg>

  <!-- ── Guides SVG overlay (z-index 9998) ────────────────────── -->
  <svg id="guides-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998;"></svg>

  ${_ppHtml}

  <!-- Scripts -->
  <script src="/editor-assets/js/vendor/css-selector-generator.js"></script>
  <script src="/editor-assets/js/tailwind-map.js"></script>
  <script src="/editor-assets/js/selector.js"></script>
  <script src="/editor-assets/js/undo-stack.js"></script>
  <script src="/editor-assets/js/snapshot.js"></script>
  <script src="/editor-assets/js/editor-core.js"></script>
  <script src="/editor-assets/js/color-picker-engine.js"></script>
  <script src="/editor-assets/js/color-picker-panel.js"></script>
  <script src="/editor-assets/js/image-picker-panel.js"></script>
  <script src="/editor-assets/js/pp-helpers.js"></script>
  <script src="/editor-assets/js/pp-layout.js"></script>
  <script src="/editor-assets/js/pp-appearance.js"></script>
  <script src="/editor-assets/js/properties-panel.js"></script>
  <script src="/editor-assets/js/guides.js"></script>
  <script src="/editor-assets/js/resize-handles.js"></script>
  <script src="/editor-assets/js/flex-overlay.js"></script>
  <script src="/editor-assets/js/consistency-scanner.js"></script>
  <script src="/editor-assets/js/consistency-dialog.js"></script>
  <script src="/editor-assets/js/state-editor.js"></script>
  <script src="/editor-assets/js/number-scrubber.js"></script>
  <script src="/editor-assets/js/shell.js"></script>
</body>
</html>`;
}

// ── Helper: Analyze target file to help AI know where to edit ──────────────
function _analyzeTargetFile(filePath) {
  if (!filePath) return { type: 'remote-url', recommendation: '远程 URL，需手动定位源码文件' };
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const hasInlineStyle = /<style[\s>]/i.test(content);
    const externalCSS = [];
    const linkMatches = content.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi);
    for (const m of linkMatches) externalCSS.push(m[1]);
    const hasScripts = /<script[\s>]/i.test(content);
    const isBuildArtifact = /\.[a-f0-9]{6,}\.(js|css)/i.test(content) || /\/_next\/|\/assets\/index-/i.test(content);

    // Detect framework from HTML content
    let detectedFramework = null;
    if (content.includes('data-reactroot') || content.includes('__next') || content.includes('_next/static')) {
      detectedFramework = 'react/next.js';
    } else if (content.includes('data-v-') || content.includes('data-server-rendered')) {
      detectedFramework = 'vue';
    } else if (content.includes('data-astro')) {
      detectedFramework = 'astro';
    }

    // Detect CSS framework from class patterns
    let cssFramework = null;
    const classMatches = content.match(/class="([^"]{20,})"/g);
    if (classMatches) {
      const sample = classMatches.slice(0, 10).join(' ');
      const twCount = (sample.match(/\b(text-|bg-|p-|px-|py-|m-|mx-|my-|w-|h-|flex|grid|gap-|rounded|border|shadow)/g) || []).length;
      if (twCount >= 8) cssFramework = 'tailwind';
    }

    let type = 'single-file-html';
    if (externalCSS.length > 0) type = 'multi-file';
    if (isBuildArtifact) type = 'build-artifact';

    let recommendation;
    if (type === 'single-file-html') {
      recommendation = hasInlineStyle
        ? '修改此文件中 <style> 块的对应 CSS 规则，或添加/修改元素的 inline style'
        : '在此文件中添加 <style> 块或修改元素的 inline style';
    } else if (type === 'multi-file') {
      recommendation = '根据 matchedRule.file 字段定位对应的 CSS 文件进行修改';
    } else {
      recommendation = '这是构建产物，需要修改源码文件后重新构建。根据 selector 和 classList 在源码中定位对应组件';
    }

    return {
      type,
      hasInlineStyles: hasInlineStyle,
      externalCSS: externalCSS.length > 0 ? externalCSS : undefined,
      hasScripts,
      detectedFramework,
      cssFramework,
      recommendation,
    };
  } catch (e) {
    return { type: 'unknown', recommendation: '无法分析文件: ' + e.message };
  }
}

// ── Helper: Infer user intent from a group of changes ──────────────────────
function _inferIntent(changes) {
  if (!changes || !changes.length) return null;
  const props = changes.map(c => c.property);
  const types = new Set(changes.map(c => c.type));

  // Check for consistency-fix source
  const allConsistencyFix = changes.every(c => c.source === 'consistency-fix');
  if (allConsistencyFix) return '统一样式一致性';

  // Check for pseudo-state changes
  const pseudoStates = changes.filter(c => c.context && c.context.pseudoState);
  if (pseudoStates.length > 0 && pseudoStates.length === changes.length) {
    return '调整 ' + pseudoStates[0].context.pseudoState + ' 状态样式';
  }

  if (types.has('delete')) return '删除元素';
  if (types.has('reorder') || props.includes('__reorder__')) return '调整元素顺序';
  if (types.has('text') || props.includes('textContent')) return '修改文字内容';

  // Classify properties
  const categories = { color: 0, layout: 0, spacing: 0, typography: 0, size: 0, other: 0 };
  for (const p of props) {
    if (/color|background|fill|opacity/i.test(p)) categories.color++;
    else if (/display|flex|grid|justify|align|order/i.test(p)) categories.layout++;
    else if (/padding|margin|gap/i.test(p)) categories.spacing++;
    else if (/font|text|line-?height|letter-?spacing/i.test(p)) categories.typography++;
    else if (/width|height|top|left|right|bottom|radius/i.test(p)) categories.size++;
    else categories.other++;
  }

  const top = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  const intents = {
    color: '调整颜色/外观',
    layout: '调整布局方式',
    spacing: '调整间距',
    typography: '调整文字样式',
    size: '调整尺寸/位置',
    other: '调整样式',
  };
  return intents[top[0]] || '调整样式';
}

// ── Helper: Build per-element CSS diff summary ──────────────────────────────
function _buildCssDiff(group) {
  if (!group.changes || group.changes.length === 0) return null;

  // Group by CSS rule file
  const byRule = {};
  const noRule = [];

  for (const c of group.changes) {
    const kebab = c.property.replace(/([A-Z])/g, '-$1').toLowerCase();
    const entry = {
      property: kebab,
      from: c.oldValue || null,
      to: c.newValue,
      action: c.source === 'removed' ? 'remove' : (c.oldValue != null && c.oldValue !== '' ? 'modify' : 'add'),
    };
    if (c.pseudoState) entry.pseudoState = c.pseudoState;

    if (c.matchedRule) {
      const ruleKey = c.matchedRule.selector + '@' + c.matchedRule.file;
      if (!byRule[ruleKey]) {
        byRule[ruleKey] = {
          ruleSelector: c.matchedRule.selector,
          file: c.matchedRule.file,
          originalRule: c.matchedRule.fullRuleText || null,
          changes: [],
        };
      }
      byRule[ruleKey].changes.push(entry);
    } else {
      noRule.push(entry);
    }
  }

  const rules = Object.values(byRule);
  if (noRule.length > 0) {
    rules.push({
      ruleSelector: group.selector || '(inline)',
      file: null,
      originalRule: null,
      changes: noRule,
    });
  }

  return rules.length > 0 ? rules : null;
}

module.exports = { startServer };

// ── Helper: Detect cross-element modification patterns ──────────────────────
function _detectPatterns(byElementArr, changes) {
  const patterns = [];

  // Group changes by (property + newValue) across different elements
  const changeGroups = {};
  for (const c of changes) {
    if (!c.selector || c.type === 'delete') continue;
    const key = `${c.property}::${c.value}`;
    if (!changeGroups[key]) {
      changeGroups[key] = {
        property: c.property,
        newValue: c.value,
        oldValues: new Set(),
        elements: [],
        tags: [],
        roles: [],
      };
    }
    const g = changeGroups[key];
    if (!g.elements.includes(c.selector)) {
      g.elements.push(c.selector);
      g.oldValues.add(c.oldValue || '');
      const ctx = c.context || {};
      g.tags.push(ctx.tag || 'unknown');
      if (ctx.role) g.roles.push(ctx.role);
    }
  }

  // Only keep groups with 2+ elements (actual patterns)
  for (const [, g] of Object.entries(changeGroups)) {
    if (g.elements.length < 2) continue;

    const oldVals = Array.from(g.oldValues).filter(Boolean);
    const isSameOld = oldVals.length === 1;
    const commonTag = g.tags.every(t => t === g.tags[0]) ? g.tags[0] : null;

    // Try to derive a common selector
    const commonSelector = _deriveCommonSelector(g.elements, changes);

    const desc = isSameOld
      ? `${g.elements.length} 个${commonTag ? ' <' + commonTag + '>' : ''} 元素都将 ${g.property} 从 ${oldVals[0]} 改为 ${g.newValue}`
      : `${g.elements.length} 个${commonTag ? ' <' + commonTag + '>' : ''} 元素都将 ${g.property} 改为 ${g.newValue}`;

    patterns.push({
      type: 'batch-same-change',
      description: desc,
      elements: g.elements,
      commonSelector: commonSelector,
      commonTag: commonTag,
      change: {
        property: g.property,
        oldValue: isSameOld ? oldVals[0] : oldVals,
        newValue: g.newValue,
      },
      suggestion: commonSelector
        ? `建议修改 ${commonSelector} 的共同样式规则，而非逐个元素修改`
        : `${g.elements.length} 个元素有相同修改，可能共享一条 CSS 规则`,
    });
  }

  return patterns;
}

/** Try to derive a common selector that covers all pattern elements */
function _deriveCommonSelector(selectors, changes) {
  if (selectors.length < 2) return null;

  // Strategy 1: Find shared class across all elements
  const classSets = selectors.map(sel => {
    const c = changes.find(ch => ch.selector === sel);
    return (c && c.context && c.context.classList) ? c.context.classList : [];
  });
  if (classSets.length > 0 && classSets.every(s => s.length > 0)) {
    const shared = classSets[0].filter(cls => classSets.every(s => s.includes(cls)));
    // Filter out utility classes
    const semantic = shared.filter(cls => !/^(text-|bg-|p-|px-|py-|m-|mx-|my-|w-|h-|flex|grid|gap-|rounded|border|shadow|opacity-)/.test(cls));
    if (semantic.length > 0) return '.' + semantic[0];
  }

  // Strategy 2: Find shared parent + common tag
  const tagSets = selectors.map(sel => {
    const c = changes.find(ch => ch.selector === sel);
    return (c && c.context) ? c.context.tag : null;
  });
  const parentSets = selectors.map(sel => {
    const c = changes.find(ch => ch.selector === sel);
    if (c && c.context && c.context.parentClassList) {
      const semantic = c.context.parentClassList.filter(cls => !/^(text-|bg-|p-|px-|py-|m-|mx-|my-|w-|h-|flex|grid|gap-|rounded|border|shadow|opacity-)/.test(cls));
      return semantic.length > 0 ? semantic[0] : null;
    }
    return null;
  });

  const commonTag = tagSets.every(t => t && t === tagSets[0]) ? tagSets[0] : null;
  const commonParent = parentSets.every(p => p && p === parentSets[0]) ? parentSets[0] : null;

  if (commonParent && commonTag) return '.' + commonParent + ' ' + commonTag;
  if (commonTag) return commonTag;

  return null;
}

// ── Helper: Generate modification strategy for a single change ──────────────
function _generateStrategy(change, targetAnalysis) {
  const ctx = change.context || {};
  const prop = change.property;
  const val = change.value;
  const sel = change.selector;
  const kebabProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();

  // Strategy 0: Pseudo-state — modify the :hover/:focus/etc rule
  if (ctx.pseudoState) {
    const state = ctx.pseudoState;
    const isRemoval = change.source === 'removed' || val === null;
    if (isRemoval) {
      if (ctx.matchedRule) {
        return `从 ${ctx.matchedRule.file} 中 "${ctx.matchedRule.selector}" 规则里删除 ${kebabProp} 属性`;
      }
      return `从 ${sel}${state} 规则中删除 ${kebabProp} 属性`;
    }
    if (ctx.tailwindHint && ctx.tailwindHint.confidence !== 'arbitrary') {
      const prefix = state.replace(':', '');
      return `在源码中将 ${prefix}:${ctx.tailwindHint.currentClass} 替换为 ${prefix}:${ctx.tailwindHint.suggestedClass}`;
    }
    if (ctx.matchedRule) {
      return `修改 ${ctx.matchedRule.file} 中 "${ctx.matchedRule.selector}" 规则的 ${kebabProp} 属性为 ${val}`;
    }
    return `修改 ${sel}${state} 的 ${kebabProp} 属性为 ${val}`;
  }

  // Strategy 1: CSS variable — modify the variable, not the property
  if (ctx.cssVariable) {
    const v = ctx.cssVariable;
    const loc = v.file && v.definedIn
      ? `${v.file} 中 ${v.definedIn}`
      : v.definedIn || '样式表';
    return `修改 ${loc} 的 ${v.name} 变量值为对应新值（当前值: ${v.value || '未知'}）`;
  }

  // Strategy 2: Tailwind — replace class
  if (ctx.tailwindHint) {
    const tw = ctx.tailwindHint;
    if (tw.confidence !== 'arbitrary' && tw.currentClass && tw.suggestedClass) {
      return `在源码中将 class "${tw.currentClass}" 替换为 "${tw.suggestedClass}"`;
    }
    if (tw.suggestedClass) {
      return `在源码中添加 class "${tw.suggestedClass}"${tw.currentClass ? `（替换 "${tw.currentClass}"）` : ''}`;
    }
  }

  // Strategy 3: Matched CSS rule — modify the rule in its file
  if (ctx.matchedRule) {
    const r = ctx.matchedRule;
    return `修改 ${r.file} 中 "${r.selector}" 规则的 ${kebabProp} 属性（当前值: ${r.value}）`;
  }

  // Strategy 4: Inline style origin
  if (ctx.styleOrigin === 'inline') {
    return `修改元素 ${sel} 的 inline style 中的 ${prop}`;
  }

  // Strategy 5: Based on target file type
  if (targetAnalysis) {
    if (targetAnalysis.type === 'single-file-html') {
      return targetAnalysis.hasInlineStyles
        ? `在 <style> 块中添加或修改 ${sel} { ${kebabProp}: ${val} }`
        : `为元素 ${sel} 添加 inline style: ${kebabProp}: ${val}`;
    }
    if (targetAnalysis.type === 'build-artifact') {
      return `这是构建产物，需在源码中找到对应组件修改 ${kebabProp} 属性`;
    }
  }

  return null;
}

// ── Helper: Generate group-level strategy summary ───────────────────────────
function _generateGroupStrategy(group, targetAnalysis, changes) {
  // Find the original changes for this group to access full context
  const groupChanges = changes.filter(c => c.selector === group.selector);
  if (!groupChanges.length) return null;

  // If all changes have the same strategy file target, summarize
  const strategies = groupChanges.map(c => c.strategy).filter(Boolean);
  if (!strategies.length) return null;

  // Check for CSS variable pattern
  const varChanges = groupChanges.filter(c => c.context && c.context.cssVariable);
  if (varChanges.length > 0) {
    const varNames = [...new Set(varChanges.map(c => c.context.cssVariable.name))];
    const file = varChanges[0].context.cssVariable.file || '样式表';
    return `修改 ${file} 中的 CSS 变量: ${varNames.join(', ')}`;
  }

  // Check for Tailwind pattern
  const twChanges = groupChanges.filter(c => c.context && c.context.tailwindHint);
  if (twChanges.length > 0) {
    return `在源码中替换 Tailwind class（共 ${twChanges.length} 个 class 变更）`;
  }

  // Check for matched rule pattern
  const ruleChanges = groupChanges.filter(c => c.context && c.context.matchedRule);
  if (ruleChanges.length > 0) {
    const files = [...new Set(ruleChanges.map(c => c.context.matchedRule.file))];
    const selectors = [...new Set(ruleChanges.map(c => c.context.matchedRule.selector))];
    if (files.length === 1 && selectors.length === 1) {
      return `修改 ${files[0]} 中 "${selectors[0]}" 规则`;
    }
    return `修改 ${files.join(', ')} 中的对应 CSS 规则`;
  }

  // Fallback based on target analysis
  if (targetAnalysis && targetAnalysis.type === 'single-file-html') {
    return `修改此 HTML 文件中 ${group.selector} 的样式`;
  }

  return strategies[0] || null;
}
