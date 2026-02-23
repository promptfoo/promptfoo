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

interface PostmanImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (config: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  }) => void;
}

function extractPostmanUrl(url: PostmanRequest['request']['url']): string {
  if (!url) {
    return '';
  }
  if (typeof url === 'string') {
    return url;
  }
  if (url.raw) {
    return url.raw;
  }
  const protocol = url.protocol || 'https';
  const host = Array.isArray(url.host) ? url.host.join('.') : url.host || '';
  const path = Array.isArray(url.path) ? url.path.join('/') : '';
  return `${protocol}://${host}/${path}`;
}

function extractPostmanHeaders(
  header: Array<{ key: string; value?: string; disabled?: boolean }> | undefined,
): Record<string, string> {
  const headersObj: Record<string, string> = {};
  if (!header || !Array.isArray(header)) {
    return headersObj;
  }
  for (const h of header) {
    if (h.key && !h.disabled) {
      headersObj[h.key] = h.value || '';
    }
  }
  return headersObj;
}

function extractFormdataBody(formdata: unknown): string {
  const formObj: Record<string, string> = {};
  const formdataArray = Array.isArray(formdata) ? formdata : [];
  for (const item of formdataArray) {
    if (
      typeof item === 'object' &&
      item !== null &&
      'key' in item &&
      !('disabled' in item && item.disabled)
    ) {
      formObj[item.key as string] = (item.value as string) || '';
    }
  }
  return JSON.stringify(formObj, null, 2);
}

function extractUrlencodedBody(urlencoded: unknown): string {
  const urlEncodedObj: Record<string, string> = {};
  const urlencodedArray = Array.isArray(urlencoded) ? urlencoded : [];
  for (const item of urlencodedArray) {
    if (
      typeof item === 'object' &&
      item !== null &&
      'key' in item &&
      !('disabled' in item && item.disabled)
    ) {
      urlEncodedObj[item.key as string] = (item.value as string) || '';
    }
  }
  return JSON.stringify(urlEncodedObj, null, 2);
}

function extractPostmanBody(body: PostmanRequest['request']['body'] | undefined): string {
  if (!body) {
    return '';
  }
  let result = '';
  if (body.mode === 'raw') {
    result = body.raw || '';
  } else if (body.mode === 'formdata') {
    result = extractFormdataBody(body.formdata);
  } else if (body.mode === 'urlencoded') {
    result = extractUrlencodedBody(body.urlencoded);
  }

  if (result) {
    const variableMatches = result.match(/\{\{[^}]+\}\}/g);
    if (variableMatches && variableMatches.length === 1) {
      result = result.replace(variableMatches[0], '{{prompt}}');
    }
  }
  return result;
}

const findAllRequests = (items: PostmanCollectionItem[], path: string = ''): PostmanRequest[] => {
  const requests: PostmanRequest[] = [];

  for (const item of items) {
    const currentPath = path ? `${path} / ${item.name}` : item.name || '';

    if (item.request) {
      requests.push({
        name: item.name || 'Unnamed Request',
        path: currentPath,
        request: item.request as PostmanRequest['request'],
      });
    }

    if (item.item && Array.isArray(item.item)) {
      requests.push(...findAllRequests(item.item, currentPath));
    }
  }

  return requests;
};

function parsePostmanCollection(parsed: PostmanCollection): PostmanRequest[] {
  if (parsed.item && Array.isArray(parsed.item) && parsed.item.length > 0) {
    return findAllRequests(parsed.item);
  }
  if (parsed.request) {
    return [
      {
        name: parsed.name || 'Request',
        path: parsed.name || 'Request',
        request: parsed.request as PostmanRequest['request'],
      },
    ];
  }
  throw new Error('Unable to find requests in JSON. Please paste a Postman collection or request.');
}

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

  const handleParseResult = (parsed: PostmanCollection) => {
    const requests = parsePostmanCollection(parsed);

    if (requests.length === 0) {
      throw new Error('No valid requests found in the collection.');
    }

    setPostmanRequests(requests);

    if (requests.length === 1) {
      setSelectedRequestIndex(0);
    }
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
        const parsed = JSON.parse(text) as PostmanCollection;
        handleParseResult(parsed);
      } catch (error) {
        setPostmanError(
          error instanceof Error ? error.message : 'Failed to parse Postman collection',
        );
      }
    };
    reader.onerror = () => {
      setPostmanError('Failed to read file');
    };
    reader.readAsText(file);

    event.target.value = '';
  };

  const handlePostmanParse = () => {
    setPostmanError('');
    setPostmanRequests([]);
    setSelectedRequestIndex(null);

    try {
      const parsed = JSON.parse(postmanJson) as PostmanCollection;
      handleParseResult(parsed);
    } catch (error) {
      setPostmanError(
        error instanceof Error ? error.message : 'Failed to parse Postman collection',
      );
    }
  };

  const handlePostmanImport = () => {
    setPostmanError('');

    if (selectedRequestIndex === null || !postmanRequests[selectedRequestIndex]) {
      setPostmanError('Please select a request to import');
      return;
    }

    try {
      const request = postmanRequests[selectedRequestIndex].request;
      const url = extractPostmanUrl(request.url);
      const method = request.method || 'POST';
      const headers = extractPostmanHeaders(request.header);
      const body = extractPostmanBody(request.body);

      onImport({ url, method, headers, body });
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
          <Textarea
            rows={postmanRequests.length > 0 ? 5 : 15}
            value={postmanJson}
            onChange={(e) => {
              setPostmanJson(e.target.value);
              setPostmanRequests([]);
              setSelectedRequestIndex(null);
            }}
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
              <Label>Select a request to import:</Label>
              <Select
                value={selectedRequestIndex !== null ? String(selectedRequestIndex) : ''}
                onValueChange={(value) => setSelectedRequestIndex(Number(value))}
              >
                <SelectTrigger>
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

          {postmanError && <HelperText error>{postmanError}</HelperText>}
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
