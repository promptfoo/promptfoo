import Eval from '@app/pages/eval/components/Eval';
import { useParams, useSearchParams } from 'react-router-dom';

export default function EvalPage() {
  const { evalId } = useParams();
  const [searchParams] = useSearchParams();
  const searchEvalId = searchParams.get('evalId');
  const fetchId = evalId || searchEvalId;
  return <Eval fetchId={fetchId} />;
}
