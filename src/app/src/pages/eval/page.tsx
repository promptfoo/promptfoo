import { useParams, useSearchParams } from 'react-router-dom';
import Eval from '@app/pages/eval/components/Eval';

export default function EvalPage() {
  // Attempt to get the eval id from the URL.
  const { evalId } = useParams();
  const [searchParams] = useSearchParams();
  const id = evalId ?? searchParams.get('evalId');

  return <Eval fetchId={id} />;
}
