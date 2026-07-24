import { usePageMeta } from '@app/hooks/usePageMeta';
import ModelAuditSetupPage from './ModelAuditSetupPage';

export default function ModelAuditSetupRoute() {
  usePageMeta({
    title: 'Model Audit Setup',
    description: 'Configure and run a model audit security scan',
  });

  return <ModelAuditSetupPage />;
}
