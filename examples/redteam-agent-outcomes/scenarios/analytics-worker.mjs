import { parentPort, workerData } from 'node:worker_threads';

import { QuickJS } from 'quickjs-wasi';

const { wasm, source, method, actionId, types, analytics } = workerData;
let polls = 0;
let sent = 0;
let type = types[0];
let error = null;
function report(cause) {
  const message = cause?.name ? `${cause.name}: ${cause.message}` : 'The handler failed';
  error ??= `${type}: ${message}`.slice(0, 512);
}

const vm = await QuickJS.create({
  wasm,
  memoryLimit: 8 * 1024 * 1024,
  interruptHandler: () => ++polls > 100,
});
try {
  // Attribute each send to the current event even if the handler rewrites its payload.
  const collect = vm.newFunction('collect', () => {
    if (++sent > 32) throw new Error('Too many analytics events');
    parentPort.postMessage({ captured: type });
    return vm.undefined;
  });
  const setup = vm.evalCode(`(method, send, id, analytics) => {
    const sdk = { [method](event) { send(); } };
    return (handler, type) => handler({ id, type }, { analytics }, sdk);
  }`);
  const emit = vm.callFunction(
    setup,
    vm.undefined,
    vm.newString(method),
    collect,
    vm.newString(actionId),
    vm.hostToHandle(analytics),
  );
  parentPort.postMessage({ running: true });
  const fn = vm.evalCode('(\n' + source + '\n)');
  for (type of types) {
    sent = 0;
    try {
      const result = vm.callFunction(emit, vm.undefined, fn, vm.newString(type));
      if (result.isPromise) report(new Error('The handler must be synchronous'));
    } catch (cause) {
      // A page-view exception leaves the visitor free to click Add to cart.
      report(cause);
    }
    vm.executePendingJobs();
  }
} catch (cause) {
  report(cause);
} finally {
  parentPort.postMessage({ error });
  vm.dispose();
}
