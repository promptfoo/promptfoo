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
  // A bounded event ID is the sole outbound capability. The host owns the collector.
  const collect = vm.newFunction('collect', (id) => {
    if (++sent > 32 || !id?.isString) throw new Error('Invalid analytics event');
    const value = id.toString();
    if (!value || value.length > 128) throw new Error('Invalid analytics event');
    parentPort.postMessage({ eventId: value });
    return vm.undefined;
  });
  const makeSdk = vm.evalCode('(method, send) => ({ [method](event) { send(event.id); } })');
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
