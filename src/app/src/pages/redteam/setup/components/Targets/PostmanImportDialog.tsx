import { useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { HelperText } from '@app/components/ui/helper-text';
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Textarea } from '@app/components/ui/textarea';
import { Upload } from 'lucide-react';

interface PostmanCollectionItem {
  name?: string;
  request?: unknown;
  item?: PostmanCollectionItem[];
}

interface PostmanCollection {
  item?: PostmanCollectionItem[];
  request?: unknown;
  name?: string;
}

interface PostmanRequest {
  name: string;
  path: string;
  request: {
    method?: string;
    url?:
      | string
      | {
          raw?: string;
          protocol?: string;
          host?: string | string[];
          path?: string | string[];
        };
    header?: Array<{ key: string; value?: string; disabled?: boolean }>;
    body?: {
      mode?: string;
      raw?: string;
      formdata?: unknown;
      [key: string]: unknown;
    };
  };
}

interface ImportedPostmanConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

interface PostmanImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (config: ImportedPostmanConfig) => void;
}

const postmanJsonId = 'postman-collection-json';
const postmanJsonDescriptionId = 'postman-collection-description';
const postmanRequestId = 'postman-request-selection';
const postmanErrorId = 'postman-import-error';

const getPostmanErrorMessage = (error: unknown): string => {
  if (error instanceof SyntaxError) {
    return 'This is not valid Postman collection JSON. Fix the JSON or upload a valid collection file.';
  }

  return error instanceof Error ? error.message : 'Failed to parse Postman collection';
};

const findAllRequests = (items: PostmanCollectionItem[], path: string = ''): PostmanRequest[] => {
  return items.flatMap((item) => {
    const currentPath = path ? `${path} / ${item.name}` : item.name || '';
    const requests: PostmanRequest[] = item.request
      ? [
          {
            name: item.name || 'Unnamed Request',
            path: currentPath,
            request: item.request as PostmanRequest['request'],
          },
        ]
      : [];

    return Array.isArray(item.item)
      ? [...requests, ...findAllRequests(item.item, currentPath)]
      : requests;
  });
};

const parsePostmanRequests = (text: string): PostmanRequest[] => {
  const parsed = JSON.parse(text) as PostmanCollection;
  const requests =
    Array.isArray(parsed.item) && parsed.item.length > 0
      ? findAllRequests(parsed.item)
      : parsed.request
        ? [
            {
              name: parsed.name || 'Request',
              path: parsed.name || 'Request',
              request: parsed.request as PostmanRequest['request'],
            },
          ]
        : [];

  if (requests.length === 0) {
    throw new Error('No valid requests found. Paste a Postman collection or standalone request.');
  }

  return requests;
};

const getRequestUrl = (request: PostmanRequest['request']): string => {
  if (typeof request.url === 'string') {
    return request.url;
  }
  if (!request.url) {
    return '';
  }
  if (request.url.raw) {
    return request.url.raw;
  }

  const protocol = request.url.protocol || 'https';
  const host = Array.isArray(request.url.host)
    ? request.url.host.join('.')
    : request.url.host || '';
  const path = Array.isArray(request.url.path) ? request.url.path.join('/') : '';
  return `${protocol}://${host}/${path}`;
};

const getRequestHeaders = (request: PostmanRequest['request']): Record<string, string> => {
  return Object.fromEntries(
    (Array.isArray(request.header) ? request.header : [])
      .filter((header) => header.key && !header.disabled)
      .map((header) => [header.key, header.value || '']),
  );
};

const formatFormValues = (items: unknown): string => {
  if (!Array.isArray(items)) {
    return '';
  }

  const entries = items.flatMap((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('key' in item) ||
      ('disabled' in item && item.disabled)
    ) {
      return [];
    }

    return [[String(item.key), 'value' in item ? String(item.value || '') : '']];
  });
  return JSON.stringify(Object.fromEntries(entries), null, 2);
};

const getRequestBody = (request: PostmanRequest['request']): string => {
  const body = request.body;
  if (!body) {
    return '';
  }

  let result = '';
  if (body.mode === 'raw') {
    result = body.raw || '';
  } else if (body.mode === 'formdata') {
    result = formatFormValues(body.formdata);
  } else if (body.mode === 'urlencoded') {
    result = formatFormValues(body.urlencoded);
  }

  const variableMatches = result.match(/\{\{[^}]+\}\}/g);
  return variableMatches?.length === 1 ? result.replace(variableMatches[0], '{{prompt}}') : result;
};

const getImportedConfig = (request: PostmanRequest['request']): ImportedPostmanConfig => ({
  url: getRequestUrl(request),
  method: request.method || 'POST',
  headers: getRequestHeaders(request),
  body: getRequestBody(request),
});

