import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface ProviderResponseData {
  raw?: unknown;
  output?: unknown;
  sessionId?: string;
  error?: string;
  metadata?: {
    headers?: Record<string, unknown>;
    requestBody?: unknown;
    requestMethod?: string;
  };
}

export default function ProviderResponse({ providerResponse }: { providerResponse: unknown }) {
  const response = providerResponse as ProviderResponseData;
  const hasHeaders = Object.keys(response?.metadata?.headers || {}).length > 0;
  return (
    <div>
      {response && response.raw !== undefined ? (
        <>
          {hasHeaders ? (
            <>
              <h4 className="mb-2 text-sm font-semibold">Headers:</h4>
              <div className="mb-4 max-h-[200px] overflow-auto rounded-md bg-muted p-4">
                <div className="w-full overflow-hidden">
                  <table className="w-full table-fixed text-sm">
                    <thead>
                      <tr>
                        <th className="w-[30%] rounded-l bg-muted-foreground/20 px-3 py-2 text-left font-bold">
                          Header
                        </th>
                        <th className="w-[70%] bg-muted-foreground/20 px-3 py-2 text-left font-bold">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(response?.metadata?.headers || {}).map(([key, value]) => (
                        <tr key={key} className="border-b border-border/50 last:border-0">
                          <td className="break-words px-3 py-2">{key}</td>
                          <td className="max-w-0 overflow-hidden break-all px-3 py-2">
                            {typeof value === 'string' ? value : String(value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}

          {/* Display Request Body if available in metadata */}
          {response?.metadata?.requestBody && (
            <>
              <h4 className="mb-2 text-sm font-semibold">Request Body Sent:</h4>
              <div className="mb-4 max-h-[200px] overflow-auto rounded-md bg-muted p-4">
                <pre className="m-0 whitespace-pre-wrap break-words">
                  {typeof response.metadata.requestBody === 'string'
                    ? response.metadata.requestBody
                    : JSON.stringify(response.metadata.requestBody, null, 2)}
                </pre>
              </div>
            </>
          )}

          {/* Display Request Method if available in metadata */}
          {response?.metadata?.requestMethod && (
            <>
              <h4 className="mb-2 text-sm font-semibold">Request Method:</h4>
              <div className="mb-4 rounded-md bg-muted p-4">
                <pre className="m-0">{response.metadata.requestMethod}</pre>
              </div>
            </>
          )}

          <h4 className="mb-2 text-sm font-semibold">Raw Result:</h4>
          <div className="max-h-[200px] overflow-auto rounded-md bg-muted p-4">
            <pre className="m-0 whitespace-pre-wrap break-words">
              {typeof response?.raw === 'string'
                ? response?.raw
                : JSON.stringify(response?.raw, null, 2)}
            </pre>
          </div>

          <h4 className="mb-2 mt-4 text-sm font-semibold">Parsed Result:</h4>
          <div className="max-h-[200px] overflow-auto rounded-md bg-muted p-4">
            <pre className="m-0 whitespace-pre-wrap break-words">
              {typeof response?.output === 'string'
                ? response?.output
                : JSON.stringify(response?.output, null, 2) || 'No parsed response'}
            </pre>
          </div>

          <h4 className="mb-2 mt-4 text-sm font-semibold">Session ID:</h4>
          <div className="max-h-[200px] overflow-auto rounded-md bg-muted p-4">
            <pre className="m-0 whitespace-pre-wrap break-words">{response?.sessionId}</pre>
          </div>
        </>
      ) : (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertContent>
            <AlertDescription>{response?.error || 'No response from provider'}</AlertDescription>
          </AlertContent>
        </Alert>
      )}
    </div>
  );
}
