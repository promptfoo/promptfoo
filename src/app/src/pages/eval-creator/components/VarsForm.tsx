import React, { useEffect } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

interface VarsFormProps {
  onAdd: (vars: Record<string, string>) => void;
  varsList: string[];
  initialValues?: Record<string, string>;
}

const VarsForm: React.FC<VarsFormProps> = ({ onAdd, varsList, initialValues }) => {
  const [vars, setVars] = React.useState<Record<string, string>>(initialValues || {});
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  useEffect(() => {
    const newVars: Record<string, string> = {};
    varsList.forEach((v) => {
      newVars[v] = initialValues?.[v] || '';
    });
    setVars(newVars);
  }, [varsList, initialValues]);

  return (
    <Box my={3}>
      <Typography variant="h6" mb={2} sx={{ fontWeight: 600 }}>
        Test Case Variables
      </Typography>

      {varsList.length > 0 ? (
        <>
          <Alert severity="info" sx={{ mb: 3, borderRadius: 1 }}>
            <Typography variant="body2">
              Fill in values for each variable below. These values will replace the corresponding{' '}
              <code>{`{{variables}}`}</code> in your prompts.
            </Typography>
          </Alert>

          <Grid container spacing={2}>
            {Object.keys(vars).map((varName, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card
                  variant="outlined"
                  sx={{
                    backgroundColor: isDarkMode
                      ? 'rgba(255, 255, 255, 0.02)'
                      : 'rgba(0, 0, 0, 0.01)',
                    borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: 'primary.main',
                      backgroundColor: isDarkMode
                        ? 'rgba(255, 255, 255, 0.04)'
                        : 'rgba(0, 0, 0, 0.02)',
                    },
                  }}
                >
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                      <Chip
                        label={`{{${varName}}}`}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          backgroundColor: isDarkMode
                            ? 'rgba(33, 150, 243, 0.1)'
                            : 'rgba(33, 150, 243, 0.08)',
                        }}
                      />
                    </Box>
                    <TextField
                      placeholder={`Enter value for ${varName}`}
                      value={vars[varName]}
                      fullWidth
                      size="small"
                      multiline
                      minRows={1}
                      maxRows={4}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          backgroundColor: isDarkMode
                            ? 'rgba(255, 255, 255, 0.05)'
                            : 'rgba(255, 255, 255, 0.9)',
                        },
                      }}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        const newVars = {
                          ...vars,
                          [varName]: newValue,
                        };
                        setVars(newVars);
                        onAdd(newVars);
                      }}
                    />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </>
      ) : (
        <Alert severity="warning" sx={{ borderRadius: 1 }}>
          <Typography variant="body2">
            No variables found in your prompts. Add variables using the <code>{`{{varname}}`}</code>{' '}
            syntax in your prompts to create test case variations.
          </Typography>
        </Alert>
      )}
    </Box>
  );
};

export default VarsForm;
