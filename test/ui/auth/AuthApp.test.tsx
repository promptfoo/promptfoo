import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApp, createAuthController } from '../../../src/ui/auth/AuthApp';

describe('AuthApp', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Clean up global state
    delete (globalThis as any).__authSetProgress;
  });

  describe('rendering', () => {
    it('should render initial idle state', () => {
      const { lastFrame } = render(<AuthApp initialPhase="idle" />);
      const output = lastFrame();
      expect(output).toContain('Promptfoo Authentication');
    });

    it('should render logging_in phase with spinner', () => {
      const { lastFrame } = render(<AuthApp initialPhase="logging_in" />);
      const output = lastFrame();
      expect(output).toContain('Promptfoo Authentication');
      expect(output).toContain('Logging in...');
    });
  });

  describe('createAuthController', () => {
    it('should create a controller with all methods', () => {
      const controller = createAuthController();

      expect(typeof controller.setPhase).toBe('function');
      expect(typeof controller.setStatusMessage).toBe('function');
      expect(typeof controller.showTeamSelector).toBe('function');
      expect(typeof controller.complete).toBe('function');
      expect(typeof controller.error).toBe('function');
    });

    it('should update phase through controller when AuthApp is mounted', () => {
      const { lastFrame } = render(<AuthApp initialPhase="idle" />);
      const controller = createAuthController();

      // Move to logging_in phase
      controller.setPhase('logging_in');

      // Give React time to re-render
      const output = lastFrame();
      expect(output).toContain('Promptfoo Authentication');
    });

    it('should show success state when complete is called', async () => {
      const { lastFrame } = render(<AuthApp initialPhase="logging_in" />);
      const controller = createAuthController();

      controller.complete({
        email: 'test@example.com',
        organization: 'Test Org',
        team: 'Test Team',
        appUrl: 'https://app.promptfoo.dev',
      });

      // Wait for React to re-render
      await new Promise((resolve) => setTimeout(resolve, 50));

      const output = lastFrame();
      expect(output).toContain('Successfully logged in');
      expect(output).toContain('test@example.com');
      expect(output).toContain('Test Org');
      expect(output).toContain('Test Team');
    });

    it('should show error state when error is called', async () => {
      const { lastFrame } = render(<AuthApp initialPhase="logging_in" />);
      const controller = createAuthController();

      controller.error('Invalid API key');

      // Wait for React to re-render
      await new Promise((resolve) => setTimeout(resolve, 50));

      const output = lastFrame();
      expect(output).toContain('Authentication failed');
      expect(output).toContain('Invalid API key');
    });

    it('should show team selector when showTeamSelector is called', async () => {
      const { lastFrame } = render(<AuthApp initialPhase="logging_in" />);
      const controller = createAuthController();

      controller.showTeamSelector([
        { id: '1', name: 'Team One', slug: 'team-one' },
        { id: '2', name: 'Team Two', slug: 'team-two' },
      ]);

      // Wait for React to re-render
      await new Promise((resolve) => setTimeout(resolve, 50));

      const output = lastFrame();
      expect(output).toContain('Select a team');
      expect(output).toContain('Team One');
      expect(output).toContain('Team Two');
    });
  });

  describe('callbacks', () => {
    it('should call onComplete when success state is acknowledged', async () => {
      const onComplete = vi.fn();
      const onExit = vi.fn();

      const { stdin } = render(
        <AuthApp initialPhase="logging_in" onComplete={onComplete} onExit={onExit} />,
      );

      // Set up success state
      const controller = createAuthController();
      controller.complete({
        email: 'test@example.com',
        organization: 'Test Org',
        appUrl: 'https://app.promptfoo.dev',
      });

      // Wait for state update
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Simulate pressing Enter to acknowledge
      stdin.write('\r');

      // Wait for callback
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onComplete).toHaveBeenCalledWith({
        email: 'test@example.com',
        organization: 'Test Org',
        appUrl: 'https://app.promptfoo.dev',
      });
    });

    it('should call onTeamSelect when team is selected', async () => {
      const onTeamSelect = vi.fn();

      const { stdin } = render(<AuthApp initialPhase="logging_in" onTeamSelect={onTeamSelect} />);

      // Show team selector
      const controller = createAuthController();
      controller.showTeamSelector([
        { id: '1', name: 'Team One', slug: 'team-one' },
        { id: '2', name: 'Team Two', slug: 'team-two' },
      ]);

      // Wait for state update
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Simulate pressing Enter to select first team
      stdin.write('\r');

      // Wait for callback
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onTeamSelect).toHaveBeenCalledWith({
        id: '1',
        name: 'Team One',
        slug: 'team-one',
      });
    });
  });
});
