import { ShiftKeyContext } from '@app/contexts/ShiftKeyContextDef';
import { mockCallApiRoutes, resetCallApiMock } from '@app/tests/apiMocks';
import { callApi } from '@app/utils/api';
import { renderWithProviders } from '@app/utils/testutils';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ResultsTable from './ResultsTable';
import { useResultsViewSettingsStore, useTableStore } from './store';
import type { EvaluateTable, GradingResult } from '@promptfoo/types';
import type { SubmitRatingRequest } from '@promptfoo/types/api/eval';

vi.mock('@app/utils/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/utils/api')>()),
  callApi: vi.fn(),
}));
vi.mock('@app/hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@app/hooks/useCloudConfig', () => ({ default: () => ({ data: null }) }));

const initialTableState = useTableStore.getState();
const initialViewState = useResultsViewSettingsStore.getState();
const table: EvaluateTable = {
  head: { prompts: [{ raw: 'test', label: 'test', provider: 'test' }], vars: [] },
  body: [
    {
      test: {},
      testIdx: 0,
      vars: [],
      outputs: [
        {
          id: 'result-id',
          cost: 0,
          failureReason: 0,
          latencyMs: 0,
          namedScores: {},
          pass: true,
          prompt: 'test',
          score: 1,
          testCase: {},
          text: 'test output',
          gradingResult: { pass: true, score: 1, reason: 'Automated pass', comment: '' },
        },
      ],
    },
  ],
};

