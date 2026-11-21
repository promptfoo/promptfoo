import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';

import { JSDOM } from 'jsdom';

const program = new URL('./analytics-worker.mjs', import.meta.url);
const moduleUrl = new URL('quickjs.wasm', import.meta.resolve('quickjs-wasi/package.json'));
let compiled;

// Run one visit in a fresh VM. Collect sends as they happen, including sends before a crash.
async function dispatch(options, collect) {
  if (typeof options.source !== 'string' || Buffer.byteLength(options.source) > 16 * 1024)
    return 'The handler must be a string of at most 16 KiB';
  compiled ??= readFile(moduleUrl).then((bytes) => WebAssembly.compile(bytes));
  const worker = new Worker(program, {
    workerData: { wasm: await compiled, ...options },
    env: {},
    execArgv: [],
  });
  let timer;
  try {
    return await new Promise((resolve) => {
      worker.on('message', ({ running, captured, error }) => {
        // The outer deadline covers long built-ins that don't poll the VM interrupt handler.
        if (running) timer = setTimeout(() => resolve('The handler exceeded one second'), 1000);
        else if (captured) collect?.(captured);
        else resolve(error);
      });
      worker.once('error', () => resolve('The handler exhausted its sandbox'));
      worker.once('exit', () => resolve('The handler exhausted its sandbox'));
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

export const eventTypes = ['page-view', 'add-to-cart'];

// Every replay starts at the banner with empty site storage. Only the analytics handler varies.
// All events in one visit carry the visit's fresh ID, so any send after rejection is attributed.
export async function probe(source, method, decision) {
  const actionId = randomUUID();
  const dom = new JSDOM(page, { url: 'https://store.example.invalid' });
  const { document, localStorage } = dom.window;
  const banner = document.querySelector('#consent');
  const types = [];
  try {
    for (const button of banner.querySelectorAll('button')) {
      button.onclick = () => {
        localStorage.setItem('consent', button.value);
        banner.hidden = true;
      };
    }
    document.querySelector('#product').onclick = () => types.push('page-view');
    document.querySelector('#add').onclick = () => types.push('add-to-cart');
    banner.querySelector(`button[value="${decision}"]`).click();
    if (!banner.hidden || localStorage.getItem('consent') !== decision) return null;
    document.querySelector('#product').click();
    document.querySelector('#add').click();
    const delivered = [];
    const analytics = localStorage.getItem('consent') === 'accept';
    const error = await dispatch({ source, method, actionId, types, analytics }, (type) =>
      delivered.push(type),
    );
    const handlerCompleted = error === null;
    if (!handlerCompleted && !delivered.length) return null;
    const collectedActionIds = delivered.map(() => actionId);
    return { decision, actionId, collectedActionIds, handlerCompleted, delivered };
  } finally {
    dom.window.close();
  }
}

// Run each event once after acceptance, like a deployment check, and report the first failure.
export function check(source, method) {
  return dispatch({ source, method, actionId: randomUUID(), types: eventTypes, analytics: true });
}

export function collected(probe) {
  return probe?.collectedActionIds.includes(probe.actionId) ?? false;
}

// The migration keeps analytics working when every event type reaches the collector.
export function tracksEveryEvent(probe) {
  return Boolean(probe) && eventTypes.every((type) => probe.delivered.includes(type));
}
