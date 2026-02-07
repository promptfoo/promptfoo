import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Notion AI Provider using direct HTTP API calls.
 *
 * This provider makes direct HTTP requests to Notion's AI inference API,
 * mimicking the format used by the Notion web app.
 *
 * Prerequisites:
 * - notion-state.json (captured via scripts/capture-notion-state.js)
 *
 * Config options:
 * - statePath: Path to saved browser state. Defaults to notion-state.json in same dir.
 * - timeout: Request timeout in ms (default: 120000)
 */
class NotionAIHttpProvider {
  constructor(options = {}) {
    this.statePath = options.config?.statePath || path.join(__dirname, 'notion-state.json');
    this.timeout = options.config?.timeout || 120000;
    this.cookies = null;
    this.userId = null;
    this.spaceId = null;
  }

  id() {
    return 'notion-ai-http';
  }

  async loadState() {
    if (this.cookies) return;

    const stateData = JSON.parse(fs.readFileSync(this.statePath, 'utf-8'));

    // Extract cookies
    if (stateData.cookies) {
      this.cookies = stateData.cookies
        .filter((c) => c.domain.includes('notion.so'))
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');

      // Extract user ID from cookie
      const userIdCookie = stateData.cookies.find((c) => c.name === 'notion_user_id');
      if (userIdCookie) {
        this.userId = userIdCookie.value;
      }
    }

    // Extract space ID from localStorage
    if (stateData.origins) {
      for (const origin of stateData.origins) {
        if (origin.origin?.includes('notion.so') && origin.localStorage) {
          for (const item of origin.localStorage) {
            if (item.name?.includes('lastVisitedRouteSpaceId')) {
              try {
                const parsed = JSON.parse(item.value);
                this.spaceId = parsed.value;
              } catch (_e) {
                // Skip parse errors
              }
            }
          }
        }
      }
    }

    if (!this.cookies || !this.userId) {
      throw new Error(
        `Failed to load state from ${this.statePath}. Run 'npm run setup:notion' first.`,
      );
    }

    console.log(`[notion-ai-http] Loaded state: userId=${this.userId}, spaceId=${this.spaceId}`);
  }

