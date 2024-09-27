import * as React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import { ShiftKeyProvider } from '@app/contexts/ShiftKeyContext';
import { ToastProvider } from '@app/contexts/ToastContext';
import useApiConfig from '@app/stores/apiConfig';
import { callApi } from '@app/utils/api';
import CircularProgress from '@mui/material/CircularProgress';
import type EvalModel from '@promptfoo/models/eval';
import type EvalResult from '@promptfoo/models/eval_result';
import type {
  SharedResults,
  ResultLightweightWithLabel,
  ResultsFile,
  CompletedPrompt,
  TokenUsage,
  EvaluateTableRow,
} from '@promptfoo/types';
import type { EvaluateTable } from '@promptfoo/types';
import { io as SocketIOClient } from 'socket.io-client';
import invariant from 'tiny-invariant';
import EmptyState from './EmptyState';
import ResultsView from './ResultsView';
import { useStore } from './store';
import './Eval.css';

class PromptMetrics {
  score: number;
  testPassCount: number;
  testFailCount: number;
  assertPassCount: number;
  assertFailCount: number;
  totalLatencyMs: number;
  tokenUsage: TokenUsage;
  namedScores: Record<string, number>;
  namedScoresCount: Record<string, number>;
  cost: number;

  constructor() {
    this.score = 0;
    this.testPassCount = 0;
    this.testFailCount = 0;
    this.assertPassCount = 0;
    this.assertFailCount = 0;
    this.totalLatencyMs = 0;
    this.tokenUsage = {
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
    };
    this.namedScores = {};
    this.namedScoresCount = {};
    this.cost = 0;
  }
}

function convertResultsToTable(eval_: EvalModel): EvaluateTable {
  // first we need to get our prompts, we can get that from any of the results in each column
  const results = eval_.results;
  const rows: EvaluateTableRow[] = [];
  const completedPrompts: Record<string, CompletedPrompt> = {};
  const varsForHeader = new Set<string>();
  const varValuesForRow = new Map<number, Record<string, string>>();
  for (const result of results) {
    // vars
    for (const varName of Object.keys(result.testCase.vars || {})) {
      varsForHeader.add(varName);
    }
    let row = rows[result.rowIdx];
    if (!row) {
      rows[result.rowIdx] = {
        description: result.description || undefined,
        outputs: [],
        vars: result.testCase.vars
          ? Object.values(varsForHeader)
              .map((varName) => {
                const varValue = result.testCase.vars?.[varName] || '';
                if (typeof varValue === 'string') {
                  return varValue;
                }
                return JSON.stringify(varValue);
              })
              .flat()
          : [],
        test: {},
      };
      varValuesForRow.set(result.rowIdx, result.testCase.vars as Record<string, string>);
      row = rows[result.rowIdx];
    }

    // format text
    let resultText: string | undefined;
    const outputTextDisplay = (
      typeof result.providerResponse?.output === 'object'
        ? JSON.stringify(result.providerResponse.output)
        : result.providerResponse?.output || result.error || ''
    ) as string;
    if (result.testCase.assert) {
      if (result.pass) {
        resultText = `${outputTextDisplay || result.error || ''}`;
      } else {
        resultText = `${result.error}\n---\n${outputTextDisplay}`;
      }
    } else if (result.error) {
      resultText = `${result.error}`;
    } else {
      resultText = outputTextDisplay;
    }

    row.outputs[result.columnIdx] = {
      ...result,
      text: resultText || '',
      prompt: result.prompt.raw,
      provider: result.provider?.label || result.provider?.id || 'unknown provider',
    };
    invariant(result.promptId, 'Prompt ID is required');
    const completedPromptId = `${result.promptId}-${JSON.stringify(result.provider)}`;
    if (!completedPrompts[completedPromptId]) {
      completedPrompts[completedPromptId] = {
        ...result.prompt,
        provider: result.provider?.label || result.provider?.id || 'unknown provider',
        metrics: new PromptMetrics(),
      };
    }
    const prompt = completedPrompts[completedPromptId];
    invariant(prompt.metrics, 'Prompt metrics are required');
    prompt.metrics.score += result.score;
    prompt.metrics.testPassCount += result.pass ? 1 : 0;
    prompt.metrics.testFailCount += result.pass ? 0 : 1;
    prompt.metrics.assertPassCount +=
      result.gradingResult?.componentResults?.filter((r) => r.pass).length || 0;
    prompt.metrics.assertFailCount +=
      result.gradingResult?.componentResults?.filter((r) => !r.pass).length || 0;
    prompt.metrics.totalLatencyMs += result.latencyMs || 0;
    // @ts-expect-error
    prompt.metrics.tokenUsage.cached += result.providerResponse?.tokenUsage?.cached || 0;
    // @ts-expect-error
    prompt.metrics.tokenUsage.completion += result.providerResponse?.tokenUsage?.completion || 0;
    // @ts-expect-error
    prompt.metrics.tokenUsage.prompt += result.providerResponse?.tokenUsage?.prompt || 0;
    // @ts-expect-error
    prompt.metrics.tokenUsage.total += result.providerResponse?.tokenUsage?.total || 0;
    prompt.metrics.cost += result.cost || 0;
    prompt.metrics.namedScores = eval_.prompts[result.columnIdx]?.metrics?.namedScores || {};
    prompt.metrics.namedScoresCount =
      eval_.prompts[result.columnIdx]?.metrics?.namedScoresCount || {};
  }

  const sortedVars = [...varsForHeader].sort();
  for (const [rowIdx, row] of rows.entries()) {
    row.vars = sortedVars.map((varName) => varValuesForRow.get(rowIdx)?.[varName] || '');
  }
  return {
    head: {
      prompts: Object.values(completedPrompts),
      vars: [...varsForHeader].sort(),
    },
    body: rows,
  };
}
interface EvalOptions {
  fetchId?: string;
  preloadedData?: SharedResults;
  recentEvals?: ResultLightweightWithLabel[];
  defaultEvalId?: string;
}

