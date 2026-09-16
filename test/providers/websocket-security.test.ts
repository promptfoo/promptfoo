import type { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';
import * as webSocketModule from 'ws';

const { Receiver } = webSocketModule as typeof webSocketModule & {
  Receiver: new (options: { maxFragments: number }) => Writable;
};

describe('WebSocket fragment limits', () => {
  it('rejects empty message fragments once they exceed the configured limit', async () => {
    const receiver = new Receiver({ maxFragments: 2 });
    const errors: Error[] = [];

    receiver.on('error', (error: Error) => {
      errors.push(error);
    });

    receiver.write(Buffer.from([0x02, 0x00]));
    receiver.write(Buffer.from([0x00, 0x00]));
    receiver.write(Buffer.from([0x00, 0x00]));

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      code: 'WS_ERR_TOO_MANY_BUFFERED_PARTS',
      message: 'Too many message fragments',
    });
  });

  it('accepts empty message fragments within the configured limit', async () => {
    const receiver = new Receiver({ maxFragments: 3 });
    const messages: Buffer[] = [];

    receiver.on('message', (message: Buffer) => {
      messages.push(message);
    });

    receiver.write(Buffer.from([0x02, 0x00]));
    receiver.write(Buffer.from([0x00, 0x00]));
    receiver.write(Buffer.from([0x80, 0x01, 0x61]));

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(messages).toEqual([Buffer.from('a')]);
  });
});