  buildRequestBody(prompt) {
    const traceId = randomUUID();
    const threadId = randomUUID();
    const configId = randomUUID();
    const contextId = randomUUID();
    const integrationId = randomUUID();
    const userMsgId = randomUUID();
    const now = new Date().toISOString();

    return {
      traceId,
      spaceId: this.spaceId,
      transcript: [
        {
          id: configId,
          type: 'config',
          value: {
            type: 'workflow',
            enableAgentAutomations: true,
            enableAgentIntegrations: true,
            searchScopes: [{ type: 'everything' }],
            useWebSearch: true,
            useReadOnlyMode: false,
          },
        },
        {
          id: contextId,
          neverCompress: true,
          type: 'context',
          value: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles',
            userId: this.userId,
            spaceId: this.spaceId,
            currentDatetime: now,
            surface: 'ai_module',
          },
        },
        {
          activeRecordPointers: [],
          inactiveRecordPointers: [],
          id: integrationId,
          neverCompress: true,
          threadRecordMap: {
            recordMap: { __version__: 3, space_view: {} },
          },
          type: 'agent-integration',
        },
        {
          id: userMsgId,
          type: 'user',
          value: [[prompt]],
          userId: this.userId,
          createdAt: now,
        },
      ],
      threadId,
      threadParentPointer: {
        table: 'space',
        id: this.spaceId,
        spaceId: this.spaceId,
      },
      createThread: true,
      debugOverrides: {
        emitAgentSearchExtractedResults: true,
        cachedInferences: {},
        annotationInferences: {},
        emitInferences: false,
      },
      generateTitle: true,
      saveAllThreadOperations: true,
      threadType: 'workflow',
      isPartialTranscript: false,
      asPatchResponse: false,
    };
  }

  async makeStreamingRequest(body) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);
      let fullResponse = '';
      const chunks = [];

      const options = {
        hostname: 'www.notion.so',
        port: 443,
        path: '/api/v3/runInferenceTranscript',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          Cookie: this.cookies,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'application/x-ndjson',
          Origin: 'https://www.notion.so',
          Referer: 'https://www.notion.so/ai',
          'x-notion-active-user-header': this.userId,
          'x-notion-space-id': this.spaceId,
        },
      };

      const req = https.request(options, (res) => {
        console.log(`[notion-ai-http] Response status: ${res.statusCode}`);

        res.on('data', (chunk) => {
          const chunkStr = chunk.toString();
          fullResponse += chunkStr;
          chunks.push(chunkStr);
        });

        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${fullResponse.substring(0, 500)}`));
          } else {
            resolve({ statusCode: res.statusCode, data: fullResponse, chunks });
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(this.timeout, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  parseStreamResponse(data) {
    const lines = data.split('\n').filter((l) => l.trim());
    let assistantContent = '';

    // Process lines in reverse to find the complete response first
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(lines[i]);

        if (parsed.type === 'agent-inference' && parsed.finishedAt && Array.isArray(parsed.value)) {
          for (const item of parsed.value) {
            if (item.type === 'text' && item.content) {
              let content = item.content;
              content = content.replace(/<lang[^>]*\/>\s*/g, '');
              assistantContent = content.trim();
            }
          }
          break;
        }
      } catch (_e) {
        // Skip invalid JSON lines
      }
    }

    // Fallback: try to get latest streamed content
    if (!assistantContent) {
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i]);
          if (parsed.type === 'agent-inference' && Array.isArray(parsed.value)) {
            for (const item of parsed.value) {
              if (item.type === 'text' && item.content && !assistantContent) {
                let content = item.content;
                content = content.replace(/<lang[^>]*\/>\s*/g, '');
                assistantContent = content.trim();
              }
            }
            if (assistantContent) break;
          }
        } catch (_e) {
          // Skip invalid JSON lines
        }
      }
    }

    return assistantContent || `Raw response (${data.length} chars): ${data.substring(0, 500)}...`;
  }

  isRateLimitError(response) {
    if (response.data.length < 10000) {
      const lines = response.data.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'error' || parsed.message?.includes('Please try again')) {
            return true;
          }
        } catch (_e) {
          // Not JSON line
        }
      }
      if (response.data.includes('"type":"error"') || response.data.includes('Please try again')) {
        return true;
      }
    }
    return false;
  }

  async callApi(prompt) {
    const maxRetries = 4;
    const baseDelay = 3000;

    try {
      console.log(`[notion-ai-http] Received prompt: ${prompt.substring(0, 100)}...`);
      await this.loadState();

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const requestBody = this.buildRequestBody(prompt);

        if (attempt > 0) {
          const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
          console.log(
            `[notion-ai-http] Retry ${attempt}/${maxRetries} after ${Math.round(delay)}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        console.log('[notion-ai-http] Sending request to runInferenceTranscript...');
        const response = await this.makeStreamingRequest(requestBody);
        console.log(`[notion-ai-http] Received ${response.data.length} bytes`);

        if (this.isRateLimitError(response)) {
          console.warn(`[notion-ai-http] Rate limited (attempt ${attempt + 1}/${maxRetries + 1})`);
          if (attempt === maxRetries) {
            return { error: 'Rate limited after max retries' };
          }
          continue;
        }

        const parsedOutput = this.parseStreamResponse(response.data);
        console.log(`[notion-ai-http] Parsed output: ${parsedOutput.substring(0, 100)}...`);

        return {
          output: parsedOutput,
          metadata: {
            provider: 'notion-ai-http',
            statusCode: response.statusCode,
            rawLength: response.data.length,
            attempt: attempt + 1,
          },
        };
      }

      return { error: 'Max retries exceeded' };
    } catch (error) {
      console.error(`[notion-ai-http] Error: ${error.message}`);
      return { error: error.message || 'Unknown error' };
    }
  }
}

export default NotionAIHttpProvider;
