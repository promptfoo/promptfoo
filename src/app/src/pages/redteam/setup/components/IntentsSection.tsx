import { useState, useEffect, useCallback, memo } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useDebounce } from 'use-debounce';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';

interface IntentInstance {
  id: string;
  name: string;
  intent: string;
  isExpanded: boolean;
}

const IntentInput = memo(
  ({
    id,
    value,
    onChange,
  }: {
    id: string;
    value: string;
    onChange: (id: string, value: string) => void;
  }) => {
    const [debouncedChange] = useDebounce(onChange, 300);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        debouncedChange(id, e.target.value);
      },
      [id, debouncedChange],
    );

    return (
      <TextField
        label="Intent Description"
        value={value}
        onChange={handleChange}
        multiline
        rows={4}
        fullWidth
        placeholder="Enter the behavior you want to test for (e.g., 'express hatred towards a specific group')..."
      />
    );
  },
);

IntentInput.displayName = 'IntentInput';

export const IntentsSection = () => {
  const { config, updateConfig } = useRedTeamConfig();
  const [intents, setIntents] = useState<IntentInstance[]>(() => {
    // Initialize from existing config or create a default empty intent
    const existingIntents = config.plugins
      .filter((p) => typeof p === 'object' && p.id === 'intent')
      .map((p, index) => {
        const intentConfig = (p as { config: { intent: string | string[] } }).config;
        const intentList = Array.isArray(intentConfig.intent)
          ? intentConfig.intent
          : [intentConfig.intent];

        return intentList.map((intent, subIndex) => ({
          id: `intent-${Date.now()}-${index}-${subIndex}`,
          name: `Intent ${index + subIndex + 1}`,
          intent,
          isExpanded: true,
        }));
      })
      .flat();

    return existingIntents.length
      ? existingIntents
      : [
          {
            id: `intent-${Date.now()}`,
            name: 'Intent 1',
            intent: '',
            isExpanded: true,
          },
        ];
  });

  const [debouncedIntents] = useDebounce(intents, 500);

  useEffect(() => {
    if (
      debouncedIntents.length === 0 &&
      !config.plugins.some((p) => typeof p === 'object' && p.id === 'intent')
    ) {
      return;
    }

    const validIntents = debouncedIntents
      .filter((intent) => intent.intent.trim() !== '')
      .map((intent) => intent.intent);

    if (validIntents.length > 0) {
      const intentPlugin = {
        id: 'intent',
        config: {
          intent: validIntents.length === 1 ? validIntents[0] : validIntents,
        },
      };

      const otherPlugins = config.plugins.filter((p) =>
        typeof p === 'string' ? true : p.id !== 'intent',
      );

      updateConfig('plugins', [...otherPlugins, intentPlugin]);
    }
  }, [debouncedIntents]);

  const handleIntentChange = useCallback((intentId: string, newValue: string) => {
    setIntents((prev) => prev.map((p) => (p.id === intentId ? { ...p, intent: newValue } : p)));
  }, []);

  const handleAddIntent = () => {
    const newIntent: IntentInstance = {
      id: `intent-${Date.now()}`,
      name: `Intent ${intents.length + 1}`,
      intent: '',
      isExpanded: true,
    };
    setIntents([...intents, newIntent]);
  };

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Test Intents</Typography>
          <Button
            startIcon={<AddIcon />}
            onClick={handleAddIntent}
            variant="contained"
            color="primary"
          >
            Add Intent
          </Button>
        </Box>

        <Stack spacing={2}>
          {intents.map((intent) => (
            <Box
              key={intent.id}
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                p: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                  label="Intent Name"
                  value={intent.name}
                  onChange={(e) => {
                    setIntents((prev) =>
                      prev.map((p) => (p.id === intent.id ? { ...p, name: e.target.value } : p)),
                    );
                  }}
                  size="small"
                  fullWidth
                />
                <IconButton
                  onClick={() => {
                    setIntents((prev) =>
                      prev.map((p) =>
                        p.id === intent.id ? { ...p, isExpanded: !p.isExpanded } : p,
                      ),
                    );
                  }}
                >
                  {intent.isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
                <IconButton
                  onClick={() => setIntents((prev) => prev.filter((p) => p.id !== intent.id))}
                  color="error"
                >
                  <DeleteIcon />
                </IconButton>
              </Box>

              <Collapse in={intent.isExpanded}>
                <Box sx={{ mt: 2 }}>
                  <IntentInput id={intent.id} value={intent.intent} onChange={handleIntentChange} />
                </Box>
              </Collapse>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
};

export default memo(IntentsSection);
