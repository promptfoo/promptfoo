import { useParams } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import Eval from '@app/pages/eval/components/Eval';

export default function EvalPage() {
  const { evalId } = useParams();
  const [searchParams] = useSearchParams();
  const searchEvalId = searchParams.get('evalId');
  const fetchId = evalId || searchEvalId;
  return <Eval fetchId={fetchId} />;
}
