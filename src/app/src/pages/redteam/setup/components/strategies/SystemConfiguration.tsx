import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';

interface SystemConfigurationProps {
  isStatefulValue: boolean;
  onStatefulChange: (val: boolean) => void;
}

export function SystemConfiguration({
  isStatefulValue,
  onStatefulChange,
}: SystemConfigurationProps) {
  return (
    <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        System Configuration
      </Typography>
      <FormControl component="fieldset">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Is the target system Stateful? (Does it maintain conversation history?)
        </Typography>
        <RadioGroup
          value={String(isStatefulValue)}
          onChange={(e) => onStatefulChange(e.target.value === 'true')}
        >
          <FormControlLabel
            value="true"
            control={<Radio />}
            label="Yes - System is stateful, system maintains conversation history."
          />
          <FormControlLabel
            value="false"
            control={<Radio />}
            label="No - System does not maintain conversation history"
          />
        </RadioGroup>
      </FormControl>
    </Paper>
  );
}
