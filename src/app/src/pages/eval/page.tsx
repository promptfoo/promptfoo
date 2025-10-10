import Eval from '@app/pages/eval/components/Eval';
import { useParams, useSearchParams } from 'react-router-dom';

export default function EvalPage() {
  const { evalId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const searchEvalId = searchParams.get('evalId');
  const fetchId = evalId || searchEvalId;

  // NEW: baseline param
  const baselineId = searchParams.get('baseline');

  return (
    <Eval
      fetchId={fetchId}
      baselineId={baselineId}
      onBaselineChange={(id: string | null) => {
        const next = new URLSearchParams(searchParams);
        if (id) next.set('baseline', id);
        else next.delete('baseline');
        setSearchParams(next, { replace: false });
        if (id) localStorage.setItem('baselineRunId', id);
        else localStorage.removeItem('baselineRunId');
      }}
    />
  );
}
