import { useState } from 'react';

import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { DEFAULT_VERTEX_TARGET_ID, VERTEX_RESPONSES_PREFIX } from '../constants';
import { SetupSection } from '../SetupSection';
import FoundationModelConfiguration from './FoundationModelConfiguration';
import { getVertexResponsesModelIdError } from './helpers';
import ModelTokenLimitField from './ModelTokenLimitField';

import type { ProviderOptions } from '../../types';

interface VertexConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
}

export default function VertexConfiguration({
  selectedTarget,
  updateCustomTarget,
}: VertexConfigurationProps) {
  const { id, config } = selectedTarget;
  const isResponses = id.startsWith(VERTEX_RESPONSES_PREFIX);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const modelError = getVertexResponsesModelIdError(id);

  const switchRoute = (nextId: string) => {
    const nextIsResponses = nextId.startsWith(VERTEX_RESPONSES_PREFIX);
    const { projectId, credentials, keyFilename, googleAuthOptions, scopes } = config ?? {};
    const tokenLimit = isResponses ? config?.max_output_tokens : config?.max_tokens;
    // Retain the Google OAuth identity, but don't copy keys, endpoints, or tools.
    const { apiKey: _apiKey, ...oauthOptions } = googleAuthOptions ?? {};
    updateCustomTarget('config', {
      region: 'global',
      ...(projectId !== undefined && { projectId }),
      ...(credentials !== undefined && { credentials }),
      ...(keyFilename !== undefined && { keyFilename }),
      ...(Object.keys(oauthOptions).length > 0 && { googleAuthOptions: oauthOptions }),
      ...(scopes !== undefined && { scopes }),
      ...(typeof tokenLimit === 'number' && {
        [nextIsResponses ? 'max_output_tokens' : 'max_tokens']: tokenLimit,
      }),
      ...(nextIsResponses && { store: false }),
    });
    updateCustomTarget('id', nextId);
  };

  const apiSelector = (
    <div className="mb-4 space-y-2">
      <Label htmlFor="vertex-api-mode">Vertex AI API</Label>
      <select
        id="vertex-api-mode"
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
        value={isResponses ? 'responses' : 'vertex'}
        aria-describedby="vertex-api-help"
        onChange={(event) =>
          switchRoute(
            event.target.value === 'responses' ? VERTEX_RESPONSES_PREFIX : DEFAULT_VERTEX_TARGET_ID,
          )
        }
      >
        <option value="vertex">Gemini, Claude, and other Vertex models</option>
        <option value="responses">OpenAI Responses</option>
      </select>
      <p id="vertex-api-help" className="text-sm text-muted-foreground">
        Switching APIs resets the model and API-specific settings.
      </p>
    </div>
  );

  if (!isResponses) {
    return (
      <FoundationModelConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={updateCustomTarget}
        providerType="vertex"
        beforeModel={apiSelector}
        onModelIdChange={(value) => {
          const nextId = value.trim();
          if (!nextId.startsWith(VERTEX_RESPONSES_PREFIX)) {
            return false;
          }
          switchRoute(nextId);
          return true;
        }}
      />
    );
  }

  return (
    <div className="mt-4">
      <h3 className="mb-4 text-lg font-semibold">Google Vertex AI Configuration</h3>
      <div className="rounded-lg border border-border p-4">
        {apiSelector}
        <div className="space-y-2">
          <Label htmlFor="model-id">
            Model ID <span className="text-destructive">*</span>
          </Label>
          <Input
            id="model-id"
            value={id.slice(VERTEX_RESPONSES_PREFIX.length)}
            placeholder="gpt-6-luna"
            aria-invalid={Boolean(modelError)}
            aria-describedby={modelError ? 'vertex-model-error' : 'vertex-responses-model-help'}
            onChange={(event) => {
              const value = event.target.value.trim();
              updateCustomTarget(
                'id',
                value.startsWith(VERTEX_RESPONSES_PREFIX) ? value : VERTEX_RESPONSES_PREFIX + value,
              );
            }}
          />
          {modelError && (
            <p id="vertex-model-error" role="alert" className="text-sm text-destructive">
              {modelError}
            </p>
          )}
          <p id="vertex-responses-model-help" className="text-sm text-muted-foreground">
            Use the exact OpenAI model ID enabled for your Google Cloud project. See{' '}
            <a
              href="https://www.promptfoo.dev/docs/providers/vertex/#openai-models-private-preview"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Google Vertex AI documentation
            </a>
            .
          </p>
          <Label htmlFor="vertex-responses-project">Google Cloud Project ID</Label>
          <Input
            id="vertex-responses-project"
            value={config?.projectId ?? ''}
            placeholder="your-google-cloud-project"
            aria-describedby="vertex-responses-auth"
            onChange={(event) =>
              updateCustomTarget('projectId', event.target.value.trim() || undefined)
            }
          />
          <p id="vertex-responses-auth" className="text-sm text-muted-foreground">
            Uses Google OAuth, not an OpenAI or Gemini API key. If no Google credentials are
            configured, it uses Application Default Credentials on the eval runner. Leave the
            project blank to use <code>GOOGLE_CLOUD_PROJECT</code>.
          </p>
          {config?.apiBaseUrl && (
            <p className="text-sm text-muted-foreground">
              This config has a custom endpoint. Google OAuth credentials are sent to that endpoint.
              Only use an endpoint you trust.
            </p>
          )}
        </div>
        <SetupSection
          title="Advanced Configuration"
          description="Model parameters and API settings"
          isExpanded={isAdvancedOpen}
          onExpandedChange={setIsAdvancedOpen}
          className="mt-4"
        >
          <ModelTokenLimitField
            label="Max Output Tokens"
            min={1}
            value={config?.max_output_tokens}
            onChange={(value) => updateCustomTarget('max_output_tokens', value)}
          />
        </SetupSection>
      </div>
    </div>
  );
}
