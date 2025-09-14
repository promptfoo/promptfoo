import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';
import { PRESET_IDS, STRATEGY_PRESETS } from './types';

interface RecommendedOptionsProps {
  isMultiTurnEnabled: boolean;
  isStatefulValue: boolean;
  onMultiTurnChange: (checked: boolean) => void;
  onStatefulChange: (isStateful: boolean) => void;
}

export function RecommendedOptions({
  isMultiTurnEnabled,
  isStatefulValue,
  onMultiTurnChange,
  onStatefulChange,
}: RecommendedOptionsProps) {
  const mediumPreset = STRATEGY_PRESETS[PRESET_IDS.MEDIUM];
  if (!mediumPreset?.options?.multiTurn) {
    return null;
  }

  return (
    <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Recommended Options
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={isMultiTurnEnabled}
              onChange={(e) => onMultiTurnChange(e.target.checked)}
            />
          }
          label={mediumPreset.options.multiTurn.label}
        />

        {isMultiTurnEnabled && (
          <Box sx={{ pl: 4 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Does your system maintain conversation state?
            </Typography>
            <RadioGroup
              value={String(isStatefulValue)}
              onChange={(e) => onStatefulChange(e.target.value === 'true')}
              row
            >
              <FormControlLabel
                value="true"
                control={<Radio size="small" />}
                label="Yes - my system is stateful and maintains conversation history"
              />
              <FormControlLabel
                value="false"
                control={<Radio size="small" />}
                label="No - my system is not stateful, the full conversation history must be sent on every request"
              />
            </RadioGroup>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
