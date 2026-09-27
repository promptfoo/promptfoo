import { ShiftKeyContext } from '@app/contexts/ShiftKeyContextDef';
import { mockCallApiRoutes, resetCallApiMock } from '@app/tests/apiMocks';
import { callApi } from '@app/utils/api';
import { renderWithProviders } from '@app/utils/testutils';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest';
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
  useTableStore.setState({ ...initialTableState, ratingQueues: new Map() }, true);
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

function holdResponse() {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  onTestFinished(async () => {
    await act(async () => release());
  });
  return { pending, release };
}

it.each([true, false])(
  'retains two pending ID-less cells through a legacy refresh (test indices: %s)',
  async (hasTestIndices) => {
    const user = userEvent.setup();
    const evalId = `legacy-overlay-${hasTestIndices}`;
    const query = `/eval/${evalId}/table?offset=0&limit=50&filterMode=all`;
    let serverTable = structuredClone(table);
    serverTable.head.prompts.push(structuredClone(serverTable.head.prompts[0]));
    serverTable.body.push(structuredClone(serverTable.body[0]));
    serverTable.body.forEach((row, rowIndex) => {
      row.testIdx = rowIndex;
      if (!hasTestIndices) {
        delete (row as Partial<typeof row>).testIdx;
      }
      row.outputs.push(structuredClone(row.outputs[0]));
      row.outputs.forEach((output) => delete (output as Partial<typeof output>).id);
    });
    useTableStore.setState({
      evalId,
      table: structuredClone(serverTable),
      config: {},
      version: 3,
      filteredResultsCount: 2,
      totalResultsCount: 2,
      tableQuery: { evalId, url: query },
    });
    const firstWrite = holdResponse();
    const writes: EvaluateTable[] = [];
    const read = () => ({
      table: structuredClone(serverTable),
      config: {},
      version: 3,
      totalCount: 2,
      filteredCount: 2,
    });
    const write = async (_path: string, options: RequestInit | undefined) => {
      const { table: submitted } = JSON.parse(String(options?.body)) as { table: EvaluateTable };
      writes.push(submitted);
      if (writes.length === 1) {
        await firstWrite.pending;
      }
      serverTable = submitted;
      return {};
    };
    mockCallApiRoutes([
      { path: `/eval/${evalId}`, method: 'PATCH', response: write },
      { path: query, response: read },
      { path: `/eval/${evalId}`, method: 'PATCH', response: write },
      { path: query, response: read },
    ]);
    const view = renderRatingTable();
    await user.click(screen.getAllByRole('button', { name: 'Mark test failed' })[3]);
    await user.click(screen.getAllByRole('button', { name: 'Mark test failed' })[0]);
    expect(writes).toHaveLength(1);
    expect(writes[0].body.map((row) => row.outputs.map((output) => output.pass))).toEqual([
      [true, true],
      [true, false],
    ]);
    // A real store GET returns untouched server rows while both edits are accepted.
    if (hasTestIndices) {
      serverTable.body.reverse();
    }
    await act(async () => {
      await useTableStore.getState().fetchEvalData(evalId, {
        skipLoadingState: true,
        skipSettingEvalId: true,
      });
    });
    expect(
      useTableStore.getState().table?.body.map((row) => row.outputs.map((output) => output.pass)),
    ).toEqual(
      hasTestIndices
        ? [
            [true, false],
            [false, true],
          ]
        : [
            [false, true],
            [true, false],
          ],
    );
    expect([...useTableStore.getState().ratingQueues.values()][0].edits.size).toBe(2);
    view.unmount();
    renderRatingTable();
    expect(screen.getAllByRole('button', { name: 'Mark test failed', pressed: true })).toHaveLength(
      2,
    );
    await act(async () => firstWrite.release());
    await waitFor(() => expect(writes).toHaveLength(2));
    await waitFor(() => expect(useTableStore.getState().ratingQueues.size).toBe(0));
    expect(writes[1].body.map((row) => row.outputs.map((output) => output.pass))).toEqual([
      [false, true],
      [true, false],
    ]);
    expect(
      writes.every((write) => write.body.every((row) => row.outputs.every((output) => !output.id))),
    ).toBe(true);
    expect(callApi).toHaveBeenCalledTimes(4);
  },
);

