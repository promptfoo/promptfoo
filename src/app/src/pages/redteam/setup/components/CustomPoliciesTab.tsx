import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { CustomPoliciesSection } from './Targets/CustomPoliciesSection';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import { countSelectedCustomPolicies } from '../utils/plugins';

export default function CustomPoliciesTab() {
  const { config } = useRedTeamConfig();

  // Calculate the number of custom policies
  const customPoliciesCount = countSelectedCustomPolicies(config);

  return (
    <Box sx={{ maxWidth: '100%' }}>
      <Typography variant="h6" sx={{ fontWeight: 'medium', mb: 2 }}>
        Custom Policies ({customPoliciesCount})
      </Typography>
      <CustomPoliciesSection />
    </Box>
  );
}
