import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CustomIntentSection from './CustomIntentPluginSection';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';

export default function CustomPromptsTab() {
  const { config } = useRedTeamConfig();

  // Calculate the number of custom prompts
  const customPromptsCount =
    config.plugins.filter(
      (p): p is { id: string; config: any } =>
        typeof p === 'object' && 'id' in p && p.id === 'intent' && 'config' in p,
    )[0]?.config?.intent?.length || 0;

  return (
    <Box sx={{ maxWidth: '100%' }}>
      <Typography variant="h6" sx={{ fontWeight: 'medium', mb: 2 }}>
        Custom Prompts ({customPromptsCount})
      </Typography>
      <CustomIntentSection />
    </Box>
  );
}
