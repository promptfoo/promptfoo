import ErrorBoundary from '../../components/ErrorBoundary';
import ModelAudit from './ModelAudit';

function ModelAuditPageContent() {
  return <ModelAudit />;
}

export default function ModelAuditPage() {
  return (
    <>
      <title>Model audit | promptfoo</title>
      <meta name="description" content="Scan models for policy issues" />
      <ErrorBoundary name="Model Audit Page">
        <ModelAuditPageContent />
      </ErrorBoundary>
    </>
  );
}
