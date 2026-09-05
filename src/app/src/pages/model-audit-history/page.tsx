import { usePageMeta } from '@app/hooks/usePageMeta';
import ModelAuditHistory from './ModelAuditHistory';

export default function ModelAuditHistoryPage() {
  usePageMeta({
    title: 'Model Audit History',
    description: 'Browse model audit scan history',
  });

  return <ModelAuditHistory />;
}
