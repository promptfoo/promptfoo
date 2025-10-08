import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { CustomPoliciesSection } from './Targets/CustomPoliciesSection';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';

export default function CustomPoliciesTab() {
  const { config } = useRedTeamConfig();

  // Calculate the number of custom policies
  const customPoliciesCount =
    config.plugins.filter((p) => typeof p === 'object' && 'id' in p && p.id === 'policy').length ||
    0;

  return (
    <Box sx={{ maxWidth: '100%' }}>
      <Typography variant="h6" sx={{ fontWeight: 'medium', mb: 2 }}>
        Custom Policies ({customPoliciesCount})
      </Typography>
      <CustomPoliciesSection />
    </Box>
  );
}
