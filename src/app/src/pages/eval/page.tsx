import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Eval from '@app/pages/eval/components/Eval';

export default function EvalPage() {
  const { evalId } = useParams();

  useEffect(() => {
    document.title = evalId ? `Evaluation #${evalId} | promptfoo` : 'Evaluations | promptfoo';
  }, [evalId]);

  return <Eval fetchId={evalId} />;
}
