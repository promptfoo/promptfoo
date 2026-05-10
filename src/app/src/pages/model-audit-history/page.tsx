import { usePageMeta } from '@app/hooks/usePageMeta';
import ModelAuditHistory from './ModelAuditHistory';

export default function ModelAuditHistoryPage() {
  usePageMeta({ title: 'Model Audit History', description: 'Browse model security scan history' });
  return <ModelAuditHistory />;
}
