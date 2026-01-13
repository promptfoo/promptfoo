import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { LogEntryRow } from '../../../src/ui/logs/LogEntryRow';
import { parseLogEntries, groupDuplicateEntries } from '../../../src/ui/logs/logParser';
import type { EntryGroup } from '../../../src/ui/logs/types';

describe('LogEntryRow component', () => {
  const testLines = [
    '2026-01-13T04:02:20.142Z [ERROR] [logger.ts:1]: Test error message',
    '    at stack trace line 1',
    '    at stack trace line 2',
  ];
  const entries = parseLogEntries(testLines);
  const groups = groupDuplicateEntries(entries);

  it('should render a log entry row', () => {
    const { lastFrame } = render(
      <LogEntryRow
        group={groups[0]}
        isSelected={false}
        isExpanded={false}
        searchQuery=""
        showRelativeTime={true}
        maxWidth={100}
        now={new Date('2026-01-13T04:02:25.000Z')}
      />,
    );

    expect(lastFrame()).toContain('E'); // Error level indicator
    expect(lastFrame()).toContain('Test error message');
  });

  it('should render expanded continuation lines', () => {
    const { lastFrame } = render(
      <LogEntryRow
        group={groups[0]}
        isSelected={false}
        isExpanded={true}
        searchQuery=""
        showRelativeTime={true}
        maxWidth={100}
        now={new Date('2026-01-13T04:02:25.000Z')}
      />,
    );

    expect(lastFrame()).toContain('stack trace');
  });

  it('should render duplicate count badge', () => {
    const duplicateGroup: EntryGroup = {
      entry: entries[0],
      count: 5,
      entries: [entries[0]],
    };

    const { lastFrame } = render(
      <LogEntryRow
        group={duplicateGroup}
        isSelected={false}
        isExpanded={false}
        searchQuery=""
        showRelativeTime={true}
        maxWidth={100}
        now={new Date('2026-01-13T04:02:25.000Z')}
      />,
    );

    expect(lastFrame()).toContain('×5');
  });

  it('should highlight search matches', () => {
    const { lastFrame } = render(
      <LogEntryRow
        group={groups[0]}
        isSelected={false}
        isExpanded={false}
        searchQuery="error"
        showRelativeTime={true}
        maxWidth={100}
        now={new Date('2026-01-13T04:02:25.000Z')}
      />,
    );

    // The search term should be present (highlighting is done via ANSI codes)
    expect(lastFrame()).toContain('error');
  });

  it('should show relative timestamp', () => {
    const { lastFrame } = render(
      <LogEntryRow
        group={groups[0]}
        isSelected={false}
        isExpanded={false}
        searchQuery=""
        showRelativeTime={true}
        maxWidth={100}
        now={new Date('2026-01-13T04:02:30.000Z')} // 10 seconds after entry
      />,
    );

    // Entry is at 04:02:20.142Z, now is 04:02:30.000Z = ~10 seconds ago
    expect(lastFrame()).toContain('9s ago');
  });
});
