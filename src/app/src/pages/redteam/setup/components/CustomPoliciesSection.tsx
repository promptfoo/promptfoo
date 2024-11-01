import { useState, useEffect } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';

interface PolicyInstance {
  id: string;
  name: string;
  policy: string;
  isExpanded: boolean;
}

export const CustomPoliciesSection = () => {
  const { config, updateConfig } = useRedTeamConfig();
  const [policies, setPolicies] = useState<PolicyInstance[]>([]);

  const handleAddPolicy = () => {
    const newPolicy: PolicyInstance = {
      id: `policy-${Date.now()}`,
      name: `Custom Policy ${policies.length + 1}`,
      policy: '',
      isExpanded: true,
    };
    setPolicies([...policies, newPolicy]);
  };

  // Update the main config whenever policies change
  useEffect(() => {
    const policyPlugins = policies.map((policy) => ({
      id: 'policy',
      config: {
        policy: policy.policy,
      },
    }));

    // Update the plugins array, preserving other plugins
    const otherPlugins = config.plugins.filter((p) =>
      typeof p === 'string' ? p !== 'policy' : p.id !== 'policy',
    );
    updateConfig('plugins', [...otherPlugins, ...policyPlugins]);
  }, [policies, updateConfig]);

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Custom Policies</Typography>
          <Button
            startIcon={<AddIcon />}
            onClick={handleAddPolicy}
            variant="contained"
            color="primary"
          >
            Add Policy
          </Button>
        </Box>

        <Stack spacing={2}>
          {policies.map((policy) => (
            <Paper
              key={policy.id}
              elevation={2}
              sx={{
                p: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <TextField
                  label="Policy Name"
                  value={policy.name}
                  onChange={(e) => {
                    setPolicies((prev) =>
                      prev.map((p) => (p.id === policy.id ? { ...p, name: e.target.value } : p)),
                    );
                  }}
                  size="small"
                  fullWidth
                />
                <IconButton
                  onClick={() => {
                    setPolicies((prev) =>
                      prev.map((p) =>
                        p.id === policy.id ? { ...p, isExpanded: !p.isExpanded } : p,
                      ),
                    );
                  }}
                >
                  {policy.isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
                <IconButton
                  onClick={() => setPolicies((prev) => prev.filter((p) => p.id !== policy.id))}
                  color="error"
                >
                  <DeleteIcon />
                </IconButton>
              </Box>

              <Collapse in={policy.isExpanded}>
                <TextField
                  label="Policy Text"
                  value={policy.policy}
                  onChange={(e) => {
                    setPolicies((prev) =>
                      prev.map((p) => (p.id === policy.id ? { ...p, policy: e.target.value } : p)),
                    );
                  }}
                  multiline
                  rows={3}
                  fullWidth
                  placeholder="Enter the policy text..."
                />
              </Collapse>
            </Paper>
          ))}
        </Stack>

        {policies.length === 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            No custom policies added yet. Click the button above to create one.
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default CustomPoliciesSection;
