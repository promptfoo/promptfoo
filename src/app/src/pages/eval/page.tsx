import { useParams } from 'react-router-dom';
import Eval from '@app/pages/eval/components/Eval';

export default function EvalPage() {
  const { evalId } = useParams();
  return <Eval fetchId={evalId} />;
}
