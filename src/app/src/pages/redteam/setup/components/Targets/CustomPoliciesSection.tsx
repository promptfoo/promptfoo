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
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';

interface PolicyInstance {
  id: string;
  name: string;
  policy: string;
  isExpanded: boolean;
}

const PolicyInput = memo(
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
        label="Policy Text"
        value={value}
        onChange={handleChange}
        multiline
        rows={4}
        fullWidth
        placeholder="Enter your policy guidelines here..."
      />
    );
  },
);

PolicyInput.displayName = 'PolicyInput';

export const CustomPoliciesSection = () => {
  const { config, updateConfig } = useRedTeamConfig();
  const [policies, setPolicies] = useState<PolicyInstance[]>(() => {
    // Initialize from existing config or create a default empty policy
    const existingPolicies = config.plugins
      .filter((p) => typeof p === 'object' && p.id === 'policy')
      .map((p, index) => ({
        id: `policy-${Date.now()}-${index}`,
        name: `Custom Policy ${index + 1}`,
        policy: (p as { config: { policy: string } }).config.policy,
        isExpanded: true,
      }));

    return existingPolicies.length
      ? existingPolicies
      : [
          {
            id: `policy-${Date.now()}`,
            name: 'Custom Policy 1',
            policy: '',
            isExpanded: true,
          },
        ];
  });

  const [debouncedPolicies] = useDebounce(policies, 500);

  useEffect(() => {
    if (
      debouncedPolicies.length === 0 &&
      !config.plugins.some((p) => typeof p === 'object' && p.id === 'policy')
    ) {
      return;
    }

    const policyPlugins = debouncedPolicies
      .filter((policy) => policy.policy.trim() !== '')
      .map((policy) => ({
        id: 'policy',
        config: {
          policy: policy.policy,
        },
      }));

    const otherPlugins = config.plugins.filter((p) =>
      typeof p === 'string' ? true : p.id !== 'policy',
    );

    const currentPolicies = JSON.stringify(
      config.plugins.filter((p) => typeof p === 'object' && p.id === 'policy'),
    );
    const newPolicies = JSON.stringify(policyPlugins);

    if (currentPolicies !== newPolicies) {
      updateConfig('plugins', [...otherPlugins, ...policyPlugins]);
    }
  }, [debouncedPolicies]);

  const handlePolicyChange = useCallback((policyId: string, newValue: string) => {
    setPolicies((prev) => prev.map((p) => (p.id === policyId ? { ...p, policy: newValue } : p)));
  }, []);

  const handleAddPolicy = () => {
    const newPolicy: PolicyInstance = {
      id: `policy-${Date.now()}`,
      name: `Custom Policy ${policies.length + 1}`,
      policy: '',
      isExpanded: true,
    };
    setPolicies([...policies, newPolicy]);
  };

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
            <Box
              key={policy.id}
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                p: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                <Box sx={{ mt: 2 }}>
                  <PolicyInput id={policy.id} value={policy.policy} onChange={handlePolicyChange} />
                </Box>
              </Collapse>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
};

export default memo(CustomPoliciesSection);
