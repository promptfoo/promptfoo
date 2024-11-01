import { useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

interface PolicyConfig {
  rules: string[];
  description?: string;
  severity?: 'low' | 'medium' | 'high';
}

interface CustomPolicyInstance {
  id: string;
  name: string;
  config: PolicyConfig;
  isExpanded: boolean;
  isValid: boolean;
}

export const CustomPoliciesSection = () => {
  const [policies, setPolicies] = useState<CustomPolicyInstance[]>([]);

  const validatePolicy = (policy: CustomPolicyInstance): boolean => {
    return (
      policy.name.trim().length > 0 &&
      policy.config.rules.length > 0 &&
      policy.config.rules.every((rule) => rule.trim().length > 0)
    );
  };

  const handleAddPolicy = () => {
    const newPolicy: CustomPolicyInstance = {
      id: `policy-${Date.now()}`,
      name: `Custom Policy ${policies.length + 1}`,
      config: {
        rules: [''],
        severity: 'medium',
        description: '',
      },
      isExpanded: true,
      isValid: false,
    };
    setPolicies([...policies, newPolicy]);
  };

  const updatePolicy = (id: string, updates: Partial<CustomPolicyInstance>) => {
    setPolicies((prev) =>
      prev.map((policy) => {
        if (policy.id === id) {
          const updatedPolicy = { ...policy, ...updates };
          updatedPolicy.isValid = validatePolicy(updatedPolicy);
          return updatedPolicy;
        }
        return policy;
      }),
    );
  };

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Custom Policy Instances</Typography>
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
                borderColor: (theme) =>
                  policy.isValid ? theme.palette.success.light : theme.palette.divider,
                borderRadius: 2,
                transition: 'all 0.2s ease',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <TextField
                  label="Policy Name"
                  value={policy.name}
                  onChange={(e) => updatePolicy(policy.id, { name: e.target.value })}
                  size="small"
                  fullWidth
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        {policy.isValid ? (
                          <CheckCircleIcon color="success" />
                        ) : (
                          <ErrorIcon color="error" />
                        )}
                      </InputAdornment>
                    ),
                  }}
                />
                <IconButton
                  onClick={() => updatePolicy(policy.id, { isExpanded: !policy.isExpanded })}
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
                <Stack spacing={2}>
                  <TextField
                    label="Description"
                    value={policy.config.description}
                    onChange={(e) =>
                      updatePolicy(policy.id, {
                        config: { ...policy.config, description: e.target.value },
                      })
                    }
                    multiline
                    rows={2}
                    fullWidth
                  />

                  <FormControl fullWidth>
                    <InputLabel>Severity</InputLabel>
                    <Select
                      value={policy.config.severity}
                      onChange={(e) =>
                        updatePolicy(policy.id, {
                          config: {
                            ...policy.config,
                            severity: e.target.value as 'low' | 'medium' | 'high',
                          },
                        })
                      }
                      size="small"
                    >
                      <MenuItem value="low">Low</MenuItem>
                      <MenuItem value="medium">Medium</MenuItem>
                      <MenuItem value="high">High</MenuItem>
                    </Select>
                  </FormControl>

                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Rules
                      <Chip
                        label={`${policy.config.rules.length} rules`}
                        size="small"
                        sx={{ ml: 1 }}
                      />
                    </Typography>
                    <Stack spacing={1}>
                      {policy.config.rules.map((rule, index) => (
                        <Box key={index} sx={{ display: 'flex', gap: 1 }}>
                          <TextField
                            value={rule}
                            onChange={(e) => {
                              const newRules = [...policy.config.rules];
                              newRules[index] = e.target.value;
                              updatePolicy(policy.id, {
                                config: { ...policy.config, rules: newRules },
                              });
                            }}
                            fullWidth
                            size="small"
                            placeholder="Enter rule..."
                          />
                          <IconButton
                            size="small"
                            onClick={() => {
                              const newRules = policy.config.rules.filter((_, i) => i !== index);
                              updatePolicy(policy.id, {
                                config: { ...policy.config, rules: newRules },
                              });
                            }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      ))}
                      <Button
                        startIcon={<AddIcon />}
                        onClick={() => {
                          const newRules = [...policy.config.rules, ''];
                          updatePolicy(policy.id, {
                            config: { ...policy.config, rules: newRules },
                          });
                        }}
                        size="small"
                      >
                        Add Rule
                      </Button>
                    </Stack>
                  </Box>

                  {!policy.isValid && (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      Please provide a name and at least one rule
                    </Alert>
                  )}
                </Stack>
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
