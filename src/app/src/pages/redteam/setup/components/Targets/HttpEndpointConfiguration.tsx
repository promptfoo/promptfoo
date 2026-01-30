import './syntax-highlighting.css';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';

import { useCallback, useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@app/components/ui/dropdown-menu';
import { HelperText } from '@app/components/ui/helper-text';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Switch } from '@app/components/ui/switch';
import { cn } from '@app/lib/utils';
import { callApi } from '@app/utils/api';
import yaml from 'js-yaml';
import {
  AlignLeft,
  Check,
  ChevronDown,
  Copy,
  Globe,
  Maximize2,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Prism from 'prismjs';
import Editor from 'react-simple-code-editor';
import { ConfigAgentDrawer } from '../ConfigAgent';
import HttpAdvancedConfiguration from './HttpAdvancedConfiguration';
import PostmanImportDialog from './PostmanImportDialog';
import ResponseParserTestModal from './ResponseParserTestModal';
import TestSection from './TestSection';

import type { DiscoveredConfig } from '../../hooks/useConfigAgent';
import type { ProviderOptions } from '../../types';
import type { TestResult } from './TestSection';

interface HttpEndpointConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
  bodyError: string | React.ReactNode | null;
  setBodyError: (error: string | React.ReactNode | null) => void;
  urlError: string | null;
  setUrlError: (error: string | null) => void;
  onTargetTested?: (success: boolean) => void;
  onSessionTested?: (success: boolean) => void;
}

interface GeneratedConfig {
  id: string;
  config: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    request?: string;
    transformRequest?: string;
    transformResponse?: string;
    sessionParser?: string;
  };
}

const highlightJS = (code: string): string => {
  try {
    const grammar = Prism?.languages?.javascript;
    if (!grammar) {
      return code;
    }
    return Prism.highlight(code, grammar, 'javascript');
  } catch {
    return code;
  }
};

