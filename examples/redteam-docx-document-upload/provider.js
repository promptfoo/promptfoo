import { randomUUID } from 'node:crypto';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOCX_DATA_URI_PREFIX = `data:${DOCX_MIME_TYPE};base64,`;
const DEFAULT_APP_BASE_URL = 'https://example-app.promptfoo.app';
const DEFAULT_DOMAIN = 'general';
const DEFAULT_LEVEL = 'minnow';
const DEFAULT_SUMMARY_REQUEST = 'Please summarize the uploaded document in one concise paragraph.';

function getStringVar(vars, key) {
  return typeof vars[key] === 'string' && vars[key].trim() ? vars[key] : undefined;
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '');
}

function decodeDocxDataUri(documentInput) {
  if (!documentInput.startsWith(DOCX_DATA_URI_PREFIX)) {
    throw new Error(
      `Expected vars.document to be a DOCX data URI starting with "${DOCX_DATA_URI_PREFIX}". Configure the target input as type: docx.`,
    );
  }

  return Buffer.from(documentInput.slice(DOCX_DATA_URI_PREFIX.length), 'base64');
}

class DocumentUploadProvider {
  constructor(options = {}) {
    this.providerId = 'example-app-document-upload-provider';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async uploadDocument(documentInput) {
    const appBaseUrl = normalizeBaseUrl(this.config.appBaseUrl || DEFAULT_APP_BASE_URL);
    const docxBuffer = decodeDocxDataUri(documentInput);
    const formData = new FormData();

    formData.append(
      'document',
      new Blob([docxBuffer], { type: DOCX_MIME_TYPE }),
      `promptfoo-${randomUUID()}.docx`,
    );

    const response = await fetch(`${appBaseUrl}/documents`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Document upload failed (${response.status}): ${errorBody}`);
    }

    const uploadResult = await response.json();
    if (!uploadResult?.document_id) {
      throw new Error(
        `Document upload response did not include document_id: ${JSON.stringify(uploadResult)}`,
      );
    }

    return uploadResult.document_id;
  }

  async callApi(prompt, context) {
    const vars = context?.vars || {};
    const documentInput = getStringVar(vars, 'document');
    if (!documentInput) {
      throw new Error(
        'Missing vars.document: Expected a DOCX data URI. Configure the target input "document" with type: docx.',
      );
    }
    const userQuestion = getStringVar(vars, 'question') || DEFAULT_SUMMARY_REQUEST;
    const appBaseUrl = normalizeBaseUrl(this.config.appBaseUrl || DEFAULT_APP_BASE_URL);
    const level = this.config.level || DEFAULT_LEVEL;
    const domain = this.config.domain || DEFAULT_DOMAIN;
    const documentId = await this.uploadDocument(documentInput);
    const finalQuestion = [
      `Use summarize_document with document_id "${documentId}".`,
      `Then answer the user's request: ${userQuestion}`,
    ].join(' ');

    const response = await fetch(
      `${appBaseUrl}/${level}/chat?domain=${encodeURIComponent(domain)}&enable_tools=true`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: finalQuestion,
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Chat request failed (${response.status}): ${errorBody}`);
    }

    const chatResult = await response.json();

    return {
      output:
        typeof chatResult?.output === 'string' ? chatResult.output : JSON.stringify(chatResult),
      raw: JSON.stringify({
        document_id: documentId,
        chat_response: chatResult,
      }),
    };
  }
}

export default DocumentUploadProvider;
