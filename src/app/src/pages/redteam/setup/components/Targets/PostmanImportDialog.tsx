import { useState } from 'react';

import UploadFileIcon from '@mui/icons-material/UploadFile';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

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
  const [postmanRequests, setPostmanRequests] = useState<
    Array<{ name: string; path: string; request: any }>
  >([]);
  const [selectedRequestIndex, setSelectedRequestIndex] = useState<number | null>(null);

  const getMethodColor = (method: string): 'success' | 'info' | 'warning' | 'error' | 'default' => {
    switch (method?.toUpperCase()) {
      case 'GET':
        return 'info';
      case 'POST':
        return 'success';
      case 'PUT':
      case 'PATCH':
        return 'warning';
      case 'DELETE':
        return 'error';
      default:
        return 'default';
    }
  };

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
        const parsed = JSON.parse(text);

        // Find all request objects
        let requests: Array<{ name: string; path: string; request: any }> = [];

        if (parsed.item && Array.isArray(parsed.item) && parsed.item.length > 0) {
          // It's a collection - recursively find all requests
          requests = findAllRequests(parsed.item);
        } else if (parsed.request) {
          // It's a standalone request
          requests = [
            {
              name: parsed.name || 'Request',
              path: parsed.name || 'Request',
              request: parsed.request,
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

  const findAllRequests = (
    items: any[],
    path: string = '',
  ): Array<{ name: string; path: string; request: any }> => {
    const requests: Array<{ name: string; path: string; request: any }> = [];

    for (const item of items) {
      const currentPath = path ? `${path} / ${item.name}` : item.name;

      if (item.request) {
        requests.push({
          name: item.name || 'Unnamed Request',
          path: currentPath,
          request: item.request,
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
      const parsed = JSON.parse(postmanJson);

      // Find all request objects
      let requests: Array<{ name: string; path: string; request: any }> = [];

      if (parsed.item && Array.isArray(parsed.item) && parsed.item.length > 0) {
        // It's a collection - recursively find all requests
        requests = findAllRequests(parsed.item);
      } else if (parsed.request) {
        // It's a standalone request
        requests = [
          {
            name: parsed.name || 'Request',
            path: parsed.name || 'Request',
            request: parsed.request,
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
          for (const item of request.body.formdata) {
            if (item.key && !item.disabled) {
              formObj[item.key] = item.value || '';
            }
          }
          body = JSON.stringify(formObj, null, 2);
        } else if (request.body.mode === 'urlencoded' && request.body.urlencoded) {
          // Convert urlencoded to JSON representation
          const urlEncodedObj: Record<string, string> = {};
          for (const item of request.body.urlencoded) {
            if (item.key && !item.disabled) {
              urlEncodedObj[item.key] = item.value || '';
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

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Import from Postman Collection</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Upload a Postman collection file or paste the JSON below.
        </Typography>
        <Box sx={{ mb: 2 }}>
          <input
            accept=".json"
            style={{ display: 'none' }}
            id="postman-file-upload"
            type="file"
            onChange={handlePostmanFileUpload}
          />
          <label htmlFor="postman-file-upload">
            <Button
              variant="outlined"
              component="span"
              startIcon={<UploadFileIcon />}
              sx={{
                borderColor: 'primary.main',
                color: 'primary.main',
                '&:hover': {
                  borderColor: 'primary.dark',
                  backgroundColor: 'action.hover',
                },
              }}
            >
              Upload JSON File
            </Button>
          </label>
        </Box>
        <TextField
          multiline
          fullWidth
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
          sx={{
            fontFamily: '"Fira code", "Fira Mono", monospace',
            fontSize: 12,
          }}
        />

        {postmanRequests.length > 0 && (
          <>
            <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
              Select a request to import:
            </Typography>
            <FormControl fullWidth>
              <Select
                value={selectedRequestIndex ?? ''}
                onChange={(e) => setSelectedRequestIndex(Number(e.target.value))}
                displayEmpty
              >
                <MenuItem value="" disabled>
                  <em>Choose a request...</em>
                </MenuItem>
                {postmanRequests.map((req, index) => (
                  <MenuItem key={index} value={index}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                      {req.request?.method && (
                        <Chip
                          label={req.request.method}
                          color={getMethodColor(req.request.method)}
                          size="small"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            minWidth: '60px',
                            height: '20px',
                          }}
                        />
                      )}
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {req.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {req.path}
                        </Typography>
                      </Box>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </>
        )}

        {postmanError && (
          <Typography color="error" sx={{ mt: 2 }}>
            {postmanError}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        {postmanRequests.length === 0 ? (
          <Button
            onClick={handlePostmanParse}
            variant="contained"
            color="primary"
            disabled={!postmanJson.trim()}
          >
            Parse Collection
          </Button>
        ) : (
          <Button
            onClick={handlePostmanImport}
            variant="contained"
            color="primary"
            disabled={selectedRequestIndex === null}
          >
            Import Selected Request
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default PostmanImportDialog;
