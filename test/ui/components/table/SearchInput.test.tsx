import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { SearchInput } from '../../../../src/ui/components/table/SearchInput';

describe('SearchInput', () => {
  it('should not render when not active', () => {
    const { lastFrame } = render(
      <SearchInput query="test" isActive={false} matchCount={5} totalCount={10} />,
    );

    expect(lastFrame()).toBe('');
  });

  it('should render search prompt and query when active', () => {
    const { lastFrame } = render(
      <SearchInput query="hello" isActive={true} matchCount={5} totalCount={10} />,
    );
    const frame = lastFrame();

    expect(frame).toContain('/');
    expect(frame).toContain('hello');
    expect(frame).toContain('(5/10)');
  });

  it('should show help text for keyboard shortcuts', () => {
    const { lastFrame } = render(
      <SearchInput query="" isActive={true} matchCount={10} totalCount={10} />,
    );
    const frame = lastFrame();

    expect(frame).toContain('[Enter] apply');
    expect(frame).toContain('[Esc] cancel');
  });

  it('should display invalid regex indicator for malformed patterns', () => {
    const { lastFrame } = render(
      <SearchInput query="/[unclosed/" isActive={true} matchCount={0} totalCount={10} />,
    );
    const frame = lastFrame();

    expect(frame).toContain('(invalid regex)');
    // Should not show match count when regex is invalid
    expect(frame).not.toContain('(0/10)');
  });

  it('should display detailed regex error message', () => {
    const { lastFrame } = render(
      <SearchInput query="/[/" isActive={true} matchCount={0} totalCount={10} />,
    );
    const frame = lastFrame()!;

    // Should show the error indicator
    expect(frame).toContain('⚠');
    // Error message from the regex parser
    expect(frame.toLowerCase()).toContain('invalid');
  });

  it('should render valid regex without error', () => {
    const { lastFrame } = render(
      <SearchInput query="/test.*pattern/i" isActive={true} matchCount={3} totalCount={10} />,
    );
    const frame = lastFrame();

    expect(frame).toContain('/test.*pattern/i');
    expect(frame).toContain('(3/10)');
    expect(frame).not.toContain('invalid regex');
  });

  it('should render plain text search without regex validation', () => {
    const { lastFrame } = render(
      <SearchInput query="plain text" isActive={true} matchCount={5} totalCount={10} />,
    );
    const frame = lastFrame();

    expect(frame).toContain('plain text');
    expect(frame).toContain('(5/10)');
    expect(frame).not.toContain('invalid');
  });
});