beforeEach(() => {
  resetCallApiMock();
  useTableStore.setState(initialTableState, true);
  useResultsViewSettingsStore.setState(initialViewState, true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderRatingTable() {
  return renderWithProviders(
    <MemoryRouter>
      <ShiftKeyContext value={true}>
        <ResultsTable
          columnVisibility={{}}
          failureFilter={{}}
          filterMode="all"
          maxTextLength={100}
          onFailureFilterToggle={vi.fn()}
          showStats={false}
          wordBreak="break-word"
          zoom={1}
        />
      </ShiftKeyContext>
    </MemoryRouter>,
  );
}

it.each(
  (['rating', 'highlight'] as const).flatMap((action) => [
    ...(['success', 'confirmed failure', 'ambiguous failure'] as const).map((outcome) => ({
      action,
      outcome,
      pendingRefresh: false,
    })),
    { action, outcome: 'ambiguous failure', pendingRefresh: true },
  ]),
)(
  'preserves the latest comment through older queued $outcome and a new $action (pending refresh: $pendingRefresh)',
  async ({ action, outcome, pendingRefresh }) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    const evalId = `queued-${action}-${outcome.replace(/ /g, '-')}-${pendingRefresh}`;
    const query = `/eval/${evalId}/table?offset=0&limit=50&filterMode=all`;
    useTableStore.setState({
      evalId,
      table: structuredClone(table),
      config: {},
      version: 4,
      filteredResultsCount: 1,
      totalResultsCount: 1,
      tableQuery: { evalId, url: query },
    });
    let serverTable = structuredClone(table);
    const writes: Array<SubmitRatingRequest & GradingResult> = [];
    const completeWrites: Array<() => void> = [];
    let completeRefresh: (() => void) | undefined;
    const writeRoutes = Array.from({ length: 4 }, (_, index) => ({
      path: `/eval/${evalId}/results/result-id/rating`,
      method: 'POST',
      status: index < 2 && outcome === 'confirmed failure' ? 400 : 200,
      response: async (_path: string, options: RequestInit | undefined) => {
        const body = JSON.parse(String(options?.body)) as SubmitRatingRequest & GradingResult;
        writes.push(body);
        await new Promise<void>((resolve) => completeWrites.push(resolve));
        if (pendingRefresh && index === 0) {
          throw new Error('Connection lost before commit');
        }
        if (index < 2 && outcome === 'confirmed failure') {
          return {};
        }
        const { ratingAction: _action, ratingUpdate: _update, ...gradingResult } = body;
        serverTable = structuredClone(serverTable);
        Object.assign(serverTable.body[0].outputs[0], {
          pass: body.pass,
          score: body.score,
          failureReason: body.pass ? 0 : 1,
          gradingResult,
        });
        if (index < 2 && outcome === 'ambiguous failure') {
          throw new Error('Connection lost after commit');
        }
        return {
          id: 'result-id',
          success: body.pass,
          score: body.score,
          failureReason: body.pass ? 0 : 1,
          gradingResult,
        };
      },
    }));
    const tableResponse = () => ({
      table: serverTable,
      config: {},
      version: 4,
      totalCount: 1,
      filteredCount: 1,
    });
    mockCallApiRoutes([
      writeRoutes[0],
      ...(pendingRefresh
        ? [
            {
              path: query,
              response: async () => {
                const response = tableResponse();
                await new Promise<void>((resolve) => {
                  completeRefresh = resolve;
                });
                return response;
              },
            },
          ]
        : []),
      ...writeRoutes.slice(1),
      {
        path: query,
        response: tableResponse,
      },
    ]);
    renderRatingTable();

    const saveComment = async (comment: string) => {
      await user.click(screen.getByRole('button', { name: 'Edit comment' }));
      const dialog = within(screen.getByRole('dialog'));
      await user.clear(dialog.getByRole('textbox'));
      await user.type(dialog.getByRole('textbox'), comment);
      await user.click(dialog.getByRole('button', { name: 'Save' }));
    };
    // R or its error refresh is in flight while the real editor accepts A and then B.
    if (pendingRefresh) {
      await saveComment('R');
      await act(async () => completeWrites[0]());
      await waitFor(() => expect(completeRefresh).toBeDefined());
    } else {
      await user.click(screen.getByRole('button', { name: 'Mark test failed' }));
    }
    for (const comment of ['A', 'B']) {
      await saveComment(comment);
    }
    expect(writes).toHaveLength(1);
    await act(async () => (pendingRefresh ? completeRefresh?.() : completeWrites[0]()));
    await waitFor(() => expect(writes).toHaveLength(2));

    // Dispatching A must not reset B or the editor draft before another action captures it.
    await user.click(screen.getByRole('button', { name: 'Edit comment' }));
    expect.soft(within(screen.getByRole('dialog')).getByRole('textbox')).toHaveValue('B');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(
      screen.getByRole('button', {
        name: action === 'rating' ? 'Mark test passed' : 'Toggle test highlight',
      }),
    );
    const expectedComment = action === 'rating' ? 'B' : '!highlight B';
    for (let index = 1; index < 4; index += 1) {
      await act(async () => completeWrites[index]());
      if (index < 3) {
        await waitFor(() => expect(writes).toHaveLength(index + 2));
      }
    }

    expect
      .soft(writes.map((write) => write.comment))
      .toEqual([pendingRefresh ? 'R' : '', 'A', 'B', expectedComment]);
    expect.soft(serverTable.body[0].outputs[0].gradingResult?.comment).toBe(expectedComment);
    expect
      .soft(useTableStore.getState().table?.body[0].outputs[0].gradingResult?.comment)
      .toBe(expectedComment);
    await user.click(screen.getByRole('button', { name: 'Edit comment' }));
    expect
      .soft(within(screen.getByRole('dialog')).getByRole('textbox'))
      .toHaveValue(expectedComment);
    expect(
      vi.mocked(callApi).mock.calls.filter(([, options]) => options?.method !== 'POST'),
    ).toEqual(Array.from({ length: pendingRefresh ? 2 : 1 }, () => [query]));
  },
);

it.each(['rejected', 'canonical'] as const)(
  'keeps the %s result for an earlier cell when a later cell is queued and refresh fails',
  async (outcome) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    const evalId = `cross-cell-${outcome}`;
    const twoRows = structuredClone(table);
    const secondRow = structuredClone(twoRows.body[0]);
    secondRow.testIdx = 1;
    secondRow.outputs[0].id = 'second-result';
    twoRows.body.push(secondRow);
    if (outcome === 'canonical') {
      twoRows.body[0].outputs[0].gradingResult = {
        pass: true,
        score: 1,
        reason: 'Manual result',
        componentResults: [
          { pass: true, score: 1, reason: 'Manual result', assertion: { type: 'human' } },
        ],
      };
    }
    useTableStore.setState({
      evalId,
      table: twoRows,
      config: {},
      version: 4,
      filteredResultsCount: 2,
      totalResultsCount: 2,
    });
    const completeWrites: Array<(body: unknown) => void> = [];
    const response = () => new Promise((resolve) => completeWrites.push(resolve));
    mockCallApiRoutes([
      {
        path: `/eval/${evalId}/results/result-id/rating`,
        method: 'POST',
        status: outcome === 'rejected' ? 400 : 200,
        response,
      },
      { path: `/eval/${evalId}/results/second-result/rating`, method: 'POST', response },
      { path: `/eval/${evalId}/table?offset=0&limit=50&filterMode=all`, status: 500 },
    ]);
    renderRatingTable();
    await user.click(
      screen.getAllByRole('button', {
        name: outcome === 'rejected' ? 'Mark test failed' : 'Mark test passed',
      })[0],
    );
    await user.click(screen.getAllByRole('button', { name: 'Mark test failed' })[1]);
    expect(callApi).toHaveBeenCalledTimes(1);
    await act(async () =>
      completeWrites[0]({
        id: 'result-id',
        success: false,
        score: 0.35,
        failureReason: 2,
        gradingResult: { pass: false, score: 0.35, reason: 'Restored automated error' },
      }),
    );
    await waitFor(() => expect(completeWrites).toHaveLength(2));
    await act(async () =>
      completeWrites[1]({
        id: 'second-result',
        success: false,
        score: 0,
        failureReason: 1,
        gradingResult: { pass: false, score: 0, reason: 'Manual failure' },
      }),
    );
    expect(callApi).toHaveBeenCalledTimes(3);
    const outputs = useTableStore.getState().table?.body.map((row) => row.outputs[0]);
    expect(outputs?.[0]).toMatchObject(
      outcome === 'rejected'
        ? { pass: true, score: 1, failureReason: 0 }
        : { pass: false, score: 0.35, failureReason: 2 },
    );
    expect(outputs?.[1]).toMatchObject({ pass: false, score: 0, failureReason: 1 });
  },
);

it.each(
  [3, 4].flatMap((version) => [
    { version, order: 'A1-A2-B' },
    { version, order: 'A1-B-A2' },
  ]),
)(
  'preserves per-cell edits through interleaved v$version writes ($order) without a successful refresh',
  async ({ version, order }) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    const evalId = `interleaved-${version}-${order}`;
    let serverTable = structuredClone(table);
    const secondRow = structuredClone(serverTable.body[0]);
    secondRow.testIdx = 1;
    secondRow.outputs[0].id = 'second-result';
    serverTable.body.push(secondRow);
    useTableStore.setState({
      evalId,
      table: structuredClone(serverTable),
      config: {},
      version,
      filteredResultsCount: 2,
      totalResultsCount: 2,
    });
    const ids =
      order === 'A1-A2-B'
        ? ['result-id', 'result-id', 'second-result', 'result-id']
        : ['result-id', 'second-result', 'result-id', 'result-id'];
    const completeWrites: Array<() => void> = [];
    mockCallApiRoutes([
      ...ids.map((id) => ({
        path: version === 3 ? `/eval/${evalId}` : `/eval/${evalId}/results/${id}/rating`,
        method: version === 3 ? 'PATCH' : 'POST',
        response: async (_path: string, options: RequestInit | undefined) => {
          const payload = JSON.parse(String(options?.body));
          await new Promise<void>((resolve) => completeWrites.push(resolve));
          if (version === 3) {
            serverTable = payload.table;
            return {};
          }
          serverTable = structuredClone(serverTable);
          const output = serverTable.body[id === 'result-id' ? 0 : 1].outputs[0];
          Object.assign(output, {
            pass: payload.pass,
            score: payload.score,
            failureReason: payload.pass ? 0 : 1,
            gradingResult: payload,
          });
          return {
            id,
            success: output.pass,
            score: output.score,
            failureReason: output.failureReason,
            gradingResult: output.gradingResult,
          };
        },
      })),
      { path: `/eval/${evalId}/table?offset=0&limit=50&filterMode=all`, status: 500 },
    ]);
    renderRatingTable();
    const saveComment = async (comment: string) => {
      await user.click(screen.getAllByRole('button', { name: 'Edit comment' })[0]);
      const dialog = within(screen.getByRole('dialog'));
      await user.clear(dialog.getByRole('textbox'));
      await user.type(dialog.getByRole('textbox'), comment);
      await user.click(dialog.getByRole('button', { name: 'Save' }));
    };
    const expectComment = async (comment: string) => {
      await user.click(screen.getAllByRole('button', { name: 'Edit comment' })[0]);
      expect.soft(within(screen.getByRole('dialog')).getByRole('textbox')).toHaveValue(comment);
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
    };
    await saveComment('first');
    if (order === 'A1-A2-B') {
      await saveComment('latest');
    }
    await user.click(screen.getAllByRole('button', { name: 'Mark test failed' })[1]);
    if (order === 'A1-B-A2') {
      await saveComment('latest');
    }
    expect(callApi).toHaveBeenCalledTimes(1);
    await act(async () => completeWrites[0]());
    await waitFor(() => expect(completeWrites).toHaveLength(2));
    await expectComment('latest');
    await user.click(screen.getAllByRole('button', { name: 'Toggle test highlight' })[0]);
    for (let index = 1; index < 4; index += 1) {
      await act(async () => completeWrites[index]());
      if (index < 3) {
        await waitFor(() => expect(completeWrites).toHaveLength(index + 2));
      }
      await expectComment('!highlight latest');
    }
    expect(callApi).toHaveBeenCalledTimes(5);
    expect(serverTable.body[0].outputs[0].gradingResult?.comment).toBe('!highlight latest');
    expect(serverTable.body[1].outputs[0].pass).toBe(false);
    expect(useTableStore.getState().table?.body[0].outputs[0].gradingResult?.comment).toBe(
      '!highlight latest',
    );
    expect(useTableStore.getState().table?.body[1].outputs[0].pass).toBe(false);
  },
);

