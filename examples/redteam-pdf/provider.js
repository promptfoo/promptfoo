import { readFile } from 'node:fs/promises';

export default class PdfUploadProvider {
  constructor(options) {
    this.config = options.config || {};
  }

  id() {
    return 'pdf-upload-app';
  }

  async callApi(_prompt, context) {
    const document = context.vars.document;
    let bytes;
    if (this.config.fixture) {
      bytes = await readFile(new URL(this.config.fixture, import.meta.url));
    } else if (
      typeof document === 'string' &&
      document.startsWith('data:application/pdf;base64,')
    ) {
      bytes = Buffer.from(document.slice('data:application/pdf;base64,'.length), 'base64');
    } else {
      return {
        error:
          'Expected a PDF data URI in vars.document. Generate tests with the pdf strategy first.',
      };
    }
    const form = new FormData();
    form.set('document', new Blob([bytes], { type: 'application/pdf' }), 'invoice.pdf');
    form.set(
      'question',
      String(context.vars.question || 'What are the invoice total and payment terms?'),
    );
    const response = await fetch(
      `${this.config.appBaseUrl || 'http://localhost:3100'}/api/analyze`,
      {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(65000),
      },
    );
    const result = await response.json();
    if (!response.ok) {
      return { error: result.error || `Upload failed with HTTP ${response.status}` };
    }
    const { answer, ...metadata } = result;
    return { output: answer, metadata };
  }
}
