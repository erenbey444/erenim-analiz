import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const source = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
function compile(text) {
  return ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
}
const pause = () => new Promise(resolve => setTimeout(resolve, 350));

test('score updates do not trigger additional API requests; hidden tabs stop polling', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test', pretendToBeVisual: true });
  const { window } = dom;
  let requests = 0;
  let interval;
  let match = { home: 'İstanbul', away: 'Ankara', status: 'Canlı', minute: 40, score: '1-0' };
  const context = vm.createContext({
    exports: {}, window, document: window.document, localStorage: window.localStorage,
    Element: window.Element, MutationObserver: window.MutationObserver,
    setTimeout: window.setTimeout.bind(window),
    setInterval: callback => { interval = callback; },
    fetch: async () => { requests++; return { ok: true, json: async () => ({ matches: [match] }) }; },
  });
  // The implementation uses window.setInterval; keep the test clock explicit.
  window.setInterval = callback => { interval = callback; return 1; };
  vm.runInContext(compile(source('liveEditorEnhancer.ts')), context);
  context.exports.startLiveEditorEnhancer();
  window.document.querySelector('#root').innerHTML = `
    <div class="editor-coupons-page"><div class="editor-head-actions"></div>
    <div class="editor-coupon-card"><div class="editor-coupon-card-head"><small>25.10.2026</small></div>
    <div class="editor-selection"><div class="editor-selection-meta"><strong>İstanbul - Ankara</strong></div>
    <div class="editor-selection-pick"><span>MS1</span></div></div></div></div>`;
  await pause();
  assert.equal(requests, 1, 'enhancer DOM writes must not cause a request loop');
  const ball = window.document.querySelector('.mini-ball');
  assert.ok(ball);
  interval();
  await pause();
  assert.equal(requests, 2, 'one request per scheduled refresh');
  assert.equal(window.document.querySelector('.mini-ball'), ball, 'unchanged viewer is reused');
  Object.defineProperty(window.document, 'hidden', { configurable: true, value: true });
  interval();
  await pause();
  assert.equal(requests, 2, 'background tabs do not poll');
  Object.defineProperty(window.document, 'hidden', { configurable: true, value: false });
  match = { ...match, status: 'MS', minute: 90 };
  interval();
  await pause();
  assert.equal(requests, 3);
  assert.equal(window.document.querySelector('.editor-mini-viewer'), null);
  assert.match(window.document.querySelector('.editor-live-enhanced').textContent, /FT/);
  dom.window.close();
});

test('concurrent archive consumers share a worker and the resolved array', async () => {
  const workers = [];
  class Worker {
    constructor() { workers.push(this); }
    postMessage() {}
    terminate() { this.terminated = true; }
  }
  const context = vm.createContext({ exports: {}, Worker, URL, document: { baseURI: 'https://example.test/' }, window: { setTimeout, clearTimeout } });
  vm.runInContext(compile(source('loadHistory.ts').replace('import.meta.url', "'https://example.test/src/loadHistory.ts'")), context);
  const first = context.exports.loadHistory();
  const second = context.exports.loadHistory();
  assert.equal(first, second);
  assert.equal(workers.length, 1);
  const rows = [{ home: 'A', away: 'B' }];
  workers[0].onmessage({ data: { ok: true, rows } });
  assert.equal(await first, rows);
  assert.equal(await context.exports.loadHistory(), rows);
  assert.equal(workers.length, 1);
  assert.equal(workers[0].terminated, true);
});

test('archive failure can be retried without keeping a dead worker', async () => {
  const workers = [];
  class Worker { constructor() { workers.push(this); } postMessage() {} terminate() {} }
  const context = vm.createContext({ exports: {}, Worker, URL, document: { baseURI: 'https://example.test/' }, window: { setTimeout, clearTimeout } });
  vm.runInContext(compile(source('loadHistory.ts').replace('import.meta.url', "'https://example.test/src/loadHistory.ts'")), context);
  const failed = context.exports.loadHistory();
  workers[0].onmessage({ data: { ok: false, error: 'network' } });
  await assert.rejects(failed, /network/);
  const retry = context.exports.loadHistory();
  assert.equal(workers.length, 2);
  workers[1].onmessage({ data: { ok: true, rows: [{}] } });
  await retry;
});

test('cached Turkish normalization and dates preserve analysis keys', () => {
  const context = vm.createContext({ exports: {} });
  vm.runInContext(compile(source('historyUtils.ts')), context);
  for (const name of ['  İSTANBUL  SPOR ', 'IĞDIR', 'Şanlıurfa', 'Boca Juniors', '']) {
    assert.equal(context.exports.normalizeTeamName(name), name.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' '));
  }
  assert.equal(context.exports.historyTimestamp('25.10.2026'), Date.UTC(2026, 9, 25));
  assert.equal(context.exports.historyTimestamp('2026-10-25'), Date.UTC(2026, 9, 25));
  assert.equal(context.exports.historyTimestamp('unknown'), 0);
});

test('compact worker preserves optional odds and does not invent missing odds', async () => {
  let message;
  let requests = 0;
  const context = vm.createContext({
    exports: {}, URL, self: { postMessage: value => { message = value; } },
    fetch: async () => {
      requests++;
      return { ok: true, json: async () => [
        ['25.10.2026', 'Lig', 'A', 'B', '2-1', '1', 2, 3, 4, 1.8, 1.9],
        ['24.10.2026', 'Lig', 'C', 'D', '0-0', 'X', 2, 3, 4, null, null],
      ] };
    },
  });
  vm.runInContext(compile(source('historyWorker.ts')), context);
  await context.self.onmessage({ data: { url: 'https://example.test/resources/archive.xlsx' } });
  assert.equal(requests, 1, 'compact archive avoids XLSX download/parsing');
  assert.equal(message.ok, true);
  assert.equal(message.rows[0].under25, 1.8);
  assert.equal(message.rows[1].under25, undefined);
  const fallback = vm.runInContext('parseHistory', context)([
    { 'Ev Sahibi': 'A', Deplasman: 'B', Skor: '2-1', MS1: 2, MSX: 3, MS2: 4 },
  ]);
  assert.equal(fallback[0].under25, undefined, 'missing XLSX cells are not zero odds');
});