it.each([false, true])(
  'restores the known baseline after two rejected edits (another page queued: %s)',
  async (interleaved) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    useTableStore.setState({
      evalId: 'double-rejection',
      table: structuredClone(table),
      config: {},
      version: 4,
      filteredResultsCount: 1,
      totalResultsCount: 1,
    });
    let completeFirst!: () => void;
    const route = '/eval/double-rejection/results/result-id/rating';
    mockCallApiRoutes([
      {
        path: route,
        method: 'POST',
        status: 400,
        response: () =>
          new Promise<void>((resolve) => {
            completeFirst = resolve;
          }),
      },
      ...(interleaved
        ? [
            {
              path: '/eval/double-rejection/results/other-page-result/rating',
              method: 'POST',
              response: {
                id: 'other-page-result',
                success: false,
                score: 0,
                failureReason: 1,
                gradingResult: { pass: false, score: 0, reason: 'Manual failure' },
              },
            },
          ]
        : []),
      { path: route, method: 'POST', status: 400 },
      { path: '/eval/double-rejection/table?offset=0&limit=50&filterMode=all', status: 500 },
    ]);
    renderRatingTable();
    await user.click(screen.getByRole('button', { name: 'Mark test failed' }));
    if (interleaved) {
      const firstPage = useTableStore.getState().table;
      const otherPage = structuredClone(table);
      otherPage.body[0].testIdx = 50;
      otherPage.body[0].outputs[0].id = 'other-page-result';
      act(() => useTableStore.setState({ table: otherPage }));
      await user.click(screen.getByRole('button', { name: 'Mark test failed' }));
      act(() => useTableStore.setState({ table: firstPage }));
    }
    await user.click(screen.getByRole('button', { name: 'Edit comment' }));
    await user.type(screen.getByRole('textbox'), 'Queued comment');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await act(async () => completeFirst());
    expect(callApi).toHaveBeenCalledTimes(interleaved ? 4 : 3);
    expect(useTableStore.getState().table?.body[0].outputs[0]).toMatchObject({
      pass: true,
      score: 1,
      gradingResult: { comment: '' },
    });
  },
);

