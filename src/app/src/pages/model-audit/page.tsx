import React from 'react';
import ErrorBoundary from '../../components/ErrorBoundary';
import ModelAudit from './ModelAudit';

function ModelAuditPageContent() {
  return <ModelAudit />;
}

export default function ModelAuditPage() {
  return (
    <ErrorBoundary name="Model Audit Page">
      <ModelAuditPageContent />
    </ErrorBoundary>
  );
}
