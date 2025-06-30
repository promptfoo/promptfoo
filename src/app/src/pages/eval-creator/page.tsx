import { usePageMeta } from '@app/hooks/usePageMeta';
import EvaluateTestSuiteCreator from './components/EvaluateTestSuiteCreator';

export default function EvalCreatorPage() {
  usePageMeta({ title: 'Setup', description: 'Create a new eval configuration' });
  return <EvaluateTestSuiteCreator />;
}