export default function Eval({
  fetchId,
  preloadedData,
  recentEvals: recentEvalsProp,
  defaultEvalId: defaultEvalIdProp,
}: EvalOptions) {
  const navigate = useNavigate();
  const { apiBaseUrl } = useApiConfig();

  const { table, setTable, config, setConfig, evalId, setEvalId, setAuthor, setInComparisonMode } =
    useStore();
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [recentEvals, setRecentEvals] = React.useState<ResultLightweightWithLabel[]>(
    recentEvalsProp || [],
  );

  const fetchRecentFileEvals = async () => {
    const resp = await callApi(`/results`, { cache: 'no-store' });
    if (!resp.ok) {
      setFailed(true);
      return;
    }
    const body = (await resp.json()) as { data: ResultLightweightWithLabel[] };
    setRecentEvals(body.data);
    return body.data;
  };

  const fetchEvalById = React.useCallback(
    async (id: string) => {
      const resp = await callApi(`/results/${id}`, { cache: 'no-store' });
      const body = (await resp.json()) as { data: ResultsFile };

      setTable(convertResultsToTable(body.data));
      setConfig(body.data.config);
      setAuthor(body.data.author);
      setEvalId(id);
    },
    [setTable, setConfig, setEvalId, setAuthor],
  );

  const handleRecentEvalSelection = async (id: string) => {
    navigate(`/eval/?evalId=${encodeURIComponent(id)}`);
  };

  const [defaultEvalId, setDefaultEvalId] = React.useState<string>(
    defaultEvalIdProp || recentEvals[0]?.evalId,
  );

  const [searchParams] = useSearchParams();
  const searchEvalId = searchParams.get('evalId');

  React.useEffect(() => {
    const evalId = searchEvalId || fetchId;
    if (evalId) {
      console.log('Eval init: Fetching eval by id', { searchEvalId, fetchId });
      const run = async () => {
        await fetchEvalById(evalId);
        setLoaded(true);
        setDefaultEvalId(evalId);
        // Load other recent eval runs
        fetchRecentFileEvals();
      };
      run();
    } else if (preloadedData) {
      console.log('Eval init: Using preloaded data');
      setTable(preloadedData.data.results?.table as EvaluateTable);
      setConfig(preloadedData.data.config);
      setAuthor(preloadedData.data.author || null);
      setLoaded(true);
    } else if (IS_RUNNING_LOCALLY) {
      console.log('Eval init: Using local server websocket');

      const socket = SocketIOClient(apiBaseUrl || '');

      socket.on('init', (data) => {
        console.log('Initialized socket connection', data);
        setLoaded(true);
        setTable(convertResultsToTable(data));
        setConfig(data?.config);
        setAuthor(data?.author || null);
        fetchRecentFileEvals().then((newRecentEvals) => {
          if (newRecentEvals && newRecentEvals.length > 0) {
            setDefaultEvalId(newRecentEvals[0]?.evalId);
            setEvalId(newRecentEvals[0]?.evalId);
            console.log('setting default eval id', newRecentEvals[0]?.evalId);
          }
        });
      });

      socket.on('update', (data) => {
        console.log('Received data update', data);
        setTable(data.results.table);
        setConfig(data.config);
        setAuthor(data.author || null);
        fetchRecentFileEvals().then((newRecentEvals) => {
          if (newRecentEvals && newRecentEvals.length > 0) {
            const newId = newRecentEvals[0]?.evalId;
            if (newId) {
              setDefaultEvalId(newId);
              setEvalId(newId);
            }
          }
        });
      });

      return () => {
        socket.disconnect();
      };
    } else {
      console.log('Eval init: Fetching eval via recent');
      // Fetch from server
      const run = async () => {
        const evals = await fetchRecentFileEvals();
        if (evals && evals.length > 0) {
          const defaultEvalId = evals[0].evalId;
          const resp = await callApi(`/results/${defaultEvalId}`);
          const body = await resp.json();
          setTable(body.data.results.table);
          setConfig(body.data.config);
          setAuthor(body.data.author || null);
          setLoaded(true);
          setDefaultEvalId(defaultEvalId);
          setEvalId(defaultEvalId);
        } else {
          return (
            <div className="notice">
              No evals yet. Share some evals to this server and they will appear here.
            </div>
          );
        }
      };
      run();
    }
    setInComparisonMode(false);
  }, [
    apiBaseUrl,
    fetchId,
    setTable,
    setConfig,
    setAuthor,
    setEvalId,
    fetchEvalById,
    preloadedData,
    setDefaultEvalId,
    searchEvalId,
    setInComparisonMode,
  ]);

  React.useEffect(() => {
    document.title = `${config?.description || evalId || 'Eval'} | promptfoo`;
  }, [config, evalId]);

  if (failed) {
    return <div className="notice">404 Eval not found</div>;
  }

  if (loaded && !table) {
    return <EmptyState />;
  }

  if (!loaded || !table) {
    return (
      <div className="notice">
        <div>
          <CircularProgress size={22} />
        </div>
        <div>Waiting for eval data</div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <ShiftKeyProvider>
        <ResultsView
          defaultEvalId={defaultEvalId}
          recentEvals={recentEvals}
          onRecentEvalSelected={handleRecentEvalSelection}
        />
      </ShiftKeyProvider>
    </ToastProvider>
  );
}
