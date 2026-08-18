#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const path = require('path');
const fs = require('fs');
const http = require('http');

program
  .name('page-editor')
  .description('Visual in-place editor for HTML pages — outputs page-edits.json for agent application')
  .version('2.3.4')
  .option('-u, --url <url>', 'Target URL to edit (e.g. http://localhost:3000/page.html)')
  .option('-f, --file <path>', 'Target HTML file path to edit (absolute or relative)')
  .option('-p, --port <number>', 'Port for the editor server (default: auto from 7788)')
  .option('-o, --output <path>', 'Output path for page-edits.json', './page-edits.json')
  .option('-m, --monitor', 'Monitor mode: block until save/close, output JSON and exit (10 min timeout)')
  .option('-w, --wait', 'Alias for --monitor (backward compatible)')
  .option('-r, --reload', 'Reload mode: notify running editor to refresh browser (replaces curl)')
  .option('-t, --timeout <seconds>', 'Override default timeout for --monitor mode (seconds). 0 = 10 min default', '0')
  .addHelpText('after', `
Examples:
  page-editor --file ./output.html &
  page-editor --monitor
  page-editor --reload
`);

program.parse(process.argv);
const opts = program.opts();

const isMonitorMode = opts.monitor || opts.wait;
const isReloadMode = opts.reload;

// ── Discover port ─────────────────────────────────────────────────────────
function discoverPort() {
  if (opts.port) return parseInt(opts.port, 10);

  // Priority 1: target file's directory (project isolation)
  // When used as global skill, each project's editor writes .page-editor.port
  // to its own target file directory, not CWD.
  if (opts.file) {
    var targetDir = path.resolve(process.cwd(), path.dirname(opts.file));
    var projectPortFile = path.join(targetDir, '.page-editor.port');
    try {
      var content = fs.readFileSync(projectPortFile, 'utf8').trim();
      try {
        var data = JSON.parse(content);
        if (data.port > 0 && data.port < 65536) {
          console.log('[page-editor] Found port file in target directory: ' + projectPortFile);
          return data.port;
        }
      } catch (e) {
        var p = parseInt(content, 10);
        if (p > 0 && p < 65536) return p;
      }
    } catch (e) { /* not found in target dir */ }
  }

  // Priority 2: CWD (backward compatible, for URL mode or legacy usage)
  var portFilePath = path.join(process.cwd(), '.page-editor.port');
  try {
    var content = fs.readFileSync(portFilePath, 'utf8').trim();
    try {
      var data = JSON.parse(content);
      if (data.port > 0 && data.port < 65536) return data.port;
    } catch (e) { /* not JSON, try plain number */ }
    var p = parseInt(content, 10);
    if (p > 0 && p < 65536) return p;
  } catch (e) { /* not found */ }

  return 7788;
}

const port = discoverPort();

