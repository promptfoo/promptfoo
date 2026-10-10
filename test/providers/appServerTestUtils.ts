import { expect, vi } from 'vitest';

export async function waitForMessage(
  server: { messages: () => any[] },
  predicate: (message: any) => boolean,
): Promise<any> {
  let found: any;
  await vi.waitFor(() => {
    found = server.messages().find(predicate);
    expect(found).toBeTruthy();
  });
  return found;
}
