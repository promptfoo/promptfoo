import { usePageMeta } from '@app/hooks/usePageMeta';
import ModelAuditResultLatestPage from './ModelAuditResultLatestPage';

export default function ModelAuditLatestPage() {
  usePageMeta({
    title: 'Model Audit',
    description: 'Review the latest model audit scan results',
  });

  return <ModelAuditResultLatestPage />;
}
