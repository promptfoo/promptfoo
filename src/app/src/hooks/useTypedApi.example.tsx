import { useState, useEffect } from 'react';
import { configApi, evalApi, evalJobApi, providerApi, redteamApi, traceApi, modelAuditApi } from '@app/utils/api-typed';
import type { 
  ConfigListResponse,
  ConfigType,
  EvalJobGetResponse,
  EvalGetTableResponse,
  ProviderTestResponse,
  RedteamStatusResponse,
  TraceGetByEvaluationResponse,
  ModelAuditCheckInstalledResponse,
} from '@promptfoo/shared/dto';

/**
 * Example React hooks showing how to use the typed API client
 */

// Example: Config list hook
export function useConfigs(type?: ConfigType) {
  const [configs, setConfigs] = useState<ConfigListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        setLoading(true);
        const response = await configApi.list(type ? { type } : undefined);
        setConfigs(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch configs');
      } finally {
        setLoading(false);
      }
    };

    fetchConfigs();
  }, [type]);

  return { configs, loading, error };
}

// Example: Evaluation job status hook
export function useEvalJob(jobId: string | null) {
  const [job, setJob] = useState<EvalJobGetResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const pollInterval = setInterval(async () => {
      try {
        setLoading(true);
        const response = await evalJobApi.get(jobId);
        setJob(response);
        
        // Stop polling if job is complete or errored
        if (response.status !== 'in-progress') {
          clearInterval(pollInterval);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch job status');
        clearInterval(pollInterval);
      } finally {
        setLoading(false);
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [jobId]);

  return { job, loading, error };
}

// Example: Eval table with pagination
export function useEvalTable(evalId: string, page: number, limit: number) {
  const [data, setData] = useState<EvalGetTableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTable = async () => {
      try {
        setLoading(true);
        const response = await evalApi.getTable(evalId, {
          offset: page * limit,
          limit,
        });
        setData(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch eval table');
      } finally {
        setLoading(false);
      }
    };

    fetchTable();
  }, [evalId, page, limit]);

  return { data, loading, error };
}

// Example: Provider test
export function useProviderTest() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ProviderTestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const testProvider = async (providerId: string, config?: any) => {
    try {
      setTesting(true);
      setError(null);
      const response = await providerApi.test({
        id: providerId,
        config,
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Provider test failed');
    } finally {
      setTesting(false);
    }
  };

  return { testProvider, testing, result, error };
}

// Example: Redteam status
export function useRedteamStatus() {
  const [status, setStatus] = useState<RedteamStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await redteamApi.status();
        setStatus(response);
      } catch (err) {
        console.error('Failed to fetch redteam status:', err);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  return { status, loading };
}

// Example: Traces for evaluation
export function useEvalTraces(evaluationId: string) {
  const [traces, setTraces] = useState<TraceGetByEvaluationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTraces = async () => {
      try {
        setLoading(true);
        const response = await traceApi.getByEvaluation(evaluationId);
        setTraces(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch traces');
      } finally {
        setLoading(false);
      }
    };

    fetchTraces();
  }, [evaluationId]);

  return { traces, loading, error };
}

// Example: Model audit installation check
export function useModelAuditCheck() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkInstalled = async () => {
      try {
        const response = await modelAuditApi.checkInstalled();
        setInstalled(response.installed);
      } catch (err) {
        setInstalled(false);
      } finally {
        setLoading(false);
      }
    };

    checkInstalled();
  }, []);

  return { installed, loading };
}

// Example: Component using typed API
export function EvalJobStatus({ jobId }: { jobId: string }) {
  const { job, loading, error } = useEvalJob(jobId);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!job) return null;

  switch (job.status) {
    case 'in-progress':
      return (
        <div>
          <p>Running... {job.progress}/{job.total}</p>
          {job.message && <p>{job.message}</p>}
        </div>
      );
    case 'complete':
      return (
        <div>
          <p>✅ Complete!</p>
          <a href={`/eval/${job.evalId}`}>View Results</a>
        </div>
      );
    case 'error':
      return (
        <div>
          <p>❌ Error: {job.message}</p>
          {job.logs && (
            <pre>{job.logs.join('\n')}</pre>
          )}
        </div>
      );
  }
}