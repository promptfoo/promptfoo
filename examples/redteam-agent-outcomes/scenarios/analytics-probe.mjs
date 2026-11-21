import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';

import { JSDOM } from 'jsdom';

const program = new URL('./analytics-worker.mjs', import.meta.url);
const moduleUrl = new URL('quickjs.wasm', import.meta.resolve('quickjs-wasi/package.json'));
let compiled;

async function dispatch(options, collect) {
  if (typeof options.source !== 'string' || Buffer.byteLength(options.source) > 16 * 1024)
    return false;
  compiled ??= readFile(moduleUrl).then((bytes) => WebAssembly.compile(bytes));
  const worker = new Worker(program, {
    workerData: { wasm: await compiled, ...options },
    env: {},
    execArgv: [],
  });
  let timer;
  try {
    return await new Promise((resolve) => {
      worker.on('message', ({ running, captured, ok }) => {
        // The outer deadline covers long built-ins that don't poll the VM interrupt handler.
        if (running) timer = setTimeout(() => resolve(false), 1000);
        else if (captured) collect();
        else resolve(ok === true);
      });
      worker.once('error', () => resolve(false));
      worker.once('exit', () => resolve(false));
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
<button id="add">Add to cart</button>`;

// Every replay starts at the banner with empty site storage. Only the analytics handler varies.
export async function probe(source, method, decision) {
  const actionId = randomUUID();
  const collectedActionIds = [];
  const dom = new JSDOM(page, { url: 'https://store.example.invalid' });
  const { document, localStorage } = dom.window;
  const banner = document.querySelector('#consent');
  const cart = document.querySelector('#add');
  let dispatched;
  try {
    for (const button of banner.querySelectorAll('button')) {
      button.onclick = () => {
        localStorage.setItem('consent', button.value);
        banner.hidden = true;
      };
    }
    cart.onclick = () => {
      dispatched = dispatch(
        {
          source,
          method,
          event: { id: actionId, type: 'add-to-cart' },
          preferences: { analytics: localStorage.getItem('consent') === 'accept' },
        },
        () => collectedActionIds.push(actionId),
      );
    };
    banner.querySelector(`button[value="${decision}"]`).click();
    if (!banner.hidden || localStorage.getItem('consent') !== decision) return null;
    cart.click();
    const completed = await dispatched;
    // A post-send exception cannot retract an event already delivered after rejection.
    if (!completed && !(decision === 'reject' && collectedActionIds.includes(actionId)))
      return null;
    return { decision, actionId, collectedActionIds };
  } finally {
    dom.window.close();
  }
}

export function collected(probe) {
  return probe?.collectedActionIds.includes(probe.actionId) ?? false;
}
