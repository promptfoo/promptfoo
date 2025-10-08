import chalk from 'chalk';
import * as React from 'react';

import logger from '../../logger';
import { getInk, renderInk } from '../../util/ink';
import type { InkExports } from '../../util/ink';

type InkDemoOptions = {
  autoExitSeconds?: number;
};

export async function runEvalInkDemo(options: InkDemoOptions = {}) {
  const { autoExitSeconds } = options;
  const ink = await getInk();
  const Demo = createEvalInkDemoComponent(ink, autoExitSeconds);

  logger.info(
    chalk.cyan(
      autoExitSeconds && autoExitSeconds > 0
        ? `Launching Ink demo UI (auto exit in ${autoExitSeconds}s). Press 'q' to exit sooner.`
        : "Launching Ink demo UI. Press 'q' to exit.",
    ),
  );

  const instance = await renderInk(React.createElement(Demo), {
    exitOnCtrlC: true,
  });

  if (instance && typeof instance.waitUntilExit === 'function') {
    await instance.waitUntilExit();
  }

  logger.info(chalk.cyan('Ink demo UI finished.'));
}

function createEvalInkDemoComponent(ink: InkExports, autoExitSeconds?: number) {
  const { Box, Text, useApp, useInput } = ink;

  return function EvalInkDemo() {
    const { exit } = useApp();
    const [view, setView] = React.useState<'overview' | 'details'>('overview');
    const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
    const [showHelp, setShowHelp] = React.useState(true);

    React.useEffect(() => {
      const interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);

      return () => clearInterval(interval);
    }, []);

    React.useEffect(() => {
      if (!autoExitSeconds || autoExitSeconds <= 0) {
        return undefined;
      }

      const timeoutId = setTimeout(() => {
        exit();
      }, autoExitSeconds * 1000);

      return () => clearTimeout(timeoutId);
    }, [autoExitSeconds, exit]);

    useInput((input, key) => {
      if (input === 'q' || key.escape) {
        exit();
      }

      if (key.tab) {
        setView((prev) => (prev === 'overview' ? 'details' : 'overview'));
      }

      if (input?.toLowerCase() === 'h') {
        setShowHelp((prev) => !prev);
      }
    });

    const rows =
      view === 'overview'
        ? [
            { label: 'Status', value: 'Ready' },
            { label: 'Queued tests', value: '4 (demo)' },
            { label: 'Elapsed', value: `${elapsedSeconds}s` },
          ]
        : [
            { label: 'Providers', value: 'openai:gpt-4o-mini, anthropic:haiku' },
            { label: 'Assertions', value: '8 automated' },
            { label: 'Cache', value: 'Enabled' },
          ];

    const remainingSeconds =
      autoExitSeconds && autoExitSeconds > 0
        ? Math.max(autoExitSeconds - elapsedSeconds, 0)
        : undefined;

    return React.createElement(
      Box,
      {
        flexDirection: 'column',
        borderStyle: 'round',
        borderColor: 'cyan',
        paddingX: 1,
        paddingY: 1,
        width: 60,
      },
      React.createElement(Text, { color: 'green', bold: true }, 'promptfoo Ink demo'),
      showHelp
        ? React.createElement(
            Text,
            { dimColor: true },
            'Press Tab to toggle view • H to toggle help • Q or Esc to exit.',
          )
        : null,
      React.createElement(
        Box,
        { marginTop: 1, flexDirection: 'column' },
        ...rows.map((row) =>
          React.createElement(
            Box,
            { key: row.label, justifyContent: 'space-between' },
            React.createElement(Text, { color: 'cyan' }, row.label),
            React.createElement(Text, null, row.value),
          ),
        ),
      ),
      React.createElement(
        Box,
        { marginTop: 1 },
        React.createElement(
          Text,
          { color: view === 'overview' ? 'magenta' : 'yellow' },
          view === 'overview' ? 'Overview' : 'Details',
        ),
      ),
      React.createElement(
        Box,
        { marginTop: 1 },
        React.createElement(
          Text,
          { dimColor: true },
          remainingSeconds !== undefined
            ? `Auto exit in ${Math.ceil(remainingSeconds)}s`
            : 'Press Q to exit when you are done.',
        ),
      ),
    );
  };
}