it.each(['before', 'after'] as const)(
  'preserves queued comments when a socket read starts %s the latest edit',
  async (readTiming) => {
    const user = userEvent.setup();
    const evalId = `socket-read-${readTiming}`;
    const query = `/eval/${evalId}/table?offset=0&limit=50&filterMode=all`;
    const serverTable = structuredClone(table);
    useTableStore.setState({
      evalId,
      table: structuredClone(table),
      config: {},
      version: 4,
      filteredResultsCount: 1,
      totalResultsCount: 1,
      tableQuery: { evalId, url: query },
    });
    const heldWrites = Array.from({ length: 4 }, holdResponse);
    const heldRead = holdResponse();
    const writes: Array<SubmitRatingRequest & GradingResult> = [];
    const tableResponse = () => ({
      table: structuredClone(serverTable),
      config: {},
      version: 4,
      filteredCount: 1,
      totalCount: 1,
    });
    const writeRoutes = heldWrites.map((held) => ({
      path: `/eval/${evalId}/results/result-id/rating`,
      method: 'POST',
      response: async (_path: string, options: RequestInit | undefined) => {
        const body = JSON.parse(String(options?.body)) as SubmitRatingRequest & GradingResult;
        writes.push(body);
        const { ratingAction: _action, ratingUpdate: _update, ...gradingResult } = body;
        Object.assign(serverTable.body[0].outputs[0], {
          pass: body.pass,
          score: body.score,
          failureReason: body.pass ? 0 : 1,
          gradingResult,
        });
        await held.pending;
        return {
          id: 'result-id',
          success: body.pass,
          score: body.score,
          failureReason: body.pass ? 0 : 1,
          gradingResult,
        };
      },
    }));
    mockCallApiRoutes([
      writeRoutes[0],
      {
        path: query,
        response: async () => {
          const snapshot = tableResponse();
          await heldRead.pending;
          return snapshot;
        },
      },
      ...writeRoutes.slice(1),
      { path: query, response: tableResponse },
    ]);
    renderRatingTable();
    await user.click(screen.getByRole('button', { name: 'Mark test failed' }));
    const read = () =>
      useTableStore.getState().fetchEvalData(evalId, {
        skipSettingEvalId: true,
        skipLoadingState: true,
      });
    let pendingRead: ReturnType<typeof read>;
    if (readTiming === 'before') {
      await act(async () => {
        pendingRead = read();
      });
    }
    for (const comment of ['A', 'B']) {
      await user.click(screen.getByRole('button', { name: 'Edit comment' }));
      const dialog = within(screen.getByRole('dialog'));
      await user.clear(dialog.getByRole('textbox'));
      await user.type(dialog.getByRole('textbox'), comment);
      await user.click(dialog.getByRole('button', { name: 'Save' }));
    }
    if (readTiming === 'after') {
      await act(async () => {
        pendingRead = read();
      });
    }
    await act(async () => {
      heldRead.release();
      await pendingRead;
    });
    await user.click(screen.getByRole('button', { name: 'Edit comment' }));
    expect.soft(within(screen.getByRole('dialog')).getByRole('textbox')).toHaveValue('B');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Mark test passed' }));
    for (let index = 0; index < heldWrites.length; index += 1) {
      await waitFor(() => expect(writes).toHaveLength(index + 1));
      await act(async () => heldWrites[index].release());
    }
    await waitFor(() => expect(callApi).toHaveBeenCalledTimes(6));
    expect.soft(writes.map((write) => write.comment)).toEqual(['', 'A', 'B', 'B']);
    expect(serverTable.body[0].outputs[0].gradingResult?.comment).toBe('B');
  },
);

