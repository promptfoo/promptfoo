import React from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import TextareaAutosize from '@mui/material/TextareaAutosize';
import Typography from '@mui/material/Typography';
import type { ProviderOptions } from '../../types';

interface HttpEndpointConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  updateHeaderKey: (index: number, newKey: string) => void;
  updateHeaderValue: (index: number, newValue: string) => void;
  addHeader: () => void;
  removeHeader: (index: number) => void;
  requestBody: string;
  setRequestBody: (value: string) => void;
  bodyError: string | null;
  urlError: string | null;
  isJsonContentType: boolean;
}

const HttpEndpointConfiguration: React.FC<HttpEndpointConfigurationProps> = ({
  selectedTarget,
  updateCustomTarget,
  updateHeaderKey,
  updateHeaderValue,
  addHeader,
  removeHeader,
  requestBody,
  setRequestBody,
  bodyError,
  urlError,
  isJsonContentType,
}) => {
  return (
    <Box mt={2}>
      <Typography variant="h6" gutterBottom>
        HTTP Endpoint Configuration
      </Typography>
      <Box mt={2} p={2} border={1} borderColor="grey.300" borderRadius={1}>
        <TextField
          fullWidth
          label="URL"
          value={selectedTarget.config.url}
          onChange={(e) => updateCustomTarget('url', e.target.value)}
          margin="normal"
          error={!!urlError}
          helperText={urlError}
          placeholder="https://example.com/api/chat"
          required
        />
        <FormControl fullWidth margin="normal">
          <InputLabel id="method-label">Method</InputLabel>
          <Select
            labelId="method-label"
            value={selectedTarget.config.method}
            onChange={(e) => updateCustomTarget('method', e.target.value)}
            label="Method"
          >
            {['GET', 'POST'].map((method) => (
              <MenuItem key={method} value={method}>
                {method}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
          Headers
        </Typography>
        {selectedTarget.config.headers &&
          Object.entries(selectedTarget.config.headers).map(([key, value], index) => (
            <Box key={index} display="flex" alignItems="center" mb={1}>
              <TextField
                label="Name"
                value={key}
                onChange={(e) => updateHeaderKey(index, e.target.value)}
                sx={{ mr: 1, flex: 1 }}
              />
              <TextField
                label="Value"
                value={value as string}
                onChange={(e) => updateHeaderValue(index, e.target.value)}
                sx={{ mr: 1, flex: 1 }}
              />
              <IconButton onClick={() => removeHeader(index)}>
                <DeleteIcon />
              </IconButton>
            </Box>
          ))}

        <Button startIcon={<AddIcon />} onClick={addHeader} variant="outlined" sx={{ mt: 1 }}>
          Add Header
        </Button>

        <TextField
          fullWidth
          label="Request body"
          value={requestBody}
          error={!!bodyError}
          helperText={bodyError}
          onChange={(e) => {
            setRequestBody(e.target.value);
            updateCustomTarget('body', e.target.value);
          }}
          margin="normal"
          multiline
          minRows={1}
          maxRows={10}
          InputProps={{
            inputComponent: TextareaAutosize,
          }}
        />
      </Box>
    </Box>
  );
};

export default HttpEndpointConfiguration;