it('clears a queued rating on the second click after another cell rerenders the table', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const user = userEvent.setup();
  const threeRows = structuredClone(table);
  for (const id of ['second-result', 'third-result']) {
    const row = structuredClone(table.body[0]);
    row.testIdx = threeRows.body.length;
    row.outputs[0].id = id;
    threeRows.body.push(row);
  }
  useTableStore.setState({
    evalId: 'queued-toggle',
    table: threeRows,
    config: {},
    version: 4,
    filteredResultsCount: 3,
    totalResultsCount: 3,
  });
  const completeWrites: Array<() => void> = [];
  const intents: string[] = [];
  const ids = ['result-id', 'third-result', 'second-result', 'second-result'];
  mockCallApiRoutes([
    ...ids.map((id) => ({
      path: `/eval/queued-toggle/results/${id}/rating`,
      method: 'POST',
      response: async (_path: string, options: RequestInit | undefined) => {
        const payload = JSON.parse(String(options?.body));
        intents.push(payload.ratingAction);
        await new Promise<void>((resolve) => completeWrites.push(resolve));
        const pass = payload.ratingAction === 'clear';
        return {
          id,
          success: pass,
          score: pass ? 1 : 0,
          failureReason: pass ? 0 : 1,
          gradingResult: { pass, score: pass ? 1 : 0, reason: 'Persisted outcome' },
        };
      },
    })),
    { path: '/eval/queued-toggle/table?offset=0&limit=50&filterMode=all', status: 500 },
  ]);
  renderRatingTable();
  for (const index of [0, 2, 1]) {
    await user.click(screen.getAllByRole('button', { name: 'Mark test failed' })[index]);
  }
  await act(async () => completeWrites[0]());
  await waitFor(() => expect(completeWrites).toHaveLength(2));
  await user.click(screen.getAllByRole('button', { name: 'Mark test failed' })[1]);
  for (let index = 1; index < 4; index += 1) {
    await act(async () => completeWrites[index]());
    if (index < 3) {
      await waitFor(() => expect(completeWrites).toHaveLength(index + 2));
    }
  }
  expect(intents).toEqual(['rate', 'rate', 'rate', 'clear']);
  expect(useTableStore.getState().table?.body[1].outputs[0]).toMatchObject({
    pass: true,
    score: 1,
  });
});