it('persists the next rating while an obsolete background refresh is still held', async () => {
  const user = userEvent.setup();
  const evalId = 'held-refresh-next-write';
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
  const heldRead = holdResponse();
  const writeResponse = {
    id: 'result-id',
    success: false,
    score: 0,
    failureReason: 1,
    gradingResult: { pass: false, score: 0, reason: 'Manual result' },
  };
  mockCallApiRoutes([
    { path: `/eval/${evalId}/results/result-id/rating`, method: 'POST', response: writeResponse },
    {
      path: query,
      response: async () => {
        await heldRead.pending;
        return { table, config: {}, version: 4, filteredCount: 1, totalCount: 1 };
      },
    },
    { path: `/eval/${evalId}/results/result-id/rating`, method: 'POST', response: writeResponse },
    { path: query, response: { table, config: {}, version: 4, filteredCount: 1, totalCount: 1 } },
  ]);
  renderRatingTable();
  await user.click(screen.getByRole('button', { name: 'Mark test failed' }));
  await waitFor(() => expect(callApi).toHaveBeenCalledTimes(2));
  await user.click(screen.getByRole('button', { name: 'Mark test passed' }));
  await waitFor(() =>
    expect(
      vi.mocked(callApi).mock.calls.filter(([, options]) => options?.method === 'POST'),
    ).toHaveLength(2),
  );
  await act(async () => heldRead.release());
});

it.each([
  { changePages: false, refreshStatus: 200 },
  { changePages: false, refreshStatus: 500 },
  { changePages: true, refreshStatus: 200 },
  { changePages: true, refreshStatus: 500 },
])(
  'retains completed cells through pending writes and reads (pages: $changePages, refresh: $refreshStatus)',
  async ({ changePages, refreshStatus }) => {
    const user = userEvent.setup();
    const evalId = `completed-cells-${changePages}-${refreshStatus}`;
    const query = `/eval/${evalId}/table?offset=0&limit=50&filterMode=all`;
    const serverTable = structuredClone(table);
    const secondRow = structuredClone(serverTable.body[0]);
    secondRow.testIdx = 1;
    secondRow.outputs[0].id = 'second-result';
    serverTable.body.push(secondRow);
    useTableStore.setState({
      evalId,
      table: structuredClone(serverTable),
      config: {},
      version: 4,
      filteredResultsCount: 2,
      totalResultsCount: 2,
      tableQuery: { evalId, url: query },
    });
    const firstWrite = holdResponse();
    const secondWrite = holdResponse();
    const earlyRead = holdResponse();
    const foregroundRead = holdResponse();
    const tableResponse = (body = serverTable.body) => ({
      table: structuredClone({ ...serverTable, body }),
      config: {},
      version: 4,
      totalCount: 2,
      filteredCount: 2,
    });
    const writeResponse = async (index: number, held: ReturnType<typeof holdResponse>) => {
      await held.pending;
      const output = serverTable.body[index].outputs[0];
      const score = index === 0 ? 0.35 : 0.45;
      Object.assign(output, {
        pass: false,
        score,
        failureReason: 1,
        gradingResult: { pass: false, score, reason: 'Persisted result' },
      });
      return {
        id: output.id,
        success: false,
        score,
        failureReason: 1,
        gradingResult: output.gradingResult,
      };
    };
    mockCallApiRoutes([
      {
        path: `/eval/${evalId}/results/result-id/rating`,
        method: 'POST',
        response: () => writeResponse(0, firstWrite),
      },
      {
        path: query,
        response: async () => {
          const snapshot = tableResponse();
          await earlyRead.pending;
          return snapshot;
        },
      },
      {
        path: `/eval/${evalId}/results/second-result/rating`,
        method: 'POST',
        response: () => writeResponse(1, secondWrite),
      },
      ...(changePages
        ? [
            {
              path: `/eval/${evalId}/table?offset=1&limit=1&filterMode=all`,
              response: () => tableResponse([secondRow]),
            },
            { path: query, response: () => tableResponse() },
          ]
        : []),
      {
        path: query,
        response: async () => {
          const snapshot = tableResponse();
          await foregroundRead.pending;
          return snapshot;
        },
      },
      { path: query, status: refreshStatus, response: () => tableResponse() },
    ]);
    renderRatingTable();
    await user.click(screen.getAllByRole('button', { name: 'Mark test failed' })[0]);
    await user.click(screen.getAllByRole('button', { name: 'Mark test failed' })[1]);
    const read = (options = {}) =>
      useTableStore.getState().fetchEvalData(evalId, {
        skipSettingEvalId: true,
        ...options,
      });
    let staleRead!: ReturnType<typeof read>;
    await act(async () => {
      staleRead = read({ skipLoadingState: true });
      firstWrite.release();
    });
    await waitFor(() => expect(callApi).toHaveBeenCalledTimes(3));
    await act(async () => {
      earlyRead.release();
      await staleRead;
    });
    expect.soft(useTableStore.getState().table?.body[0].outputs[0].score).toBe(0.35);
    expect.soft(useTableStore.getState().table?.body[1].outputs[0].pass).toBe(false);
    if (changePages) {
      await act(async () => {
        await read({ pageIndex: 1, pageSize: 1 });
      });
      expect
        .soft(useTableStore.getState().table?.body[0].outputs[0])
        .toMatchObject({ id: 'second-result', pass: false });
      await act(async () => {
        await read();
      });
      expect.soft(useTableStore.getState().table?.body[0].outputs[0].score).toBe(0.35);
    }
    let lastRead!: ReturnType<typeof read>;
    await act(async () => {
      lastRead = read();
      secondWrite.release();
    });
    await waitFor(() => expect(callApi).toHaveBeenCalledTimes(changePages ? 7 : 5));
    await act(async () => {
      foregroundRead.release();
      await lastRead;
    });
    expect(useTableStore.getState().table?.body.map((row) => row.outputs[0].score)).toEqual([
      0.35, 0.45,
    ]);
    expect(useTableStore.getState().isFetching).toBe(false);
    expect(useTableStore.getState().ratingQueues.size).toBe(refreshStatus === 200 ? 0 : 1);
  },
);

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
    expect(writes).toHaveLength(pendingRefresh ? 2 : 1);
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

