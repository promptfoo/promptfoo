import { vi } from 'vitest';

/** Advance the fake clock on reads only, without prefetching chunks. */
export function timedStream(chunks: (string | Uint8Array)[], delay: number, tailDelay = 0) {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream(
    {
      pull(controller) {
        vi.setSystemTime(Date.now() + (index < chunks.length ? delay : tailDelay));
        if (index === chunks.length) {
          controller.close();
        } else {
          const chunk = chunks[index++];
          controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
        }
      },
    },
    { highWaterMark: 0 },
  );
}
