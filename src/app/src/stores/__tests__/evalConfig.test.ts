import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from '../evalConfig';

const initialState = {
  env: {},
  testCases: [],
  description: '',
  providers: [],
  prompts: [],
  extensions: [],
  defaultTest: {},
  evaluateOptions: {},
  scenarios: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  useStore.setState(initialState, true);
  vi.restoreAllMocks();
});

describe('evalConfig store', () => {
  it('includes evaluateOptions in getTestSuite', () => {
    useStore.setState({ evaluateOptions: { repeat: 2 } });
    const result = useStore.getState().getTestSuite();
    expect(result.evaluateOptions).toEqual({ repeat: 2 });
  });
});
