import { usePageMeta } from '@app/hooks/usePageMeta';
import ModelAuditResult from './ModelAuditResult';

export default function ModelAuditResultPage() {
  usePageMeta({ title: 'Model Audit Result', description: 'Review model security scan results' });
  return <ModelAuditResult />;
}
