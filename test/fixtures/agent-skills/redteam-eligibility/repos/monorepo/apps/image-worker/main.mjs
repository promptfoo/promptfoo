import * as gateway from './gateway.mjs';
import { processUpload } from './worker.mjs';

export function start(queue, records) {
  queue.consume('uploaded-images', (job) => processUpload(job, gateway, records));
}