const HttpEndpointConfiguration = ({
  selectedTarget,
  updateCustomTarget,
  bodyError,
  setBodyError,
  urlError,
  setUrlError,
  onTargetTested,
  onSessionTested,
}: HttpEndpointConfigurationProps): React.ReactElement => {
  const [requestBody, setRequestBody] = useState(
    typeof selectedTarget.config.body === 'string'
      ? selectedTarget.config.body
      : JSON.stringify(selectedTarget.config.body, null, 2) || '',
  );
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>(
    Object.entries(selectedTarget.config.headers || {}).map(([key, value]) => ({
      key,
      value: String(value),
    })),
  );

  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [request, setRequest] = useState(
    `POST /v1/chat HTTP/1.1
Host: api.example.com
Content-Type: application/json

{
  "messages": [
    {
      "role": "user",
      "content": "{{prompt}}"
    }
  ]
}`,
  );
  const [response, setResponse] = useState(
    `{
  "response": "Hello! How can I help you today?",
  "metadata": {
    "model": "gpt-3.5-turbo",
    "tokens": 12
  }
}`,
  );
  const [generatedConfig, setGeneratedConfig] = useState<GeneratedConfig | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // Import menu state
  const [postmanDialogOpen, setPostmanDialogOpen] = useState(false);
  const [configAgentOpen, setConfigAgentOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Test Target state
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testDetailsExpanded, setTestDetailsExpanded] = useState(false);

  // Response transform test state
  const [responseTestOpen, setResponseTestOpen] = useState(false);

  // Request body expand state
  const [requestBodyExpanded, setRequestBodyExpanded] = useState(false);

  // Handle test target
  const handleTestTarget = useCallback(async () => {
    setIsTestRunning(true);
    setTestResult(null);

    // Validate URL before testing (skip validation for raw request mode)
    if (!selectedTarget.config?.request) {
      const targetUrl = selectedTarget.config?.url;
      if (!targetUrl || targetUrl.trim() === '' || targetUrl === 'http') {
        setTestResult({
          success: false,
          message:
            'Please configure a valid HTTP URL for your target. Enter a complete URL (e.g., https://api.example.com/endpoint).',
        });
        setTestDetailsExpanded(true);
        setIsTestRunning(false);
        onTargetTested?.(false);
        return;
      }
    }

    try {
      const response = await callApi('/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerOptions: selectedTarget }),
      });

      if (response.ok) {
        const data = await response.json();

        // Check for changes_needed field (configuration issues) or success field
        const hasConfigIssues = data.testResult?.changes_needed === true;
        const isSuccess = hasConfigIssues ? false : (data.testResult?.success ?? true);

        // Build the message based on the response
        let message = data.testResult?.message ?? 'Target configuration is valid!';
        if (hasConfigIssues) {
          message = data.testResult?.changes_needed_reason || 'Configuration changes are needed';
        }

        setTestResult({
          success: isSuccess,
          message: message,
          providerResponse: data.providerResponse || {},
          transformedRequest: data.transformedRequest,
          changes_needed: hasConfigIssues,
          changes_needed_suggestions: data.testResult?.changes_needed_suggestions,
        });
        setTestDetailsExpanded(!isSuccess || hasConfigIssues);
        onTargetTested?.(isSuccess);
      } else {
        const errorData = await response.json();
        setTestResult({
          success: false,
          message: errorData.error || 'Failed to test target configuration',
          providerResponse: errorData.providerResponse || {},
          transformedRequest: errorData.transformedRequest,
        });
        setTestDetailsExpanded(true);
        onTargetTested?.(false);
      }
    } catch (error) {
      console.error('Error testing target:', error);
      let errorMessage = 'Failed to test target configuration';
      if (error instanceof Error) {
        if (
          error.message.includes('Failed to parse URL') ||
          error.message.includes('Invalid URL')
        ) {
          errorMessage =
            'Invalid URL configuration. Please enter a complete URL (e.g., https://api.example.com/endpoint).';
        } else {
          errorMessage = error.message;
        }
      }
      setTestResult({
        success: false,
        message: errorMessage,
      });
      setTestDetailsExpanded(true);
      onTargetTested?.(false);
    } finally {
      setIsTestRunning(false);
    }
  }, [selectedTarget, onTargetTested]);

  // Auto-size the raw request textarea between 10rem and 40rem based on line count
  const computeRawTextareaHeight = useCallback((text: string) => {
    const lineCount = (text?.match(/\n/g)?.length || 0) + 1;
    const lineHeightPx = 20; // approx for 14px monospace
    const minPx = 10 * 16; // ~10rem
    const maxPx = 40 * 16; // ~40rem
    const desired = lineCount * lineHeightPx + 20; // padding allowance
    return `${Math.min(maxPx, Math.max(minPx, desired))}px`;
  }, []);

  const resetState = useCallback(
    (isRawMode: boolean) => {
      setBodyError(null);
      setUrlError(null);

      if (isRawMode) {
        // Reset to empty raw request
        updateCustomTarget('request', '');

        // Clear structured mode fields
        updateCustomTarget('url', undefined);
        updateCustomTarget('method', undefined);
        updateCustomTarget('headers', undefined);
        updateCustomTarget('body', undefined);
      } else {
        // Reset to empty structured fields
        setHeaders([]);
        setRequestBody('');

        // Clear raw request
        updateCustomTarget('request', undefined);

        // Reset structured fields
        updateCustomTarget('url', '');
        updateCustomTarget('method', 'POST');
        updateCustomTarget('headers', {});
        updateCustomTarget('body', '');
        updateCustomTarget('useHttps', false);
      }
    },
    [updateCustomTarget, setBodyError, setUrlError],
  );

  // Header management
  const addHeader = useCallback(() => {
    setHeaders((prev) => [...prev, { key: '', value: '' }]);
  }, []);

  const removeHeader = useCallback(
    (index: number) => {
      setHeaders((prev) => {
        const newHeaders = [...prev];
        newHeaders.splice(index, 1);

        // Update target configuration inside setState callback
        const headerObj = newHeaders.reduce(
          (acc, { key, value }) => {
            if (key) {
              acc[key] = value;
            }
            return acc;
          },
          {} as Record<string, string>,
        );
        updateCustomTarget('headers', headerObj);

        return newHeaders;
      });
    },
    [updateCustomTarget],
  );

  const updateHeaderKey = useCallback(
    (index: number, newKey: string) => {
      setHeaders((prev) => {
        const newHeaders = [...prev];
        newHeaders[index] = { ...newHeaders[index], key: newKey };

        // Update target configuration inside setState callback
        const headerObj = newHeaders.reduce(
          (acc, { key, value }) => {
            if (key) {
              acc[key] = value;
            }
            return acc;
          },
          {} as Record<string, string>,
        );
        updateCustomTarget('headers', headerObj);

        return newHeaders;
      });
    },
    [updateCustomTarget],
  );

  const updateHeaderValue = useCallback(
    (index: number, newValue: string) => {
      setHeaders((prev) => {
        const newHeaders = [...prev];
        newHeaders[index] = { ...newHeaders[index], value: newValue };

        // Update target configuration inside setState callback
        const headerObj = newHeaders.reduce(
          (acc, { key, value }) => {
            if (key) {
              acc[key] = value;
            }
            return acc;
          },
          {} as Record<string, string>,
        );
        updateCustomTarget('headers', headerObj);

        return newHeaders;
      });
    },
    [updateCustomTarget],
  );

  const handleRequestBodyChange = (content: string) => {
    setRequestBody(content);

    // Validate JSON if content is not empty
    if (content.trim()) {
      try {
        JSON.parse(content);
        setBodyError(null); // Clear error if JSON is valid
      } catch (e) {
        const message = e instanceof SyntaxError ? e.message : 'Invalid JSON';
        setBodyError(message);
      }
    } else {
      setBodyError(null); // Clear error for empty content
    }

    updateCustomTarget('body', content);
  };

  const handleFormatJson = () => {
    if (requestBody.trim()) {
      try {
        const parsed = JSON.parse(requestBody);
        const formatted = JSON.stringify(parsed, null, 2);
        setRequestBody(formatted);
        updateCustomTarget('body', formatted);
        setBodyError(null);
      } catch (e) {
        const message = e instanceof SyntaxError ? e.message : 'Invalid JSON';
        setBodyError(`Cannot format: ${message}`);
      }
    }
  };

  const handleRawRequestChange = (value: string) => {
    updateCustomTarget('request', value);
  };

  // Note to Michael: don't dedent this, we want to preserve JSON formatting.
  const exampleRequest = `POST /v1/chat/completions HTTP/1.1
Host: api.example.com
Content-Type: application/json
Authorization: Bearer {{api_key}}

{
  "messages": [
    {
      "role": "user",
      "content": "{{prompt}}"
    }
  ]
}`;
  const placeholderText = `Enter your HTTP request here. Example:

${exampleRequest}`;

  const handleGenerateConfig = async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await callApi('/providers/http-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestExample: request,
          responseExample: response,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      setGeneratedConfig(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An error occurred');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (generatedConfig) {
      navigator.clipboard.writeText(yaml.dump(generatedConfig.config));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleApply = () => {
    if (generatedConfig) {
      if (generatedConfig.config.request) {
        resetState(true);
        updateCustomTarget('request', generatedConfig.config.request);
      } else {
        resetState(false);
        if (generatedConfig.config.url) {
          updateCustomTarget('url', generatedConfig.config.url);
        }
        if (generatedConfig.config.method) {
          updateCustomTarget('method', generatedConfig.config.method);
        }
        if (generatedConfig.config.headers) {
          updateCustomTarget('headers', generatedConfig.config.headers);
          setHeaders(
            Object.entries(generatedConfig.config.headers).map(([key, value]) => ({
              key,
              value: String(value),
            })),
          );
        }
        if (generatedConfig.config.body) {
          // First update the internal state
          const formattedBody =
            typeof generatedConfig.config.body === 'string'
              ? generatedConfig.config.body
              : JSON.stringify(generatedConfig.config.body, null, 2);
          setRequestBody(formattedBody);

          // Then update the target config with the original value
          updateCustomTarget('body', generatedConfig.config.body);
        }
      }
      updateCustomTarget('transformRequest', generatedConfig.config.transformRequest);
      updateCustomTarget('transformResponse', generatedConfig.config.transformResponse);
      updateCustomTarget('sessionParser', generatedConfig.config.sessionParser);
      setConfigDialogOpen(false);
    }
  };

  const handlePostmanImport = (config: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  }) => {
    // Apply the configuration
    resetState(false);
    updateCustomTarget('url', config.url);
    updateCustomTarget('method', config.method);
    updateCustomTarget('headers', config.headers);
    setHeaders(
      Object.entries(config.headers).map(([key, value]) => ({
        key,
        value: String(value),
      })),
    );

    if (config.body) {
      setRequestBody(config.body);
      updateCustomTarget('body', config.body);
    }
  };

  const handleConfigAgentDiscovered = useCallback(
    (discoveredConfig: DiscoveredConfig) => {
      // Apply the discovered configuration
      resetState(false);

      // Build the URL from baseUrl + path
      const baseUrl = selectedTarget.config.url || '';
      const fullUrl = discoveredConfig.path
        ? `${baseUrl.replace(/\/$/, '')}${discoveredConfig.path}`
        : baseUrl;

      updateCustomTarget('url', fullUrl);
      updateCustomTarget('method', discoveredConfig.method);

      if (discoveredConfig.headers) {
        updateCustomTarget('headers', discoveredConfig.headers);
        setHeaders(
          Object.entries(discoveredConfig.headers).map(([key, value]) => ({
            key,
            value: String(value),
          })),
        );
      }

      if (discoveredConfig.body) {
        const formattedBody =
          typeof discoveredConfig.body === 'string'
            ? discoveredConfig.body
            : JSON.stringify(discoveredConfig.body, null, 2);
        setRequestBody(formattedBody);
        updateCustomTarget('body', discoveredConfig.body);
      }

      if (discoveredConfig.transformResponse) {
        updateCustomTarget('transformResponse', discoveredConfig.transformResponse);
      }

      setConfigAgentOpen(false);
    },
    [resetState, updateCustomTarget, selectedTarget.config.url],
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id="use-raw-request"
            checked={Boolean(selectedTarget.config.request)}
            onCheckedChange={(checked) => {
              resetState(checked);
              if (checked) {
                updateCustomTarget('request', exampleRequest);
              }
            }}
          />
          <Label htmlFor="use-raw-request">Use Raw HTTP Request</Label>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              Import
              <ChevronDown className="ml-2 size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setConfigAgentOpen(true)}>
              <Sparkles className="mr-2 size-4" />
              Auto-Configure from URL
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setConfigDialogOpen(true)}>
              <AlignLeft className="mr-2 size-4" />
              Auto-fill from Example
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPostmanDialogOpen(true)}>
              <Globe className="mr-2 size-4" />
              Postman
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Main configuration box containing everything */}
      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        {selectedTarget.config.request ? (
          <>
            <div className="mb-4 flex items-center gap-2">
              <Switch
                id="use-https"
                checked={selectedTarget.config.useHttps}
                onCheckedChange={(checked) => {
                  updateCustomTarget('useHttps', checked);
                }}
              />
              <Label htmlFor="use-https">Use HTTPS</Label>
            </div>
            <textarea
              value={selectedTarget.config.request || ''}
              onChange={(e) => handleRawRequestChange(e.target.value)}
              placeholder={placeholderText}
              className="w-full resize-y overflow-auto whitespace-pre rounded-md border border-border bg-transparent p-2.5 font-mono text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              style={{
                height: computeRawTextareaHeight(selectedTarget.config.request || ''),
                minHeight: '10rem',
                maxHeight: '40rem',
              }}
            />
            {bodyError && <HelperText error>{bodyError}</HelperText>}
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="url">
                URL <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Select
                  value={selectedTarget.config.method}
                  onValueChange={(value) => updateCustomTarget('method', value)}
                >
                  <SelectTrigger id="method" className="w-24 shrink-0">
                    <SelectValue placeholder="Method" />
                  </SelectTrigger>
                  <SelectContent>
                    {['GET', 'POST'].map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="url"
                  value={selectedTarget.config.url}
                  onChange={(e) => updateCustomTarget('url', e.target.value)}
                  className={cn('flex-1', urlError && 'border-destructive')}
                  placeholder="https://example.com/api/chat"
                />
              </div>
              {urlError && <HelperText error>{urlError}</HelperText>}
            </div>

            <p className="mb-2 mt-6 font-medium">Headers</p>
            {headers.map(({ key, value }, index) => (
              <div key={index} className="mb-2 flex items-center gap-2">
                <Input
                  value={key}
                  onChange={(e) => updateHeaderKey(index, e.target.value)}
                  placeholder="Name"
                  className="flex-1"
                />
                <Input
                  value={value}
                  onChange={(e) => updateHeaderValue(index, e.target.value)}
                  placeholder="Value"
                  className="flex-1"
                />
                <Button variant="ghost" size="icon" onClick={() => removeHeader(index)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}

            <Button variant="outline" onClick={addHeader} className="mt-2">
              <Plus className="mr-1 size-4" />
              Add Header
            </Button>

            <div className="mb-2 mt-6 flex items-center justify-between">
              <p className="font-medium">Request Body</p>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleFormatJson}
                  disabled={!requestBody.trim() || !!bodyError}
                  title={bodyError ? 'Fix JSON errors first' : 'Format JSON'}
                  aria-label="Format JSON"
                  className="size-8"
                >
                  <AlignLeft className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRequestBodyExpanded(true)}
                  title="Expand editor"
                  aria-label="Expand editor"
                  className="size-8"
                >
                  <Maximize2 className="size-4" />
                </Button>
              </div>
            </div>
            <div
              className={cn(
                'max-h-[400px] overflow-auto rounded-md border bg-white dark:bg-zinc-900',
                bodyError ? 'border-destructive' : 'border-border',
              )}
            >
              <Editor
                value={
                  typeof requestBody === 'object'
                    ? JSON.stringify(requestBody, null, 2)
                    : requestBody || ''
                }
                onValueChange={handleRequestBodyChange}
                highlight={(code) => code}
                padding={10}
                style={{
                  fontFamily: '"Fira code", "Fira Mono", monospace',
                  fontSize: 14,
                  minHeight: '100px',
                }}
              />
            </div>
            {bodyError && <HelperText error>{bodyError}</HelperText>}
          </>
        )}

        {/* Response Transform Section - Common for both modes */}
        <p className="mb-2 mt-6 font-medium">Response Parser</p>
        <div className="mb-4 text-sm text-muted-foreground">
          <p>
            This tells promptfoo how to extract the AI's response from your API. Most APIs return
            JSON with the actual response nested inside - this parser helps find the right part.
            Leave empty if your API returns plain text. See{' '}
            <a
              href="https://www.promptfoo.dev/docs/providers/http/#response-transform"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              docs
            </a>{' '}
            for examples.
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer">Examples</summary>
            <ol className="ml-4 mt-2 list-decimal space-y-1">
              <li>
                A JavaScript object path: <code>json.choices[0].message.content</code>
              </li>
              <li>
                A function: <code>{`(json, text) => json.choices[0].message.content || text`}</code>
              </li>
              <li>
                With guardrails:{' '}
                <code>{`{ output: json.data, guardrails: { flagged: context.response.status === 500 } }`}</code>
              </li>
            </ol>
          </details>
        </div>
        <div className="relative rounded-md border border-border bg-white dark:bg-zinc-900">
          <Editor
            value={selectedTarget.config.transformResponse || ''}
            onValueChange={(code) => updateCustomTarget('transformResponse', code)}
            highlight={highlightJS}
            padding={10}
            placeholder={'json.choices[0].message.content'}
            style={{
              fontFamily: '"Fira code", "Fira Mono", monospace',
              fontSize: 14,
              minHeight: '150px',
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setResponseTestOpen(true)}
            className="absolute right-2 top-2 z-10"
          >
            <Play className="mr-1 size-4" />
            Test
          </Button>
        </div>

        {/* Test Target Section - Common for both modes */}
        <TestSection
          selectedTarget={selectedTarget}
          isTestRunning={isTestRunning}
          testResult={testResult}
          handleTestTarget={handleTestTarget}
          disabled={
            selectedTarget.config.request
              ? !selectedTarget.config.request
              : !selectedTarget.config.url
          }
          detailsExpanded={testDetailsExpanded}
          onDetailsExpandedChange={setTestDetailsExpanded}
        />
      </div>

      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Generate HTTP Configuration</DialogTitle>
          </DialogHeader>
          <p className="mb-2 text-sm text-muted-foreground">
            Paste an example HTTP request and optionally a response. Promptfoo will automatically
            generate the configuration for you.
          </p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <p className="mb-2 text-lg font-semibold">
                Example Request (paste your HTTP request here)
              </p>
              <div className="h-[300px] overflow-auto rounded-lg border border-border bg-muted/30 dark:bg-zinc-900">
                <Editor
                  value={request}
                  onValueChange={(val) => setRequest(val)}
                  highlight={(code) => code}
                  padding={10}
                  style={{
                    fontFamily: '"Fira code", "Fira Mono", monospace',
                    fontSize: 14,
                    minHeight: '100%',
                  }}
                />
              </div>
            </div>
            <div>
              <p className="mb-2 text-lg font-semibold">
                Example Response (optional, improves accuracy)
              </p>
              <div className="h-[300px] overflow-auto rounded-lg border border-border bg-muted/30 dark:bg-zinc-900">
                <Editor
                  value={response}
                  onValueChange={(val) => setResponse(val)}
                  highlight={(code) => code}
                  padding={10}
                  style={{
                    fontFamily: '"Fira code", "Fira Mono", monospace',
                    fontSize: 14,
                    minHeight: '100%',
                  }}
                />
              </div>
            </div>
            {error && (
              <div className="col-span-2">
                <p className="text-destructive">Error: {error}</p>
              </div>
            )}
            {generatedConfig && (
              <div className="col-span-2">
                <div className="mb-2 mt-4 flex items-center">
                  <p className="flex-1 text-lg font-semibold">Generated Configuration</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopy}
                    title={copied ? 'Copied!' : 'Copy to clipboard'}
                  >
                    {copied ? (
                      <Check className="size-4 text-emerald-600" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>
                <div className="h-80 overflow-auto rounded-lg border border-border bg-muted/30 dark:bg-zinc-900">
                  <Editor
                    value={yaml.dump(generatedConfig.config)}
                    onValueChange={() => {}} // Read-only
                    highlight={(code) => code}
                    padding={10}
                    style={{
                      fontFamily: '"Fira code", "Fira Mono", monospace',
                      fontSize: 14,
                      minHeight: '100%',
                    }}
                    readOnly
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={generatedConfig ? 'outline' : 'default'}
              onClick={handleGenerateConfig}
              disabled={generating}
            >
              {generating ? 'Generating...' : 'Generate'}
            </Button>
            {generatedConfig && <Button onClick={handleApply}>Apply Configuration</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Postman Import Dialog */}
      <PostmanImportDialog
        open={postmanDialogOpen}
        onClose={() => setPostmanDialogOpen(false)}
        onImport={handlePostmanImport}
      />

      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={updateCustomTarget}
        defaultRequestTransform={selectedTarget.config.transformRequest}
        onSessionTested={onSessionTested}
      />

      {/* Response Transform Test Dialog */}
      <ResponseParserTestModal
        open={responseTestOpen}
        onClose={() => setResponseTestOpen(false)}
        currentTransform={selectedTarget.config.transformResponse || ''}
        onApply={(code) => updateCustomTarget('transformResponse', code)}
      />

      {/* Config Agent Drawer */}
      <ConfigAgentDrawer
        open={configAgentOpen}
        onClose={() => setConfigAgentOpen(false)}
        initialUrl={selectedTarget.config.url || ''}
        onConfigDiscovered={handleConfigAgentDiscovered}
      />

      {/* Request Body Expanded Editor Dialog */}
      <Dialog open={requestBodyExpanded} onOpenChange={setRequestBodyExpanded}>
        <DialogContent className="flex h-[80vh] max-w-4xl flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Request Body</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleFormatJson}
                disabled={!requestBody.trim() || !!bodyError}
                title={bodyError ? 'Fix JSON errors first' : 'Format JSON'}
              >
                <AlignLeft className="mr-1 size-4" />
                Format
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div
            className={cn(
              'flex-1 overflow-auto rounded-md border bg-white dark:bg-zinc-900',
              bodyError ? 'border-destructive' : 'border-border',
            )}
          >
            <Editor
              value={
                typeof requestBody === 'object'
                  ? JSON.stringify(requestBody, null, 2)
                  : requestBody || ''
              }
              onValueChange={handleRequestBodyChange}
              highlight={(code) => code}
              padding={10}
              style={{
                fontFamily: '"Fira code", "Fira Mono", monospace',
                fontSize: 14,
                minHeight: '100%',
              }}
            />
          </div>
          {bodyError && <HelperText error>{bodyError}</HelperText>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestBodyExpanded(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HttpEndpointConfiguration;
