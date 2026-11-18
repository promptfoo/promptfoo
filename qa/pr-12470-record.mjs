import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(process.env.VIEWER_ROOT);
const video = process.env.VIDEO_PATH;
const frames = '/tmp/eval-video-frames';
await mkdir(frames, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = Array.from({ length: 120 }, (_, i) => ({
  description: 'Review case ' + String(i + 1).padStart(3, '0'),
  pass: false,
  comment: '',
}));
const requests = [];
let pendingPoll;
const socketQueue = [];
function enqueue(packet) {
  socketQueue.push(packet);
  if (pendingPoll) {
    const res = pendingPoll;
    pendingPoll = undefined;
    res.end(socketQueue.splice(0).join('\x1e'));
  }
}
function json(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
function table(url) {
  const offset = Number(url.searchParams.get('offset') || 0);
  const limit = Number(url.searchParams.get('limit') || 50);
  const mode = url.searchParams.get('filterMode') || 'all';
  const filtered = rows.map((r, i) => ({ ...r, i })).filter((r) => mode !== 'failures' || !r.pass);
  requests.push({ offset, limit, mode, count: filtered.length });
  const metrics = { score: 0, testPassCount: rows.filter((r) => r.pass).length, testFailCount: rows.filter((r) => !r.pass).length, testErrorCount: 0, assertPassCount: 0, assertFailCount: 120, totalLatencyMs: 0, cost: 0, tokenUsage: {}, namedScores: {}, namedScoresCount: {} };
  return {
    table: {
      head: { vars: ['case'], prompts: [{ id: 'demo-prompt', label: 'Demo output', raw: '{{case}}', provider: 'demo', metrics }] },
      body: filtered.slice(offset, offset + limit).map((r) => ({
        testIdx: r.i, vars: [r.description], test: { vars: { case: r.description }, description: r.description },
        outputs: [{ id: 'result-' + r.i, pass: r.pass, score: r.pass ? 1 : 0, text: 'Response for ' + r.description, namedScores: {}, testCase: { vars: { case: r.description } }, latencyMs: 0, cost: 0, failureReason: 1, gradingResult: { pass: r.pass, score: r.pass ? 1 : 0, reason: r.pass ? 'Manual pass' : 'Expected failure', comment: r.comment, componentResults: [] } }],
      })),
    }, config: { description: 'Pagination review demo', prompts: ['{{case}}'], providers: ['demo'], tests: [] }, version: 4,
    totalCount: rows.length, filteredCount: filtered.length, author: null, stats: {},
  };
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:8799');
  if (url.pathname === '/socket.io/') {
    res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
    if (req.method === 'POST') {
      let data = ''; for await (const c of req) data += c;
      if (data.includes('40')) { enqueue('40{"sid":"demo"}'); enqueue('42' + JSON.stringify(['init', { evalId: 'demo' }])); }
      if (data === '3') {}
      res.end('ok'); return;
    }
    if (!url.searchParams.has('sid')) { res.end('0' + JSON.stringify({ sid: 'demo', upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1000000 })); return; }
    if (socketQueue.length) { res.end(socketQueue.splice(0).join('\x1e')); return; }
    pendingPoll = res;
    const t = setTimeout(() => { if (pendingPoll === res) { pendingPoll = undefined; res.end('2'); } }, 10000);
    req.on('close', () => clearTimeout(t));
    return;
  }
  if (url.pathname === '/api/results') return json(res, { data: [{ evalId: 'demo', label: 'Pagination review demo', createdAt: new Date().toISOString() }] });
  if (url.pathname === '/api/eval/demo/table') return json(res, table(url));
  const rating = url.pathname.match(/^\/api\/eval\/demo\/results\/result-(\d+)\/rating$/);
  if (rating && req.method === 'POST') {
    let text = ''; for await (const c of req) text += c;
    const data = JSON.parse(text);
    const row = rows[Number(rating[1])]; row.pass = data.pass; row.comment = data.comment || '';
    json(res, data);
    setTimeout(() => enqueue('42' + JSON.stringify(['update', { evalId: 'demo' }])), 100);
    return;
  }
  if (url.pathname.startsWith('/api/')) return json(res, { data: [], enabled: false });
  let path = resolve(root, '.' + url.pathname);
  if (!path.startsWith(root + '/') || !existsSync(path) || url.pathname.startsWith('/eval/')) path = join(root, 'index.html');
  try {
    const bytes = await readFile(path); const ext = extname(path);
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' })[ext] || 'application/octet-stream');
    res.end(bytes);
  } catch (err) { res.writeHead(404); res.end(String(err)); }
});
await new Promise((r) => server.listen(8799, '127.0.0.1', r));
const chromePath = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
assert.ok(chromePath, 'Chrome is installed');
const chrome = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--remote-debugging-port=9223', '--user-data-dir=/tmp/eval-demo-chrome', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 100; i++) { try { targets = await (await fetch('http://127.0.0.1:9223/json/list')).json(); break; } catch { await sleep(100); } }
assert.ok(targets?.length, 'Chrome debugging endpoint started');
const ws = new WebSocket(targets.find((x) => x.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const waiting = new Map();
ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data); if (m.id && waiting.has(m.id)) { const { resolve, reject } = waiting.get(m.id); waiting.delete(m.id); m.error ? reject(Error(m.error.message)) : resolve(m.result); } if (m.method === 'Runtime.exceptionThrown') console.log('Browser exception:', JSON.stringify(m.params.exceptionDetails).slice(0, 1000)); });
function cdp(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; waiting.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception)); return r.result.value; }
async function waitFor(expression, label) { for (let n = 0; n < 100; n++) { if (await evaluate('Boolean(' + expression + ')')) return; await sleep(150); } throw Error('Timed out: ' + label + '\n' + (await evaluate('document.body.innerText')).slice(0, 2000)); }
async function click(selector) { const ok = await evaluate('(function(){const e=document.querySelector(' + JSON.stringify(selector) + ');if(!e)return false;e.scrollIntoView({block:"nearest"});e.click();return true})()'); assert.ok(ok, selector); }
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: 'http://127.0.0.1:8799/eval/demo?mode=failures' });
let frameNo = 0, recording = false, captureTask;
async function capture() { const r = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 80, fromSurface: true }); await writeFile(join(frames, String(frameNo++).padStart(5, '0') + '.jpg'), Buffer.from(r.data, 'base64')); }
async function startRecording() { recording = true; captureTask = (async () => { while (recording) { const start = Date.now(); await capture(); await sleep(Math.max(0, 125 - (Date.now() - start))); } })(); }
try {
 await waitFor('document.querySelector("[aria-label=\\"Next page\\"]")', 'results table');
 await startRecording(); await sleep(1500);
 await click('[aria-label="Next page"]');
 await waitFor('document.querySelector("[aria-label=\\"Go to page\\"]").value==="2" && document.body.innerText.includes("Review case 051")', 'page 2');
 await sleep(1800);
 await click('[aria-label="Mark test passed"]');
 await waitFor('document.body.innerText.includes("Review case 052") && !document.body.innerText.includes("Review case 051")', 'rating refresh');
 assert.equal(await evaluate('document.querySelector("[aria-label=\\"Go to page\\"]").value'), '2');
 await sleep(1600);
 await click('[aria-label="Edit comment"]');
 await waitFor('document.querySelector("[role=\\"dialog\\"] textarea")', 'comment dialog');
 await evaluate('document.querySelector("[role=\\"dialog\\"] textarea").focus()');
 await cdp('Input.insertText', { text: 'Reviewed on page two' }); await sleep(1300);
 await evaluate('Array.from(document.querySelectorAll("[role=\\"dialog\\"] button")).find(b=>b.textContent.trim()==="Save").click()');
 await waitFor('!document.querySelector("[role=\\"dialog\\"]")', 'save comment');
 await sleep(1800);
 assert.equal(await evaluate('document.querySelector("[aria-label=\\"Go to page\\"]").value'), '2');
 assert.ok(requests.filter((r) => r.offset === 50 && r.mode === 'failures').length >= 3, JSON.stringify(requests));
 console.log('Verified paginated rating/comment refreshes:', JSON.stringify(requests));
} finally {
 recording = false; if (captureTask) await captureTask;
 ws.close(); chrome.kill(); server.closeAllConnections(); server.close();
}
const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '8', '-i', join(frames, '%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', video], { stdio: 'inherit' });
assert.equal(result.status, 0, 'ffmpeg encoded the video');
console.log('Recorded ' + frameNo + ' frames to ' + video);
