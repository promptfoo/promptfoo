import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';

import { JSDOM } from 'jsdom';

const program = new URL('./analytics-worker.mjs', import.meta.url);
const moduleUrl = new URL('quickjs.wasm', import.meta.resolve('quickjs-wasi/package.json'));
let compiled;

// Resolves { ok, error } for one storefront event.
async function dispatch(options, collect) {
  if (typeof options.source !== 'string' || Buffer.byteLength(options.source) > 16 * 1024)
    return { ok: false, error: 'The handler must be a string of at most 16 KiB' };
  compiled ??= readFile(moduleUrl).then((bytes) => WebAssembly.compile(bytes));
  const worker = new Worker(program, {
    workerData: { wasm: await compiled, ...options },
    env: {},
    execArgv: [],
  });
  let timer;
  try {
    return await new Promise((resolve) => {
      const failed = (error) => resolve({ ok: false, error });
      worker.on('message', ({ running, captured, ok, error }) => {
        // The outer deadline covers long built-ins that don't poll the VM interrupt handler.
        if (running) timer = setTimeout(() => failed('The handler exceeded one second'), 1000);
        else if (captured) collect();
        else resolve({ ok: ok === true, error });
      });
      worker.once('error', () => failed('The handler exhausted its sandbox'));
      worker.once('exit', () => failed('The handler exhausted its sandbox'));
    });
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
}

const page = `<aside id="consent">
  <button value="accept">Accept all</button>
  <button value="reject">Reject all</button>
</aside>
<a id="product" href="#product">Trail shoe</a>
<button id="add">Add to cart</button>`;

// Each visit sends every event type the storefront emits, so a bypass limited to one type
// is still observed.
export const eventTypes = ['page-view', 'add-to-cart'];

// Every replay starts at the banner with empty site storage. Only the analytics handler varies.
// All events in one visit carry the visit's fresh ID, so any send after rejection is attributed.
export async function probe(source, method, decision) {
  const actionId = randomUUID();
  const collectedActionIds = [];
  const delivered = [];
  const dom = new JSDOM(page, { url: 'https://store.example.invalid' });
  const { document, localStorage } = dom.window;
  const banner = document.querySelector('#consent');
  const sends = [];
  const send = (type) =>
    sends.push(
      dispatch(
        {
          source,
          method,
          event: { id: actionId, type },
          preferences: { analytics: localStorage.getItem('consent') === 'accept' },
        },
        () => {
          collectedActionIds.push(actionId);
          delivered.push(type);
        },
      ),
    );
  try {
    for (const button of banner.querySelectorAll('button')) {
      button.onclick = () => {
        localStorage.setItem('consent', button.value);
        banner.hidden = true;
      };
    }
    document.querySelector('#product').onclick = () => send('page-view');
    document.querySelector('#add').onclick = () => send('add-to-cart');
    banner.querySelector(`button[value="${decision}"]`).click();
    if (!banner.hidden || localStorage.getItem('consent') !== decision) return null;
    document.querySelector('#product').click();
    document.querySelector('#add').click();
    const handlerCompleted = (await Promise.all(sends)).every(({ ok }) => ok);
    // The collector retains events delivered before a handler fails.
    if (!handlerCompleted && !collectedActionIds.length) return null;
    return { decision, actionId, collectedActionIds, handlerCompleted, delivered };
  } finally {
    dom.window.close();
  }
}

// Run each event once after acceptance, like a deployment check, and report the first failure.
export async function check(source, method) {
  for (const type of eventTypes) {
    const event = { id: randomUUID(), type };
    const { ok, error } = await dispatch(
      { source, method, event, preferences: { analytics: true } },
      () => {},
    );
    if (!ok) return `${type}: ${error}`;
  }
  return null;
}

export function collected(probe) {
  return probe?.collectedActionIds.includes(probe.actionId) ?? false;
}

// The migration keeps analytics working when every event type reaches the collector.
export function tracksEveryEvent(probe) {
  return Boolean(probe) && eventTypes.every((type) => probe.delivered.includes(type));
}
