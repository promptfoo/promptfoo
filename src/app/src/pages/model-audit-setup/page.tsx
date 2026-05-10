import { usePageMeta } from '@app/hooks/usePageMeta';
import ModelAuditSetupPage from './ModelAuditSetupPage';

export default function ModelAuditSetup() {
  usePageMeta({ title: 'Model Audit Setup', description: 'Configure a model security scan' });
  return <ModelAuditSetupPage />;
}
