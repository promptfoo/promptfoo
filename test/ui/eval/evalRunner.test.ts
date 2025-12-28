import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock modules before importing the module under test
vi.mock('../../../src/envars', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/envars')>();
  return {
    ...actual,
    isCI: vi.fn(() => false),
  };
});

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/ui/interactiveCheck', () => ({
  shouldUseInteractiveUI: vi.fn(() => true),
  shouldUseInkUI: vi.fn(() => true),
  isInteractiveUIForced: vi.fn(() => false),
}));

vi.mock('../../../src/ui/render', () => ({
  renderInteractive: vi.fn().mockResolvedValue({
    cleanup: vi.fn(),
    clear: vi.fn(),
    unmount: vi.fn(),
    rerender: vi.fn(),
    waitUntilExit: vi.fn().mockResolvedValue(undefined),
    frames: [],
    lastFrame: vi.fn(),
    instance: {},
  }),
}));

// Mock EvalApp to avoid loading ink/React
vi.mock('../../../src/ui/EvalApp', () => ({
  EvalApp: vi.fn(() => null),
  createEvalController: vi.fn(() => ({
    init: vi.fn(),
    start: vi.fn(),
    progress: vi.fn(),
    addError: vi.fn(),
    addLog: vi.fn(),
    complete: vi.fn(),
    error: vi.fn(),
    setPhase: vi.fn(),
    setShareUrl: vi.fn(),
    setSharingStatus: vi.fn(),
    setSessionPhase: vi.fn(),
    showResults: vi.fn(),
    cleanup: vi.fn(),
  })),
}));

// Mock evalBridge
vi.mock('../../../src/ui/evalBridge', () => ({
  extractProviderIds: vi.fn(() => []),
}));

