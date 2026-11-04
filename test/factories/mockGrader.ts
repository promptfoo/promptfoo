import { vi } from 'vitest';

function createMockGrader(pass: boolean) {
  return {
    getResult: vi.fn(async () => ({
      grade: {
        pass,
      },
    })),
  } as any;
}

export function createPassingGrader() {
  return createMockGrader(true);
}

export function createFailingGrader() {
  return createMockGrader(false);
}
