import { useEffect } from 'react';
import EvaluateTestSuiteCreator from './components/EvaluateTestSuiteCreator';

export default function EvalCreatorPage() {
  useEffect(() => {
    document.title = 'Create Evaluation | promptfoo';
  }, []);

  return <EvaluateTestSuiteCreator />;
}