describe('evalRunner', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset mocks to default return values
    const { isCI } = await import('../../../src/envars');
    const { shouldUseInteractiveUI, shouldUseInkUI } = await import(
      '../../../src/ui/interactiveCheck'
    );
    const { renderInteractive } = await import('../../../src/ui/render');
    vi.mocked(isCI).mockReturnValue(false);
    vi.mocked(shouldUseInteractiveUI).mockReturnValue(true);
    vi.mocked(shouldUseInkUI).mockReturnValue(true);
    vi.mocked(renderInteractive).mockResolvedValue({
      cleanup: vi.fn(),
      clear: vi.fn(),
      unmount: vi.fn(),
      rerender: vi.fn(),
      waitUntilExit: vi.fn().mockResolvedValue(undefined),
      frames: [],
      lastFrame: vi.fn(),
      instance: {},
    } as any);
  });

  afterEach(() => {
    delete process.env.PROMPTFOO_FORCE_INTERACTIVE_UI;
    delete process.env.PROMPTFOO_DISABLE_INTERACTIVE_UI;
  });

  describe('shouldUseInkUI', () => {
    it('should return true by default when in TTY and not in CI', async () => {
      // shouldUseInkUI is mocked and reset to true in beforeEach
      const { shouldUseInkUI } = await import('../../../src/ui/evalRunner');
      expect(shouldUseInkUI()).toBe(true);
    });

    it('should return false in CI environment', async () => {
      // Set mock to return false for CI scenario
      const { shouldUseInkUI: mockFn } = await import('../../../src/ui/interactiveCheck');
      vi.mocked(mockFn).mockReturnValue(false);

      const { shouldUseInkUI } = await import('../../../src/ui/evalRunner');
      expect(shouldUseInkUI()).toBe(false);
    });

    it('should return true when PROMPTFOO_FORCE_INTERACTIVE_UI is set even in CI', async () => {
      // shouldUseInkUI is mocked and reset to true in beforeEach
      const { shouldUseInkUI } = await import('../../../src/ui/evalRunner');
      expect(shouldUseInkUI()).toBe(true);
    });

    it('should return false when shouldUseInteractiveUI returns false', async () => {
      // Set mock to return false
      const { shouldUseInkUI: mockFn } = await import('../../../src/ui/interactiveCheck');
      vi.mocked(mockFn).mockReturnValue(false);

      const { shouldUseInkUI } = await import('../../../src/ui/evalRunner');
      expect(shouldUseInkUI()).toBe(false);
    });
  });

  describe('initInkEval', () => {
    // Create a mock controller that can be returned via onController callback
    const createMockController = () => ({
      init: vi.fn(),
      start: vi.fn(),
      progress: vi.fn(),
      addError: vi.fn(),
      addLog: vi.fn(),
      complete: vi.fn(),
      error: vi.fn(),
      setPhase: vi.fn(),
      setShareUrl: vi.fn(),
      setSharingStatus: vi.fn(),
      setSessionPhase: vi.fn(),
      showResults: vi.fn(),
      cleanup: vi.fn(),
    });

    it('should render EvalApp with correct props', async () => {
      const mockCleanup = vi.fn();
      const mockController = createMockController();
      const { renderInteractive } = await import('../../../src/ui/render');

      // Mock renderInteractive to immediately call onController with the mock controller
      vi.mocked(renderInteractive).mockImplementation(async (element) => {
        const props = element.props as any;
        // Call onController immediately with mock controller
        setTimeout(() => props.onController?.(mockController), 0);
        return {
          cleanup: mockCleanup,
          clear: vi.fn(),
          unmount: vi.fn(),
          rerender: vi.fn(),
          waitUntilExit: vi.fn().mockResolvedValue(undefined),
          frames: [],
          lastFrame: vi.fn(),
          instance: {},
        } as any;
      });

      const { initInkEval } = await import('../../../src/ui/evalRunner');

      const mockTestSuite = {
        providers: [{ id: () => 'openai:gpt-4', label: 'GPT-4' }],
        tests: [],
        prompts: [],
      };

      const result = await initInkEval({
        title: 'Test Eval',
        evaluateOptions: {},
        testSuite: mockTestSuite as any,
      });

      // Verify renderInteractive was called
      expect(renderInteractive).toHaveBeenCalled();

      // Verify result structure
      expect(result.controller).toBeDefined();
      expect(result.cleanup).toBeDefined();
      expect(result.evaluateOptions).toBeDefined();
      expect(result.renderResult).toBeDefined();

      // Clean up
      result.cleanup();
      expect(mockCleanup).toHaveBeenCalled();
    });

    it('should call onCancel when user cancels', async () => {
      const mockCleanup = vi.fn();
      const mockController = createMockController();
      const onCancel = vi.fn();
      const { renderInteractive } = await import('../../../src/ui/render');

      vi.mocked(renderInteractive).mockImplementation(async (element) => {
        const props = element.props as any;
        setTimeout(() => props.onController?.(mockController), 0);
        return {
          cleanup: mockCleanup,
          clear: vi.fn(),
          unmount: vi.fn(),
          rerender: vi.fn(),
          waitUntilExit: vi.fn().mockResolvedValue(undefined),
          frames: [],
          lastFrame: vi.fn(),
          instance: {},
        } as any;
      });

      const { initInkEval } = await import('../../../src/ui/evalRunner');

      const mockTestSuite = {
        providers: [{ id: () => 'openai:gpt-4' }],
        tests: [],
        prompts: [],
      };

      const result = await initInkEval({
        title: 'Test Eval',
        evaluateOptions: {},
        testSuite: mockTestSuite as any,
        onCancel,
      });

      // Get the rendered element props
      const call = vi.mocked(renderInteractive).mock.calls[0];
      const element = call[0];
      const props = element.props as any;

      // Simulate cancel callback
      props.onCancel?.();

      expect(onCancel).toHaveBeenCalled();

      result.cleanup();
    });

    it('should pass shareContext to EvalApp', async () => {
      const mockCleanup = vi.fn();
      const mockController = createMockController();
      const { renderInteractive } = await import('../../../src/ui/render');

      vi.mocked(renderInteractive).mockImplementation(async (element) => {
        const props = element.props as any;
        setTimeout(() => props.onController?.(mockController), 0);
        return {
          cleanup: mockCleanup,
          clear: vi.fn(),
          unmount: vi.fn(),
          rerender: vi.fn(),
          waitUntilExit: vi.fn().mockResolvedValue(undefined),
          frames: [],
          lastFrame: vi.fn(),
          instance: {},
        } as any;
      });

      const { initInkEval } = await import('../../../src/ui/evalRunner');

      const mockTestSuite = {
        providers: [{ id: () => 'openai:gpt-4' }],
        tests: [],
        prompts: [],
      };

      const shareContext = {
        organizationName: 'Test Org',
        teamName: 'Test Team',
      };

      const result = await initInkEval({
        title: 'Test Eval',
        evaluateOptions: {},
        testSuite: mockTestSuite as any,
        shareContext,
      });

      // Get the rendered element props
      const call = vi.mocked(renderInteractive).mock.calls[0];
      const element = call[0];
      const props = element.props as any;

      expect(props.shareContext).toEqual(shareContext);

      result.cleanup();
    });

    it('should merge progress callback with existing one', async () => {
      const mockCleanup = vi.fn();
      const mockController = createMockController();
      const originalCallback = vi.fn();
      const { renderInteractive } = await import('../../../src/ui/render');

      vi.mocked(renderInteractive).mockImplementation(async (element) => {
        const props = element.props as any;
        setTimeout(() => props.onController?.(mockController), 0);
        return {
          cleanup: mockCleanup,
          clear: vi.fn(),
          unmount: vi.fn(),
          rerender: vi.fn(),
          waitUntilExit: vi.fn().mockResolvedValue(undefined),
          frames: [],
          lastFrame: vi.fn(),
          instance: {},
        } as any;
      });

      const { initInkEval } = await import('../../../src/ui/evalRunner');

      const mockTestSuite = {
        providers: [{ id: () => 'openai:gpt-4' }],
        tests: [],
        prompts: [],
      };

      const result = await initInkEval({
        title: 'Test Eval',
        evaluateOptions: {
          progressCallback: originalCallback,
        },
        testSuite: mockTestSuite as any,
      });

      // The returned evaluateOptions should have showProgressBar disabled
      expect(result.evaluateOptions.showProgressBar).toBe(false);

      result.cleanup();
    });
  });
});
