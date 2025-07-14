import { usePageMeta } from '@app/hooks/usePageMeta';
import EvaluateTestSuiteCreator from './components/EvaluateTestSuiteCreator';
import { ErrorNotificationProvider } from './hooks/useErrorNotification';

export default function EvalCreatorPage() {
  usePageMeta({ title: 'Set up', description: 'Create a new eval configuration' });
  return (
    <ErrorNotificationProvider>
      <EvaluateTestSuiteCreator />
    </ErrorNotificationProvider>
  );
}
