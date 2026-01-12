import React from 'react';

import Citations from './Citations';

interface CodeDisplayProps {
  content: string;
  title: string;
  maxHeight?: string | number;
  onCopy: () => void;
  copied: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  showCopyButton?: boolean;
}

type CodeDisplayComponent = React.FC<CodeDisplayProps>;

interface OutputsPanelProps {
  output?: string;
  replayOutput?: string | null;
  redteamFinalPrompt?: string;
  copiedFields: Record<string, boolean>;
  hoveredElement: string | null;
  onCopy: (key: string, content: string) => void;
  onMouseEnter: (element: string) => void;
  onMouseLeave: () => void;
  CodeDisplay: CodeDisplayComponent;
  citations?: any;
}

export function OutputsPanel({
  output,
  replayOutput,
  redteamFinalPrompt,
  copiedFields,
  hoveredElement,
  onCopy,
  onMouseEnter,
  onMouseLeave,
  CodeDisplay,
  citations,
}: OutputsPanelProps) {
  return (
    <div>
      {redteamFinalPrompt && (
        <CodeDisplay
          content={redteamFinalPrompt}
          title="Modified User Input (Red Team)"
          onCopy={() => onCopy('redteamFinalPrompt', redteamFinalPrompt)}
          copied={copiedFields['redteamFinalPrompt'] || false}
          onMouseEnter={() => onMouseEnter('redteamFinalPrompt')}
          onMouseLeave={onMouseLeave}
          showCopyButton={
            hoveredElement === 'redteamFinalPrompt' || copiedFields['redteamFinalPrompt']
          }
        />
      )}
      {replayOutput && (
        <CodeDisplay
          content={replayOutput}
          title="Replay Output"
          onCopy={() => onCopy('replayOutput', replayOutput)}
          copied={copiedFields['replayOutput'] || false}
          onMouseEnter={() => onMouseEnter('replayOutput')}
          onMouseLeave={onMouseLeave}
          showCopyButton={hoveredElement === 'replayOutput' || copiedFields['replayOutput']}
        />
      )}
      {output && (
        <CodeDisplay
          content={output}
          title="Original Output"
          onCopy={() => onCopy('output', output)}
          copied={copiedFields['output'] || false}
          onMouseEnter={() => onMouseEnter('output')}
          onMouseLeave={onMouseLeave}
          showCopyButton={hoveredElement === 'output' || copiedFields['output']}
        />
      )}
      {citations && <Citations citations={citations} />}
    </div>
  );
}
