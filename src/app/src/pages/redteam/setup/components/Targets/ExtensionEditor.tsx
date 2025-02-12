import React from 'react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpIcon from '@mui/icons-material/Help';
import {
  Box,
  TextField,
  IconButton,
  Tooltip,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import Link from '@mui/material/Link';

interface ValidationError {
  message: string;
}

interface ExtensionEditorProps {
  extensions: string[];
  onExtensionsChange: (extensions: string[]) => void;
  onValidationChange?: (hasErrors: boolean) => void;
}

const FILE_PROTOCOL_PREFIX = 'file://';

const validatePath = (value: string): ValidationError | undefined => {
  if (!value.trim()) {
    return undefined;
  }

  const withoutPrefix = value.replace(FILE_PROTOCOL_PREFIX, '');
  const [filePath, functionName] = withoutPrefix.split(':');

  if (!filePath || !functionName) {
    return { message: 'Format: /path/to/file.js:hookFunction' };
  }
  if (!filePath.endsWith('.js') && !filePath.endsWith('.py')) {
    return { message: 'Must be a .js or .py file' };
  }

  return undefined;
};

export default function ExtensionEditor({
  extensions,
  onExtensionsChange,
  onValidationChange,
}: ExtensionEditorProps) {
  const [value, setValue] = React.useState('');

  React.useEffect(() => {
    if (extensions.length > 0) {
      setValue(extensions[0].replace(FILE_PROTOCOL_PREFIX, ''));
    } else {
      setValue('');
    }
  }, [extensions]);

  const error = React.useMemo(() => validatePath(value), [value]);

  React.useEffect(() => {
    onValidationChange?.(!!error);
  }, [error, onValidationChange]);

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setValue(newValue);

      if (!newValue.trim()) {
        onExtensionsChange([]);
        return;
      }

      const validationResult = validatePath(newValue);
      if (validationResult === undefined) {
        onExtensionsChange([`${FILE_PROTOCOL_PREFIX}${newValue}`]);
      } else {
        // Invalid input: Parent state is not updated, error will be shown via onValidationChange
      }
    },
    [onExtensionsChange],
  );

  return (
    <Accordion defaultExpanded={!!extensions.length}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6">Extension Hook</Typography>
            <Tooltip
              title={
                <Box>
                  <Typography variant="body2" paragraph>
                    Run custom code at these lifecycle points:
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: '1.2em' }}>
                    <li>beforeAll - Start of test suite</li>
                    <li>afterAll - End of test suite</li>
                    <li>beforeEach - Before each test</li>
                    <li>afterEach - After each test</li>
                  </Box>
                </Box>
              }
            >
              <IconButton size="small">
                <HelpIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {extensions.length > 0
              ? value
              : 'Add custom code to run at specific points in the evaluation lifecycle'}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body1" sx={{ mb: 2 }}>
          Add custom code to run at specific lifecycle points. See the{' '}
          <Link
            href="https://www.promptfoo.dev/docs/configuration/reference/#extension-hooks"
            target="_blank"
            rel="noopener"
          >
            extension hooks documentation
          </Link>{' '}
          for more details.
        </Typography>
        <Box>
          <TextField
            fullWidth
            size="small"
            placeholder="/path/to/hook.js:extensionHook"
            value={value}
            onChange={handleChange}
            error={!!error}
            helperText={error?.message}
            InputProps={{
              startAdornment: (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mr: 1, userSelect: 'none' }}
                >
                  file://
                </Typography>
              ),
            }}
          />
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
