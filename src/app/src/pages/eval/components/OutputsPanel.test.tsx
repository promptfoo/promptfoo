import React from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OutputsPanel } from './OutputsPanel';

vi.mock('./Citations', () => ({
  default: vi.fn(({ citations }) => (
    <div data-testid="citations-component" data-citations={JSON.stringify(citations)}>
      Mocked Citations
    </div>
  )),
}));

const MockCodeDisplay: React.FC<{
  title: string;
  content: string;
  showCopyButton?: boolean;
}> = vi.fn(({ title, content, showCopyButton }) => (
  <div>
    <h2>{title}</h2>
    <pre>{content}</pre>
    {showCopyButton && <span data-testid="copy-button-visible">Copy Button Visible</span>}
  </div>
));

describe('OutputsPanel', () => {
  it("should render CodeDisplay components for 'redteamFinalPrompt', 'replayOutput', and 'output' with correct titles and content, and render Citations when all props are provided", () => {
    const props = {
      output: 'This is the original output.',
      replayOutput: 'This is the replay output.',
      redteamFinalPrompt: 'This is the red team prompt.',
      citations: [{ source: 'doc.pdf', content: 'Some citation text' }],
      copiedFields: {},
      hoveredElement: null,
      onCopy: vi.fn(),
      onMouseEnter: vi.fn(),
      onMouseLeave: vi.fn(),
      CodeDisplay: MockCodeDisplay,
    };

    render(<OutputsPanel {...props} />);

    expect(
      screen.getByRole('heading', { name: 'Modified User Input (Red Team)' }),
    ).toBeInTheDocument();
    expect(screen.getByText(props.redteamFinalPrompt)).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Replay Output' })).toBeInTheDocument();
    expect(screen.getByText(props.replayOutput)).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Original Output' })).toBeInTheDocument();
    expect(screen.getByText(props.output)).toBeInTheDocument();

    const citationsComponent = screen.getByTestId('citations-component');
    expect(citationsComponent).toBeInTheDocument();
    expect(citationsComponent.getAttribute('data-citations')).toBe(JSON.stringify(props.citations));
  });

  it('should set showCopyButton to true for a CodeDisplay when hoveredElement matches the field name or copiedFields for that field is true', () => {
    const props = {
      output: 'This is the original output.',
      replayOutput: 'This is the replay output.',
      redteamFinalPrompt: 'This is the red team prompt.',
      copiedFields: {
        output: true,
        replayOutput: false,
        redteamFinalPrompt: false,
      },
      hoveredElement: 'replayOutput',
      onCopy: vi.fn(),
      onMouseEnter: vi.fn(),
      onMouseLeave: vi.fn(),
      CodeDisplay: MockCodeDisplay,
    };

    render(<OutputsPanel {...props} />);

    expect(screen.queryByText('Modified User Input (Red Team)')).toBeInTheDocument();
    expect(screen.queryByText('Replay Output')).toBeInTheDocument();
    expect(screen.queryByText('Original Output')).toBeInTheDocument();

    expect(
      screen
        .getByText('Modified User Input (Red Team)')
        .closest('div')
        ?.querySelector('[data-testid="copy-button-visible"]'),
    ).toBeNull();

    expect(
      screen
        .getByText('Replay Output')
        .closest('div')
        ?.querySelector('[data-testid="copy-button-visible"]'),
    ).toBeInTheDocument();

    expect(
      screen
        .getByText('Original Output')
        .closest('div')
        ?.querySelector('[data-testid="copy-button-visible"]'),
    ).toBeInTheDocument();
  });

  it('should not render CodeDisplay components when all output-related props are undefined or null', () => {
    const props = {
      output: undefined,
      replayOutput: null,
      redteamFinalPrompt: undefined,
      copiedFields: {},
      hoveredElement: null,
      onCopy: vi.fn(),
      onMouseEnter: vi.fn(),
      onMouseLeave: vi.fn(),
      CodeDisplay: MockCodeDisplay,
      citations: undefined,
    };

    render(<OutputsPanel {...props} />);

    expect(screen.queryByRole('heading', { name: 'Modified User Input (Red Team)' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Replay Output' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Original Output' })).toBeNull();
    expect(screen.queryByTestId('citations-component')).toBeNull();
  });

  it('should handle malformed citations data gracefully without crashing', () => {
    const props = {
      output: 'This is the original output.',
      replayOutput: 'This is the replay output.',
      redteamFinalPrompt: 'This is the red team prompt.',
      citations: 'invalid citations data',
      copiedFields: {},
      hoveredElement: null,
      onCopy: vi.fn(),
      onMouseEnter: vi.fn(),
      onMouseLeave: vi.fn(),
      CodeDisplay: MockCodeDisplay,
    };

    render(<OutputsPanel {...props} />);

    const citationsComponent = screen.getByTestId('citations-component');
    expect(citationsComponent).toBeInTheDocument();
    expect(citationsComponent.getAttribute('data-citations')).toBe(JSON.stringify(props.citations));
  });
});
