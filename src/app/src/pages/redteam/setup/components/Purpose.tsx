import React, { useEffect, useState } from 'react';
import { useTelemetry } from '@app/hooks/useTelemetry';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { Alert } from '@mui/material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { EXAMPLE_APPLICATION_DEFINITION, useRedTeamConfig } from '../hooks/useRedTeamConfig';
import type { ApplicationDefinition } from '../types';

interface PromptsProps {
  onNext: () => void;
}

export default function Purpose({ onNext }: PromptsProps) {
  const theme = useTheme();
  const { config, updateApplicationDefinition } = useRedTeamConfig();
  const { recordEvent } = useTelemetry();
  const [testMode, setTestMode] = useState<'application' | 'model'>('application');

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_purpose' });
  }, []);

  const handleTestModeChange = (
    event: React.MouseEvent<HTMLElement>,
    newMode: 'application' | 'model',
  ) => {
    if (newMode !== null) {
      setTestMode(newMode);
      // Clear application definition fields when switching to model testing
      if (newMode === 'model') {
        Object.keys(EXAMPLE_APPLICATION_DEFINITION).forEach((key) => {
          updateApplicationDefinition(key as keyof ApplicationDefinition, '');
        });
      }
      recordEvent('feature_used', { feature: 'redteam_test_mode_change', mode: newMode });
    }
  };

  const isPurposePresent =
    config.applicationDefinition?.purpose && config.applicationDefinition.purpose.trim() !== '';

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ maxWidth: '1200px', width: '100%', px: 3 }}>
        <Stack direction="column" spacing={4}>
          <Box sx={{ mb: 4 }}>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
              Usage Details
            </Typography>
          </Box>

          <ToggleButtonGroup
            value={testMode}
            exclusive
            onChange={handleTestModeChange}
            aria-label="test mode"
            sx={{
              '& .Mui-selected': {
                backgroundColor: `${alpha(theme.palette.primary.main, 0.08)} !important`,
                '&:hover': {
                  backgroundColor: `${alpha(theme.palette.primary.main, 0.12)} !important`,
                },
              },
            }}
          >
            <ToggleButton
              value="application"
              aria-label="test application"
              sx={{
                py: 1.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                flex: 1,
                '&.Mui-selected': {
                  color: 'primary.main',
                  borderColor: 'primary.main',
                },
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 'medium' }}>
                I'm testing an application
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Test a complete AI application with its context
              </Typography>
            </ToggleButton>
            <ToggleButton
              value="model"
              aria-label="test model"
              sx={{
                py: 1.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                flex: 1,
                '&.Mui-selected': {
                  color: 'primary.main',
                  borderColor: 'primary.main',
                },
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 'medium' }}>
                I'm testing a model
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Test a model directly without application context
              </Typography>
            </ToggleButton>
          </ToggleButtonGroup>

          {testMode === 'application' ? (
            <>
              <Box>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 'medium' }}>
                  Application Details
                </Typography>
                <Typography variant="body1" sx={{ mb: 3 }}>
                  <strong>
                    This is the most critical step for generating effective red team attacks.
                  </strong>{' '}
                  The quality and specificity of your responses directly determines how targeted and
                  realistic the generated attacks will be. Detailed information leads to{' '}
                  <strong>significantly</strong> better security testing and{' '}
                  <strong>more accurate</strong> grading of attack effectiveness.
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 4, fontStyle: 'italic' }}
                >
                  Only the main purpose is required. All other fields are optional, but providing
                  more details will result in significantly more targeted and effective security
                  tests.
                </Typography>

                <Stack spacing={4}>
                  {/* Core Application Details */}
                  <Box>
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 'medium', mb: 2, color: 'primary.main' }}
                    >
                      Core Application Details
                    </Typography>
                    <Stack spacing={3}>
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                          What is the main purpose of your application?{' '}
                          <span style={{ color: 'red' }}>*</span>
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Describe the primary objective and goals of your application. This
                          foundational information provides essential context for generating all
                          types of targeted security attacks and red team tests.{' '}
                          <strong>
                            It also helps our grading system evaluate whether attacks are
                            contextually relevant to your specific application.
                          </strong>
                        </Typography>
                        <TextField
                          fullWidth
                          value={config.applicationDefinition?.purpose}
                          onChange={(e) => updateApplicationDefinition('purpose', e.target.value)}
                          placeholder="e.g. Assist healthcare professionals and patients with medical-related tasks, access medical information, schedule appointments..."
                          multiline
                          rows={3}
                          variant="outlined"
                          required
                        />
                      </Box>

                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                          What key features does your application provide?{' '}
                          <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                            (optional)
                          </span>
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          List the main capabilities and functionalities available to users. This
                          helps generate feature-specific attacks including tool discovery, debug
                          access, hijacking attempts, and tests for excessive agency
                          vulnerabilities.
                        </Typography>
                        <TextField
                          fullWidth
                          value={config.applicationDefinition?.features}
                          onChange={(e) => updateApplicationDefinition('features', e.target.value)}
                          placeholder="e.g. Patient record access, appointment scheduling, prescription management, lab results retrieval..."
                          multiline
                          rows={3}
                          variant="outlined"
                        />
                      </Box>

                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                          What industry or domain does your application operate in?{' '}
                          <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                            (optional)
                          </span>
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          This helps generate industry-specific attacks and compliance tests,
                          including specialized advice vulnerabilities, unsupervised contract
                          issues, and intellectual property violations.
                        </Typography>
                        <TextField
                          fullWidth
                          value={config.applicationDefinition?.industry}
                          onChange={(e) => updateApplicationDefinition('industry', e.target.value)}
                          placeholder="e.g. Healthcare, Financial Services, Education, E-commerce, Government, Legal..."
                          variant="outlined"
                        />
                      </Box>
                    </Stack>
                  </Box>

                  {/* Access & Permissions */}
                  <Box>
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 'medium', mb: 2, color: 'primary.main' }}
                    >
                      Access & Permissions
                    </Typography>
                    <Stack spacing={3}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                            What systems, data, or resources does your application have access to?{' '}
                            <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                              (optional)
                            </span>
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Describe what your application can legitimately access and use. This
                          information helps test for RBAC enforcement issues, unauthorized data
                          access, privilege escalation, malicious resource fetching, and RAG
                          poisoning vulnerabilities.
                        </Typography>
                        <TextField
                          fullWidth
                          value={config.applicationDefinition?.hasAccessTo}
                          onChange={(e) =>
                            updateApplicationDefinition('hasAccessTo', e.target.value)
                          }
                          placeholder="e.g. Patient's own medical records, appointment scheduling system, prescription database..."
                          multiline
                          rows={3}
                          variant="outlined"
                        />
                      </Box>

                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                            What systems, data, or resources should your application NOT have access
                            to?{' '}
                            <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                              (optional)
                            </span>
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Specify what your application should be restricted from accessing. This
                          helps generate tests for RBAC enforcement failures, unauthorized data
                          access attempts, privilege escalation, cross-session leaks, and RAG
                          document exfiltration vulnerabilities.
                        </Typography>
                        <TextField
                          fullWidth
                          value={config.applicationDefinition?.doesNotHaveAccessTo}
                          onChange={(e) =>
                            updateApplicationDefinition('doesNotHaveAccessTo', e.target.value)
                          }
                          placeholder="e.g. Other patients' medical records, hospital/clinic financial systems, provider credentialing information, research databases, unencrypted patient identifiers, administrative backend systems, and unauthorized medication dispensing functions."
                          multiline
                          rows={3}
                          variant="outlined"
                        />
                      </Box>

                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                            What types of users interact with your application?{' '}
                            <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                              (optional)
                            </span>
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Describe the different user roles and their authorization levels. This
                          enables testing for RBAC enforcement issues, privilege escalation
                          attempts, unauthorized data access, and social engineering attacks
                          targeting PII exposure.
                        </Typography>
                        <TextField
                          fullWidth
                          value={config.applicationDefinition?.userTypes}
                          onChange={(e) => updateApplicationDefinition('userTypes', e.target.value)}
                          placeholder="e.g. Authorized Patients, Healthcare Providers, Administrators, Unauthenticated Users..."
                          multiline
                          rows={2}
                          variant="outlined"
                        />
                      </Box>

                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                            What security and compliance requirements apply to your application?{' '}
                            <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                              (optional)
                            </span>
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          List important security, privacy, and regulatory requirements. This helps
                          generate tests for privacy violations, direct PII exposure, RBAC
                          enforcement gaps, specialized advice compliance, and unsupervised contract
                          vulnerabilities.
                        </Typography>
                        <TextField
                          fullWidth
                          value={config.applicationDefinition?.securityRequirements}
                          onChange={(e) =>
                            updateApplicationDefinition('securityRequirements', e.target.value)
                          }
                          placeholder="e.g. HIPAA compliance, patient confidentiality, authentication checks, audit logging..."
                          multiline
                          rows={2}
                          variant="outlined"
                        />
                      </Box>
                    </Stack>
                  </Box>

                  {/* Data & Content */}
                  <Box>
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 'medium', mb: 2, color: 'primary.main' }}
                    >
                      Data & Content
                    </Typography>
                    <Stack spacing={3}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                            What types of sensitive data does your application handle?{' '}
                            <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                              (optional)
                            </span>
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Understanding data sensitivity helps generate targeted privacy and data
                          protection attacks, including tests for direct PII exposure, PII leakage
                          in APIs/databases/sessions, social engineering attacks, and privacy
                          violations.{' '}
                          <strong>
                            This information also helps grade whether attacks successfully identify
                            and extract the types of sensitive data your system actually handles.
                          </strong>
                        </Typography>
                        <TextField
                          fullWidth
                          value={config.applicationDefinition?.sensitiveDataTypes}
                          onChange={(e) =>
                            updateApplicationDefinition('sensitiveDataTypes', e.target.value)
                          }
                          placeholder="e.g. Personal health information, financial records, social security numbers, payment data, biometric data..."
                          multiline
                          rows={2}
                          variant="outlined"
                        />
                      </Box>

                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                            What are some example identifiers, names, or data points your
                            application uses?{' '}
                            <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                              (optional)
                            </span>
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Provide realistic examples of the types of data and identifiers in your
                          system. This enables testing for direct PII exposure, PII leakage in
                          APIs/databases/sessions, divergent repetition attacks, and cross-session
                          data leaks.{' '}
                          <strong>
                            Specific data formats and ID patterns are especially important for
                            accurately grading whether attacks successfully extract real-looking
                            data from your system.
                          </strong>
                        </Typography>
                        <TextField
                          fullWidth
                          value={config.applicationDefinition?.exampleIdentifiers}
                          onChange={(e) =>
                            updateApplicationDefinition('exampleIdentifiers', e.target.value)
                          }
                          placeholder="e.g. Patient IDs (MRN2023001), Emails (marcus.washington@gmail.com), Prescription IDs (RX123456)..."
                          multiline
                          rows={2}
                          variant="outlined"
                        />
                      </Box>

                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                            What are the most critical or dangerous actions your application can
                            perform?{' '}
                            <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                              (optional)
                            </span>
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Identify high-risk operations that should be heavily protected from
                          misuse. This helps generate tests for privilege escalation, shell
                          injection, SQL injection, malicious code execution, debug access
                          vulnerabilities, and system prompt override attacks.
                        </Typography>
                        <TextField
                          fullWidth
                          value={config.applicationDefinition?.criticalActions}
                          onChange={(e) =>
                            updateApplicationDefinition('criticalActions', e.target.value)
                          }
                          placeholder="e.g. Prescribing medication, financial transactions, data deletion, system configuration changes..."
                          multiline
                          rows={2}
                          variant="outlined"
                        />
                      </Box>

                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                            What content or topics should your application never discuss or promote?{' '}
                            <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                              (optional)
                            </span>
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Define content boundaries to test for harmful or inappropriate responses.
                          This enables testing for hate speech, self-harm content, sexual content,
                          harassment and bullying, illegal activities, violent crime promotion, and
                          profanity vulnerabilities.
                        </Typography>
                        <TextField
                          fullWidth
                          value={config.applicationDefinition?.forbiddenTopics}
                          onChange={(e) =>
                            updateApplicationDefinition('forbiddenTopics', e.target.value)
                          }
                          placeholder="e.g. Self-harm, illegal drugs, violence, competitor products, political opinions, medical diagnosis..."
                          multiline
                          rows={2}
                          variant="outlined"
                        />
                      </Box>
                    </Stack>
                  </Box>

                  {/* Business Context */}
                  <Box>
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 'medium', mb: 2, color: 'primary.main' }}
                    >
                      Business Context
                    </Typography>
                    <Stack spacing={3}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                            Who are your main competitors that shouldn't be endorsed or promoted?{' '}
                            <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                              (optional)
                            </span>
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          List companies or products that your application should remain neutral
                          about. This helps test for competitor endorsement vulnerabilities, brand
                          bias issues, and inappropriate imitation behaviors.
                        </Typography>
                        <TextField
                          fullWidth
                          value={config.applicationDefinition?.competitors}
                          onChange={(e) =>
                            updateApplicationDefinition('competitors', e.target.value)
                          }
                          placeholder="e.g. Epic Systems, Cerner, Allscripts, athenahealth..."
                          multiline
                          rows={2}
                          variant="outlined"
                        />
                      </Box>

                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                            Who is the red team user?{' '}
                            <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                              (optional)
                            </span>
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Define the persona attempting to attack your system. This helps create
                          realistic attack scenarios for social engineering attacks targeting PII,
                          hijacking attempts, prompt extraction, system prompt override, and
                          role-based security vulnerabilities.
                        </Typography>
                        <TextField
                          fullWidth
                          value={config.applicationDefinition?.redteamUser}
                          onChange={(e) =>
                            updateApplicationDefinition('redteamUser', e.target.value)
                          }
                          placeholder="e.g. A patient seeking medical assistance, a customer service representative, an external researcher..."
                          multiline
                          rows={2}
                          variant="outlined"
                        />
                      </Box>
                    </Stack>
                  </Box>
                </Stack>
              </Box>

              {/* User Context */}
              <Box>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 'medium', mb: 2, color: 'primary.main' }}
                >
                  User Context
                </Typography>
                <Stack spacing={3}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                      Describe the user the red teamer is impersonating{' '}
                      <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>(optional)</span>
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Define what type of user the red teamer should simulate during attacks.
                    </Typography>
                    <TextField
                      fullWidth
                      value={config.applicationDefinition?.redteamUser}
                      onChange={(e) => updateApplicationDefinition('redteamUser', e.target.value)}
                      placeholder="e.g. A traveler looking for budget flights to Europe. An employee of the company. A patient seeking medical assistance."
                      variant="outlined"
                    />
                  </Box>
                </Stack>
              </Box>
            </>
          ) : (
            <Box>
              <Alert
                severity="info"
                sx={{
                  '& .MuiAlert-icon': {
                    color: 'info.main',
                  },
                  backgroundColor: (theme) =>
                    theme.palette.mode === 'dark'
                      ? alpha(theme.palette.info.main, 0.1)
                      : alpha(theme.palette.info.main, 0.05),
                  border: (theme) =>
                    `1px solid ${
                      theme.palette.mode === 'dark'
                        ? alpha(theme.palette.info.main, 0.3)
                        : alpha(theme.palette.info.main, 0.2)
                    }`,
                  '& .MuiAlert-message': {
                    color: 'text.primary',
                  },
                }}
              >
                When testing a model directly, you don't need to provide application details. You
                can proceed to configure the model and test scenarios in the next steps.
              </Alert>
            </Box>
          )}

          <Grid item xs={12}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                mt: 4,
              }}
            >
              <Button
                variant="contained"
                endIcon={<KeyboardArrowRightIcon />}
                onClick={onNext}
                disabled={testMode === 'application' && !isPurposePresent}
                sx={{
                  backgroundColor: theme.palette.primary.main,
                  '&:hover': { backgroundColor: theme.palette.primary.dark },
                  '&:disabled': { backgroundColor: theme.palette.action.disabledBackground },
                  px: 4,
                  py: 1,
                }}
              >
                Next
              </Button>
            </Box>
          </Grid>
        </Stack>
      </Box>
    </Box>
  );
}
