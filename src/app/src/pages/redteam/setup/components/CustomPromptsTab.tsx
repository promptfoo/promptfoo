import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CustomIntentSection from './CustomIntentPluginSection';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import { countSelectedCustomPrompts } from '../utils/plugins';

export default function CustomPromptsTab() {
  const { config } = useRedTeamConfig();

  // Calculate the number of custom prompts
  const customPromptsCount = countSelectedCustomPrompts(config);

  return (
    <Box sx={{ maxWidth: '100%' }}>
      <Typography variant="h6" sx={{ fontWeight: 'medium', mb: 2 }}>
        Custom Prompts ({customPromptsCount})
      </Typography>
      <CustomIntentSection />
    </Box>
  );
}