// ══════════════════════════════════════════════════════════════════════════
// ── Reload mode: POST /api/reload via Node.js http (no curl needed) ─────
// ══════════════════════════════════════════════════════════════════════════
if (isReloadMode) {
  const p = discoverPort();
  const postData = JSON.stringify({ source: 'cli-reload' });
  const req = http.request(`http://localhost:${p}/api/reload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
  }, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('[page-editor] reload signal sent — browser will refresh now');
      } else {
        console.error(`[page-editor] reload failed: status ${res.statusCode} ${body}`);
      }
      process.exit(res.statusCode === 200 ? 0 : 1);
    });
  });
  req.on('error', (err) => {
    console.error(`[page-editor] cannot reach editor server at localhost:${p}: ${err.message}`);
    process.exit(1);
  });
  req.setTimeout(5000, () => { req.destroy(); process.exit(1); });
  req.write(postData);
  req.end();

// ══════════════════════════════════════════════════════════════════════════
// ── Monitor mode: block until save/close ────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
} else if (isMonitorMode) {
  // Port file discovery: prefer target file's directory, then CWD
  let portFilePath = null;
  if (opts.file) {
    var _targetDir = path.resolve(process.cwd(), path.dirname(opts.file));
    var _projectPortFile = path.join(_targetDir, '.page-editor.port');
    if (fs.existsSync(_projectPortFile)) {
      portFilePath = _projectPortFile;
    }
  }
  if (!portFilePath) {
    portFilePath = path.join(process.cwd(), '.page-editor.port');
  }
  let pollAttempts = 0;
  const MAX_POLL = 50;

  function tryConnect() {
    const p = discoverPort();
    if (p === 7788) {
      try {
        fs.readFileSync(portFilePath, 'utf8');
        monitorForSave(p);
        return;
      } catch (e) {
        pollAttempts++;
        if (pollAttempts >= MAX_POLL) {
          console.error('\n  Error: no .page-editor.port file found after 10 seconds.');
          console.error('  The editor server is not running. Start it first.\n');
          process.exit(1);
        }
        setTimeout(tryConnect, 200);
        return;
      }
    }
    monitorForSave(p);
  }

  try {
    const content = fs.readFileSync(portFilePath, 'utf8').trim();
    const p = parseInt(content, 10);
    if (p > 0 && p < 65536) {
      monitorForSave(p);
    } else {
      tryConnect();
    }
  } catch (e) {
    console.log('  Waiting for editor server...');
    tryConnect();
  }

// ══════════════════════════════════════════════════════════════════════════
// ── Normal mode: start the editor server ────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
} else {
  if (!opts.url && !opts.file) {
    console.error('\n  Error: specify either --url <url> or --file <path>\n');
    program.help();
    process.exit(1);
  }

  const outputPath = path.resolve(process.cwd(), opts.output);
  const targetFile = opts.file ? path.resolve(process.cwd(), opts.file) : null;
  const targetUrl  = opts.url  || null;

  const { startServer } = require('../server/index');
  startServer({ targetFile, targetUrl, port, outputPath });
}

// ── Monitor-for-save implementation ─────────────────────────────────────
function monitorForSave(port) {
  const explicitTimeout = parseInt(opts.timeout, 10) || 0;
  const timeoutSec = explicitTimeout > 0 ? explicitTimeout : 600;
  const url = `http://localhost:${port}/api/wait-for-save?timeout=${timeoutSec}`;

  let pingRetries = 0;
  const MAX_PING_RETRIES = 15;

  function tryPing() {
    const pingReq = http.get(`http://localhost:${port}/api/ping`, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode === 200) {
          doWait();
        } else {
          console.error(`\n  Error: page-editor server on port ${port} returned status ${res.statusCode}\n`);
          process.exit(1);
        }
      });
    });
    pingReq.on('error', () => {
      pingRetries++;
      if (pingRetries < MAX_PING_RETRIES) {
        setTimeout(tryPing, 300);
      } else {
        console.error(`\n  Error: no page-editor server running on port ${port}`);
        console.error(`  Start the editor first: page-editor --file <path> &\n`);
        process.exit(1);
      }
    });
    pingReq.setTimeout(2000, () => {
      pingReq.destroy();
      pingRetries++;
      if (pingRetries < MAX_PING_RETRIES) {
        setTimeout(tryPing, 300);
      } else {
        console.error(`\n  Error: page-editor server on port ${port} not responding\n`);
        process.exit(1);
      }
    });
  }

  tryPing();

  function doWait() {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(body);

            if (data.type === 'timeout') {
              console.log(JSON.stringify(data));
              process.exit(0);
            }

            if (data.type === 'page-editor:closed') {
              console.log('\n--- PAGE EDITOR CLOSED ---');
              console.log('User closed design mode.');
              console.log(JSON.stringify(data, null, 2));
              console.log('--- END ---\n');
              process.exit(0);
            }

            // Save received
            console.log('\n--- PAGE EDITOR CHANGES ---');
            console.log(`Target: ${data.target || 'unknown'}`);
            if (data.byElement) {
              console.log(`Elements changed: ${data.byElement.length}`);
              for (const group of data.byElement) {
                const props = (group.cssDiff || []).flatMap(r => r.changes.map(c => c.property)).join(', ');
                console.log(`  ${group.selector || '[deleted]'} (${group.tag}) — ${props}`);
              }
            }
            if (data.patterns && data.patterns.length) {
              console.log(`Patterns: ${data.patterns.length}`);
              for (const p of data.patterns) {
                console.log(`  -> ${p.description}`);
              }
            }
            console.log(`\nOutput: ${data.file || 'page-edits.json'}`);
            console.log(JSON.stringify(data, null, 2));
            console.log('--- END CHANGES ---\n');
          } catch (e) {
            console.log(body);
          }
          process.exit(0);
        } else if (res.statusCode === 408) {
          console.log(JSON.stringify({ type: 'timeout' }));
          process.exit(0);
        } else {
          console.error(`\n  Error: unexpected status ${res.statusCode}\n`);
          process.exit(1);
        }
      });
    });

    req.on('error', (err) => {
      console.error(`\n  Error connecting to page-editor server: ${err.message}\n`);
      process.exit(1);
    });

    const clientTimeout = (timeoutSec + 10) * 1000;
    req.setTimeout(clientTimeout, () => {
      req.destroy();
      console.log(JSON.stringify({ type: 'timeout' }));
      process.exit(0);
    });
  }
}