const PostmanImportDialog = ({ open, onClose, onImport }: PostmanImportDialogProps) => {
  const [postmanJson, setPostmanJson] = useState('');
  const [postmanError, setPostmanError] = useState('');
  const [postmanRequests, setPostmanRequests] = useState<PostmanRequest[]>([]);
  const [selectedRequestIndex, setSelectedRequestIndex] = useState<number | null>(null);

  const handleClose = () => {
    setPostmanJson('');
    setPostmanError('');
    setPostmanRequests([]);
    setSelectedRequestIndex(null);
    onClose();
  };

  const displayParsedRequests = (requests: PostmanRequest[]) => {
    setPostmanRequests(requests);
    setSelectedRequestIndex(requests.length === 1 ? 0 : null);
  };

  const handlePostmanFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setPostmanJson(text);
      setPostmanError('');

      try {
        displayParsedRequests(parsePostmanRequests(text));
      } catch (error) {
        setPostmanError(getPostmanErrorMessage(error));
      }
    };
    reader.onerror = () => {
      setPostmanError('The file could not be read. Choose another JSON file or paste the JSON.');
    };
    reader.readAsText(file);

    // Reset the input so the same file can be selected again
    event.target.value = '';
  };

  const handlePostmanParse = () => {
    setPostmanError('');
    setPostmanRequests([]);
    setSelectedRequestIndex(null);

    try {
      displayParsedRequests(parsePostmanRequests(postmanJson));
    } catch (error) {
      setPostmanError(getPostmanErrorMessage(error));
    }
  };

  const handlePostmanImport = () => {
    setPostmanError('');

    const selectedRequest =
      selectedRequestIndex === null ? undefined : postmanRequests[selectedRequestIndex];
    if (!selectedRequest) {
      setPostmanError('Please select a request to import');
      return;
    }

    try {
      onImport(getImportedConfig(selectedRequest.request));
      handleClose();
    } catch (error) {
      setPostmanError(error instanceof Error ? error.message : 'Failed to import request');
    }
  };

  const getMethodBadgeVariant = (
    method: string,
  ): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (method?.toUpperCase()) {
      case 'GET':
        return 'secondary';
      case 'POST':
        return 'default';
      case 'DELETE':
        return 'destructive';
      default:
        return 'outline';
    }
  };
  const jsonHasError = Boolean(postmanError && postmanRequests.length === 0);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from Postman Collection</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload a Postman collection file or paste the JSON below.
          </p>
          <p id={postmanJsonDescriptionId} className="text-sm text-muted-foreground">
            Importing a request fills this provider's URL, method, headers, and request body. You
            can review and edit them before saving the provider.
          </p>
          <div>
            <input
              accept=".json"
              className="hidden"
              id="postman-file-upload"
              type="file"
              onChange={handlePostmanFileUpload}
            />
            <label htmlFor="postman-file-upload">
              <Button variant="outline" asChild className="cursor-pointer">
                <span>
                  <Upload className="mr-2 size-4" />
                  Upload JSON File
                </span>
              </Button>
            </label>
          </div>
          <Label htmlFor={postmanJsonId}>Postman collection JSON</Label>
          <Textarea
            id={postmanJsonId}
            rows={postmanRequests.length > 0 ? 5 : 15}
            value={postmanJson}
            onChange={(e) => {
              setPostmanJson(e.target.value);
              setPostmanError('');
              setPostmanRequests([]);
              setSelectedRequestIndex(null);
            }}
            aria-invalid={jsonHasError}
            aria-describedby={
              jsonHasError
                ? `${postmanJsonDescriptionId} ${postmanErrorId}`
                : postmanJsonDescriptionId
            }
            placeholder={`Paste Postman collection JSON here, for example:
{
  "info": {
    "name": "My API",
    "_postman_id": "..."
  },
  "item": [
    {
      "name": "Chat Request",
      "request": {
        "method": "POST",
        "header": [],
        "body": {
          "mode": "raw",
          "raw": "{\\"messages\\": [...]}"
        },
        "url": {
          "raw": "https://api.example.com/v1/chat",
          "protocol": "https",
          "host": ["api", "example", "com"],
          "path": ["v1", "chat"]
        }
      }
    }
  ]
}`}
            className="font-mono text-xs"
          />

          {postmanRequests.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor={postmanRequestId}>Request to import</Label>
              <Select
                value={selectedRequestIndex === null ? '' : String(selectedRequestIndex)}
                onValueChange={(value) => setSelectedRequestIndex(Number(value))}
              >
                <SelectTrigger
                  id={postmanRequestId}
                  aria-invalid={Boolean(postmanError)}
                  aria-describedby={postmanError ? postmanErrorId : undefined}
                >
                  <SelectValue placeholder="Choose a request..." />
                </SelectTrigger>
                <SelectContent>
                  {postmanRequests.map((req, index) => (
                    <SelectItem key={index} value={String(index)}>
                      <div className="flex items-center gap-2">
                        {req.request?.method && (
                          <Badge
                            variant={getMethodBadgeVariant(req.request.method)}
                            className="min-w-[50px] justify-center text-xs"
                          >
                            {req.request.method}
                          </Badge>
                        )}
                        <div className="flex flex-col">
                          <span className="font-medium">{req.name}</span>
                          <span className="text-xs text-muted-foreground">{req.path}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {postmanError && (
            <HelperText id={postmanErrorId} role="alert" error>
              {postmanError}
            </HelperText>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {postmanRequests.length === 0 ? (
            <Button onClick={handlePostmanParse} disabled={!postmanJson.trim()}>
              Parse Collection
            </Button>
          ) : (
            <Button onClick={handlePostmanImport} disabled={selectedRequestIndex === null}>
              Import Selected Request
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PostmanImportDialog;
