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

      // Automatically parse the collection after upload
      try {
        const parsed = JSON.parse(text) as {
          item?: PostmanCollectionItem[];
          request?: unknown;
          name?: string;
        };

        // Find all request objects
        let requests: PostmanRequest[] = [];

        if (parsed.item && Array.isArray(parsed.item) && parsed.item.length > 0) {
          // It's a collection - recursively find all requests
          requests = findAllRequests(parsed.item);
        } else if (parsed.request) {
          // It's a standalone request
          requests = [
            {
              name: parsed.name || 'Request',
              path: parsed.name || 'Request',
              request: parsed.request as PostmanRequest['request'],
            },
          ];
        } else {
          throw new Error(
            'Unable to find requests in JSON. Please paste a Postman collection or request.',
          );
        }

        if (requests.length === 0) {
          throw new Error('No valid requests found in the collection.');
        }

        setPostmanRequests(requests);

        // If only one request, auto-select it
        if (requests.length === 1) {
          setSelectedRequestIndex(0);
        }
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

    // Reset the input so the same file can be selected again
    event.target.value = '';
  };

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

      // Recursively search nested items (folders)
      if (item.item && Array.isArray(item.item)) {
        requests.push(...findAllRequests(item.item, currentPath));
      }
    }

    return requests;
  };

  const handlePostmanParse = () => {
    setPostmanError('');
    setPostmanRequests([]);
    setSelectedRequestIndex(null);

    try {
      const parsed = JSON.parse(postmanJson) as PostmanCollection;

      // Find all request objects
      let requests: PostmanRequest[] = [];

      if (parsed.item && Array.isArray(parsed.item) && parsed.item.length > 0) {
        // It's a collection - recursively find all requests
        requests = findAllRequests(parsed.item);
      } else if (parsed.request) {
        // It's a standalone request
        requests = [
          {
            name: parsed.name || 'Request',
            path: parsed.name || 'Request',
            request: parsed.request as PostmanRequest['request'],
          },
        ];
      } else {
        throw new Error(
          'Unable to find requests in JSON. Please paste a Postman collection or request.',
        );
      }

      if (requests.length === 0) {
        throw new Error('No valid requests found in the collection.');
      }

      setPostmanRequests(requests);

      // If only one request, auto-select it
      if (requests.length === 1) {
        setSelectedRequestIndex(0);
      }
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

      // Extract URL
      let url = '';
      if (typeof request.url === 'string') {
        url = request.url;
      } else if (request.url && request.url.raw) {
        url = request.url.raw;
      } else if (request.url) {
        // Reconstruct URL from parts
        const protocol = request.url.protocol || 'https';
        const host = Array.isArray(request.url.host)
          ? request.url.host.join('.')
          : request.url.host || '';
        const path = Array.isArray(request.url.path) ? request.url.path.join('/') : '';
        url = `${protocol}://${host}/${path}`;
      }

      // Extract method
      const method = request.method || 'POST';

      // Extract headers
      const headersObj: Record<string, string> = {};
      if (request.header && Array.isArray(request.header)) {
        for (const h of request.header) {
          if (h.key && !h.disabled) {
            headersObj[h.key] = h.value || '';
          }
        }
      }

      // Extract body
      let body = '';
      if (request.body) {
        if (request.body.mode === 'raw') {
          body = request.body.raw || '';
        } else if (request.body.mode === 'formdata' && request.body.formdata) {
          // Convert formdata to JSON representation
          const formObj: Record<string, string> = {};
          const formdataArray = Array.isArray(request.body.formdata) ? request.body.formdata : [];
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
          body = JSON.stringify(formObj, null, 2);
        } else if (request.body.mode === 'urlencoded' && request.body.urlencoded) {
          // Convert urlencoded to JSON representation
          const urlEncodedObj: Record<string, string> = {};
          const urlencodedArray = Array.isArray(request.body.urlencoded)
            ? request.body.urlencoded
            : [];
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
          body = JSON.stringify(urlEncodedObj, null, 2);
        }

        // Replace single {{variable}} with {{prompt}}
        if (body) {
          const variableMatches = body.match(/\{\{[^}]+\}\}/g);
          if (variableMatches && variableMatches.length === 1) {
            body = body.replace(variableMatches[0], '{{prompt}}');
          }
        }
      }

      // Call the import callback
      onImport({
        url,
        method,
        headers: headersObj,
        body,
      });

      // Close dialog and reset state
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
