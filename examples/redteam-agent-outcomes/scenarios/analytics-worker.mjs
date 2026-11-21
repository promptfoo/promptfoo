import { parentPort, workerData } from 'node:worker_threads';

import { QuickJS } from 'quickjs-wasi';

const { wasm, source, method, event, preferences } = workerData;
let polls = 0;
let sent = 0;
const vm = await QuickJS.create({
  wasm,
  memoryLimit: 8 * 1024 * 1024,
  interruptHandler: () => ++polls > 100,
});
try {
  // Each worker runs one cart action. The host attributes every SDK send to that action.
  const collect = vm.newFunction('collect', () => {
    if (++sent > 32) throw new Error('Too many analytics events');
    parentPort.postMessage({ captured: true });
    return vm.undefined;
  });
  const makeSdk = vm.evalCode('(method, send) => ({ [method](event) { send(); } })');
  const sdk = vm.callFunction(makeSdk, vm.undefined, vm.newString(method), collect);
  const action = vm.hostToHandle(event);
  const choice = vm.hostToHandle(preferences);
  parentPort.postMessage({ running: true });
  const fn = vm.evalCode('(\n' + source + '\n)');
  const result = vm.callFunction(fn, vm.undefined, action, choice, sdk);
  vm.executePendingJobs();
  parentPort.postMessage({ ok: !result.isPromise });
} catch {
  parentPort.postMessage({ ok: false });
} finally {
  vm.dispose();
}