it.each(
  [false, true].flatMap((interleaved) =>
    (['rejected', 'timeout-before-commit', 'timeout-after-commit'] as const).map((outcome) => ({
      interleaved,
      outcome,
    })),
  ),
)(
  'uses the confirmed baseline after a rejected rating and $outcome comment (another page queued: $interleaved)',
  async ({ interleaved, outcome }) => {
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
    const firstWrite = holdResponse();
    let sentComment!: SubmitRatingRequest & GradingResult;
    let savedComment = '';
    const route = '/eval/double-rejection/results/result-id/rating';
    mockCallApiRoutes([
      {
        path: route,
        method: 'POST',
        status: 400,
        response: () => firstWrite.pending,
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
      {
        path: route,
        method: 'POST',
        status: outcome === 'rejected' ? 400 : 200,
        response: (_path: string, options: RequestInit | undefined) => {
          sentComment = JSON.parse(String(options?.body));
          if (outcome === 'timeout-after-commit') {
            savedComment = sentComment.comment ?? '';
          }
          if (outcome !== 'rejected') {
            throw new Error('Connection lost');
          }
          return {};
        },
      },
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
    await act(async () => firstWrite.release());
    expect(callApi).toHaveBeenCalledTimes(interleaved ? 4 : 3);
    expect(sentComment).toMatchObject({ pass: true, score: 1, comment: 'Queued comment' });
    expect(savedComment).toBe(outcome === 'timeout-after-commit' ? 'Queued comment' : '');
    expect(useTableStore.getState().table?.body[0].outputs[0]).toMatchObject({
      pass: true,
      score: 1,
      gradingResult: { comment: outcome === 'rejected' ? '' : 'Queued comment' },
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
