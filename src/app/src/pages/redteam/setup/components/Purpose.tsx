import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Code from '@app/components/Code';
import { useApiHealth } from '@app/hooks/useApiHealth';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { callApi } from '@app/utils/api';
import { formatToolsAsJSDocs } from '@app/utils/discovery';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { Alert } from '@mui/material';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { type TargetPurposeDiscoveryResult } from '@promptfoo/redteam/commands/discover';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from '../hooks/useRedTeamConfig';
import type { ApplicationDefinition } from '../types';

interface PromptsProps {
  onNext: () => void;
}

/**
 * Component to display auto-discovery results with copy functionality
 */
function DiscoveryResult({
  text,
  section,
}: {
  text: string;
  section: keyof ApplicationDefinition;
}) {
  const { recordEvent } = useTelemetry();
  const theme = useTheme();
  const { updateApplicationDefinition, config } = useRedTeamConfig();
  const sectionValue = config.applicationDefinition?.[section];

  /**
   * Appends the text to the section.
   */
  const handleApply = useCallback(() => {
    updateApplicationDefinition(section, sectionValue ? `${sectionValue}\n\n${text}` : text);
    recordEvent('feature_used', { feature: 'redteam_discovery_apply_discovery_result' });
  }, [section, text, updateApplicationDefinition, recordEvent, sectionValue]);

  /**
   * Is the text already applied to the section?
   */
  const applied = useMemo(() => {
    return (sectionValue ?? '').includes(text);
  }, [sectionValue, text]);

  return (
    <Box
      sx={{
        mb: 2,
        p: 2,
        borderRadius: 1,
        backgroundColor:
          theme.palette.mode === 'dark'
            ? alpha(theme.palette.primary.main, 0.1)
            : alpha(theme.palette.primary.main, 0.05),
        border: `1px solid ${
          theme.palette.mode === 'dark'
            ? alpha(theme.palette.primary.main, 0.3)
            : alpha(theme.palette.primary.main, 0.2)
        }`,
        position: 'relative',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Box sx={{ flex: 1 }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 'medium',
              mb: 1,
              color: theme.palette.primary.main,
            }}
          >
            🔍 Auto-Discovery Result
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color:
                theme.palette.mode === 'dark'
                  ? theme.palette.text.primary
                  : theme.palette.text.secondary,
              lineHeight: 1.5,

              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: '12px',
              fontFamily: 'monospace',
            }}
          >
            {text}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="contained"
          onClick={handleApply}
          startIcon={<AutoAwesomeIcon fontSize="small" />}
          disabled={applied}
        >
          Apply
        </Button>
      </Box>
    </Box>
  );
}

/**
 * "Usage Details" step of the red teaming config setup wizard.
 */
export default function Purpose({ onNext }: PromptsProps) {
  const theme = useTheme();
  const { config, updateApplicationDefinition, updateConfig } = useRedTeamConfig();
  const { recordEvent } = useTelemetry();
  const { status: apiHealthStatus, checkHealth } = useApiHealth();
  const [testMode, setTestMode] = useState<'application' | 'model'>('application');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['Core Application Details']), // Expand the first section by default since it has required fields
  );

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_purpose' });
  }, []);

  const handleTestModeChange = (
    event: React.MouseEvent<HTMLElement>,
    newMode: 'application' | 'model',
  ) => {
    if (newMode !== null) {
      setTestMode(newMode);
      recordEvent('feature_used', { feature: 'redteam_test_mode_change', mode: newMode });
    }
  };

  const handleSectionToggle = (section: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const isPurposePresent =
    config.applicationDefinition?.purpose && config.applicationDefinition.purpose.trim() !== '';

  const getCompletionPercentage = (section: string) => {
    const fields = {
      'Core Application Details': ['features', 'industry', 'attackConstraints'],
      'Access & Permissions': [
        'hasAccessTo',
        'doesNotHaveAccessTo',
        'userTypes',
        'securityRequirements',
      ],
      'Data & Content': [
        'sensitiveDataTypes',
        'exampleIdentifiers',
        'criticalActions',
        'forbiddenTopics',
      ],
      'Business Context': ['competitors'],
    };

    const sectionFields = fields[section as keyof typeof fields] || [];
    const filledFields = sectionFields.filter((field) => {
      const value = config.applicationDefinition?.[field as keyof ApplicationDefinition];
      return value && value.trim() !== '';
    });

    if (sectionFields.length === 0) {
      return '0%';
    }
    const percentage = Math.round((filledFields.length / sectionFields.length) * 100);
    return `${percentage}%`;
  };

  // =============================================================================
  // TARGET PURPOSE DISCOVERY ====================================================
  // =============================================================================

  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoveryResult, setDiscoveryResult] = useState<TargetPurposeDiscoveryResult | null>(null);
  const [showSlowDiscoveryMessage, setShowSlowDiscoveryMessage] = useState(false);

  const handleTargetPurposeDiscovery = React.useCallback(async () => {
    recordEvent('feature_used', { feature: 'redteam_config_target_test' });
    try {
      setIsDiscovering(true);
      setShowSlowDiscoveryMessage(false);

      // Show slow discovery message after a few seconds
      const slowDiscoveryTimeout = setTimeout(() => {
        setShowSlowDiscoveryMessage(true);
      }, 5000);

      const response = await callApi('/providers/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config.target),
      });

      if (!response.ok) {
        const { error } = (await response.json()) as { error: string };
        setDiscoveryError(error);
        return;
      }

      const data = (await response.json()) as TargetPurposeDiscoveryResult;
      setDiscoveryResult(data);

      // Clear the timeout since discovery completed
      clearTimeout(slowDiscoveryTimeout);
    } catch (error) {
      console.error('Error during target purpose discovery:', error);
      setDiscoveryError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDiscovering(false);
      setShowSlowDiscoveryMessage(false);
    }
  }, [config.target]);

  const hasTargetConfigured = JSON.stringify(config.target) !== JSON.stringify(DEFAULT_HTTP_TARGET);

  const toolsAsJSDocs = React.useMemo(
    () => formatToolsAsJSDocs(discoveryResult?.tools),
    [discoveryResult],
  );

  // Auto-expand accordions when discovery results are available
  useEffect(() => {
    if (discoveryResult) {
      setExpandedSections((prev) => {
        const newSet = new Set(prev);

        // Expand "Core Application Details" if limitations are discovered
        if (discoveryResult.limitations) {
          newSet.add('Core Application Details');
        }

        // Expand "Access & Permissions" if tools are discovered
        if (discoveryResult.tools && discoveryResult.tools.length > 0) {
          newSet.add('Access & Permissions');
        }

        return newSet;
      });
    }
  }, [discoveryResult]);

  /**
   * Validate that the API is healthy when the target is configured.
   */
  useEffect(() => {
    if (hasTargetConfigured) {
      checkHealth();
    }
  }, [hasTargetConfigured, checkHealth]);

  // =============================================================================
  // RENDERING ===================================================================
  // =============================================================================

  return (
    <Box sx={{ maxWidth: '1200px', width: '100%', px: 3 }}>
      <Stack direction="column" spacing={4}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
          Usage Details
        </Typography>

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
          <Stack direction="column" spacing={4}>
            {/* Auto-Discover Target Details */}
            {!discoveryResult && (
              <Stack direction="column" spacing={2}>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 'medium' }}>
                  Auto-Discovery
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Get started using 1-click discovery of your target's usage details.{' '}
                  <a
                    href="https://promptfoo.dev/docs/red-team/discovery"
                    target="_blank"
                    style={{ color: 'inherit', textDecoration: 'underline' }}
                  >
                    Learn more
                  </a>
                </Typography>
                <Button
                  variant="contained"
                  disabled={
                    !hasTargetConfigured ||
                    apiHealthStatus !== 'connected' ||
                    !!discoveryError ||
                    !!discoveryResult
                  }
                  onClick={handleTargetPurposeDiscovery}
                  loading={isDiscovering}
                  sx={{ width: '150px' }}
                >
                  {isDiscovering ? 'Discovering...' : 'Discover'}
                </Button>
                {isDiscovering && showSlowDiscoveryMessage && (
                  <Alert severity="info" sx={{ border: 0 }}>
                    Discovery is taking a little while. This is normal for complex applications.
                  </Alert>
                )}
                {!hasTargetConfigured && (
                  <Alert severity="warning" sx={{ border: 0 }}>
                    You must configure a target to run auto-discovery.
                  </Alert>
                )}
                {hasTargetConfigured && ['blocked', 'disabled'].includes(apiHealthStatus) && (
                  <Alert severity="error" sx={{ border: 0 }}>
                    Cannot connect to Promptfoo API. Auto-discovery requires a healthy API
                    connection.
                  </Alert>
                )}
                {discoveryError && (
                  <>
                    <Alert severity="error" sx={{ border: 0 }}>
                      {discoveryError}
                    </Alert>
                    <Box
                      sx={{
                        p: 2,
                        borderRadius: 1.5,
                        backgroundColor:
                          theme.palette.mode === 'dark'
                            ? alpha(theme.palette.grey[800], 0.5)
                            : alpha(theme.palette.grey[100], 0.5),
                        border: `1px solid ${
                          theme.palette.mode === 'dark'
                            ? alpha(theme.palette.grey[700], 0.3)
                            : alpha(theme.palette.grey[300], 0.3)
                        }`,
                      }}
                    >
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontStyle: 'italic', mb: 2 }}
                      >
                        💡 To re-attempt discovery from your terminal:
                      </Typography>
                      <Stack spacing={1}>
                        <Typography variant="body2" color="text.secondary">
                          <strong>1.</strong> Save Config and export it as YAML
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          <strong>2.</strong> Run the following command:
                        </Typography>
                        <Code>promptfoo redteam discover -c redteam-config.yaml</Code>
                      </Stack>
                    </Box>
                  </>
                )}
              </Stack>
            )}

            {/* Main Purpose - Standalone Section */}
            <Stack direction="column" spacing={3}>
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

              <Box sx={{}}>
                <Typography variant="h6" sx={{ fontWeight: 'medium', mb: 2 }}>
                  What is the main purpose of your application?{' '}
                  <span style={{ color: 'red' }}>*</span>
                </Typography>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Describe the primary objective and goals of your application. This foundational
                    information provides essential context for generating all types of targeted
                    security attacks and red team tests.
                  </Typography>

                  {discoveryResult && discoveryResult.purpose && (
                    <DiscoveryResult text={discoveryResult.purpose} section="purpose" />
                  )}

                  <TextField
                    fullWidth
                    value={config.applicationDefinition?.purpose}
                    onChange={(e) => updateApplicationDefinition('purpose', e.target.value)}
                    placeholder="e.g. Assist healthcare professionals and patients with medical-related tasks, access medical information, schedule appointments..."
                    multiline
                    minRows={3}
                    variant="outlined"
                    required
                    sx={{
                      '& .MuiInputBase-inputMultiline': {
                        resize: 'vertical',
                        minHeight: '72px',
                      },
                    }}
                  />
                </Box>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                Only the main purpose is required. All other fields are optional, but providing more
                details will result in significantly more targeted and effective security tests.
              </Typography>
            </Stack>

            <Stack direction="column" spacing={0}>
              {/* Core Application Details */}
              <Accordion
                expanded={expandedSections.has('Core Application Details')}
                onChange={() => handleSectionToggle('Core Application Details')}
                sx={{
                  mb: 0,
                  '&:first-of-type': {
                    borderTopLeftRadius: '8px',
                    borderTopRightRadius: '8px',
                  },
                  '&:not(:last-of-type)': {
                    borderBottom: 'none',
                  },
                  '&:before': {
                    display: 'none',
                  },
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 'medium', flex: 1, color: 'text.primary' }}
                    >
                      Core Application Details (
                      {getCompletionPercentage('Core Application Details')})
                    </Typography>
                    {getCompletionPercentage('Core Application Details') === '100%' && (
                      <CheckCircleIcon sx={{ color: 'success.main', mr: 1 }} />
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 4, py: 3 }}>
                  <Stack spacing={3}>
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
                        access, hijacking attempts, and tests for excessive agency vulnerabilities.
                      </Typography>

                      <TextField
                        fullWidth
                        value={config.applicationDefinition?.features}
                        onChange={(e) => updateApplicationDefinition('features', e.target.value)}
                        placeholder="e.g. Patient record access, appointment scheduling, prescription management, lab results retrieval..."
                        multiline
                        minRows={2}
                        variant="outlined"
                        sx={{
                          '& .MuiInputBase-inputMultiline': {
                            resize: 'vertical',
                            minHeight: '56px',
                          },
                        }}
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
                        including specialized advice vulnerabilities, unsupervised contract issues,
                        and intellectual property violations.
                      </Typography>
                      <TextField
                        fullWidth
                        value={config.applicationDefinition?.industry}
                        onChange={(e) => updateApplicationDefinition('industry', e.target.value)}
                        placeholder="e.g. Healthcare, Financial Services, Education, E-commerce, Government, Legal..."
                        multiline
                        minRows={1}
                        variant="outlined"
                        sx={{
                          '& .MuiInputBase-inputMultiline': {
                            resize: 'vertical',
                            minHeight: '40px',
                          },
                        }}
                      />
                    </Box>

                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                        Is there anything specific the attacker should know about this system or its
                        rules?{' '}
                        <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                          (optional)
                        </span>
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Describe any constraints, guardrails, special behavior, or requirements that
                        attackers should consider when generating attack prompts. This can include
                        information about what the system will or won't respond to, topics it
                        restricts, input formats, or any other domain-specific rules.
                      </Typography>

                      {discoveryResult && discoveryResult.limitations && (
                        <DiscoveryResult
                          text={discoveryResult.limitations}
                          section="attackConstraints"
                        />
                      )}

                      <TextField
                        fullWidth
                        value={config.applicationDefinition?.attackConstraints || ''}
                        onChange={(e) =>
                          updateApplicationDefinition('attackConstraints', e.target.value)
                        }
                        placeholder="e.g. The agent only responds to voicemail-related queries, so every attack should mention voicemail services. OR: All interactions must be in the context of medical appointments, so attacks should reference scheduling or patient care."
                        multiline
                        minRows={2}
                        variant="outlined"
                        sx={{
                          '& .MuiInputBase-inputMultiline': {
                            resize: 'vertical',
                            minHeight: '56px',
                          },
                        }}
                      />
                    </Box>
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {/* Access & Permissions */}
              <Accordion
                expanded={expandedSections.has('Access & Permissions')}
                onChange={() => handleSectionToggle('Access & Permissions')}
                sx={{
                  mb: 0,
                  '&:not(:last-of-type)': {
                    borderBottom: 'none',
                  },
                  '&:before': {
                    display: 'none',
                  },
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 'medium', flex: 1, color: 'text.primary' }}
                    >
                      Access & Permissions ({getCompletionPercentage('Access & Permissions')})
                    </Typography>
                    {getCompletionPercentage('Access & Permissions') === '100%' && (
                      <CheckCircleIcon sx={{ color: 'success.main', mr: 1 }} />
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 4, py: 3 }}>
                  <Stack spacing={3}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                        What systems, data, or resources does your application have access to?{' '}
                        <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                          (optional)
                        </span>
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Describe what your application can legitimately access and use. This
                        information helps test for RBAC enforcement issues, unauthorized data
                        access, privilege escalation, malicious resource fetching, and RAG poisoning
                        vulnerabilities.
                      </Typography>

                      {discoveryResult && toolsAsJSDocs && (
                        <DiscoveryResult text={toolsAsJSDocs} section="hasAccessTo" />
                      )}

                      <TextField
                        fullWidth
                        value={config.applicationDefinition?.hasAccessTo}
                        onChange={(e) => updateApplicationDefinition('hasAccessTo', e.target.value)}
                        placeholder="e.g. Patient's own medical records, appointment scheduling system, prescription database..."
                        multiline
                        minRows={2}
                        variant="outlined"
                        sx={{
                          '& .MuiInputBase-inputMultiline': {
                            resize: 'vertical',
                            minHeight: '56px',
                          },
                        }}
                      />
                    </Box>

                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                        What systems, data, or resources should your application NOT have access to?{' '}
                        <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                          (optional)
                        </span>
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Specify what your application should be restricted from accessing. This
                        helps generate tests for RBAC enforcement failures, unauthorized data access
                        attempts, privilege escalation, cross-session leaks, and RAG document
                        exfiltration vulnerabilities.
                      </Typography>
                      <TextField
                        fullWidth
                        value={config.applicationDefinition?.doesNotHaveAccessTo}
                        onChange={(e) =>
                          updateApplicationDefinition('doesNotHaveAccessTo', e.target.value)
                        }
                        placeholder="e.g. Other patients' medical records, hospital/clinic financial systems, provider credentialing information, research databases, unencrypted patient identifiers, administrative backend systems, and unauthorized medication dispensing functions."
                        multiline
                        minRows={2}
                        variant="outlined"
                        sx={{
                          '& .MuiInputBase-inputMultiline': {
                            resize: 'vertical',
                            minHeight: '56px',
                          },
                        }}
                      />
                    </Box>

                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                        What types of users interact with your application?{' '}
                        <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                          (optional)
                        </span>
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Describe the different user roles and their authorization levels. This
                        enables testing for RBAC enforcement issues, privilege escalation attempts,
                        unauthorized data access, and social engineering attacks targeting PII
                        exposure.
                      </Typography>
                      <TextField
                        fullWidth
                        value={config.applicationDefinition?.userTypes}
                        onChange={(e) => updateApplicationDefinition('userTypes', e.target.value)}
                        placeholder="e.g. Authorized Patients, Healthcare Providers, Administrators, Unauthenticated Users..."
                        multiline
                        minRows={2}
                        variant="outlined"
                        sx={{
                          '& .MuiInputBase-inputMultiline': {
                            resize: 'vertical',
                            minHeight: '56px',
                          },
                        }}
                      />
                    </Box>

                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                        What security and compliance requirements apply to your application?{' '}
                        <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                          (optional)
                        </span>
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        List important security, privacy, and regulatory requirements. This helps
                        generate tests for privacy violations, direct PII exposure, RBAC enforcement
                        gaps, specialized advice compliance, and unsupervised contract
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
                        minRows={2}
                        variant="outlined"
                        sx={{
                          '& .MuiInputBase-inputMultiline': {
                            resize: 'vertical',
                            minHeight: '56px',
                          },
                        }}
                      />
                    </Box>
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {/* Data & Content */}
              <Accordion
                expanded={expandedSections.has('Data & Content')}
                onChange={() => handleSectionToggle('Data & Content')}
                sx={{
                  mb: 0,
                  '&:not(:last-of-type)': {
                    borderBottom: 'none',
                  },
                  '&:before': {
                    display: 'none',
                  },
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 'medium', flex: 1, color: 'text.primary' }}
                    >
                      Data & Content ({getCompletionPercentage('Data & Content')})
                    </Typography>
                    {getCompletionPercentage('Data & Content') === '100%' && (
                      <CheckCircleIcon sx={{ color: 'success.main', mr: 1 }} />
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 4, py: 3 }}>
                  <Stack spacing={3}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                        What types of sensitive data does your application handle?{' '}
                        <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                          (optional)
                        </span>
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Understanding data sensitivity helps generate targeted privacy and data
                        protection attacks, including tests for direct PII exposure, PII leakage in
                        APIs/databases/sessions, social engineering attacks, and privacy violations.{' '}
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
                        minRows={2}
                        variant="outlined"
                        sx={{
                          '& .MuiInputBase-inputMultiline': {
                            resize: 'vertical',
                            minHeight: '56px',
                          },
                        }}
                      />
                    </Box>

                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                        What are some example identifiers, names, or data points your application
                        uses?{' '}
                        <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                          (optional)
                        </span>
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Provide realistic examples of the types of data and identifiers in your
                        system. This enables testing for direct PII exposure, PII leakage in
                        APIs/databases/sessions, divergent repetition attacks, and cross-session
                        data leaks.{' '}
                        <strong>
                          Specific data formats and ID patterns are especially important for
                          accurately grading whether attacks successfully extract real-looking data
                          from your system.
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
                        minRows={2}
                        variant="outlined"
                        sx={{
                          '& .MuiInputBase-inputMultiline': {
                            resize: 'vertical',
                            minHeight: '56px',
                          },
                        }}
                      />
                    </Box>

                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                        What are the most critical or dangerous actions your application can
                        perform?{' '}
                        <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                          (optional)
                        </span>
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Identify high-risk operations that should be heavily protected from misuse.
                        This helps generate tests for privilege escalation, shell injection, SQL
                        injection, malicious code execution, debug access vulnerabilities, and
                        system prompt override attacks.
                      </Typography>
                      <TextField
                        fullWidth
                        value={config.applicationDefinition?.criticalActions}
                        onChange={(e) =>
                          updateApplicationDefinition('criticalActions', e.target.value)
                        }
                        placeholder="e.g. Prescribing medication, financial transactions, data deletion, system configuration changes..."
                        multiline
                        minRows={2}
                        variant="outlined"
                        sx={{
                          '& .MuiInputBase-inputMultiline': {
                            resize: 'vertical',
                            minHeight: '56px',
                          },
                        }}
                      />
                    </Box>

                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                        What content or topics should your application never discuss or promote?{' '}
                        <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                          (optional)
                        </span>
                      </Typography>
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
                        minRows={2}
                        variant="outlined"
                        sx={{
                          '& .MuiInputBase-inputMultiline': {
                            resize: 'vertical',
                            minHeight: '56px',
                          },
                        }}
                      />
                    </Box>
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {/* Business Context */}
              <Accordion
                expanded={expandedSections.has('Business Context')}
                onChange={() => handleSectionToggle('Business Context')}
                sx={{
                  mb: 0,
                  '&:last-of-type': {
                    borderBottomLeftRadius: '8px',
                    borderBottomRightRadius: '8px',
                  },
                  '&:before': {
                    display: 'none',
                  },
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 'medium', flex: 1, color: 'text.primary' }}
                    >
                      Business Context ({getCompletionPercentage('Business Context')})
                    </Typography>
                    {getCompletionPercentage('Business Context') === '100%' && (
                      <CheckCircleIcon sx={{ color: 'success.main', mr: 1 }} />
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 4, py: 3 }}>
                  <Stack spacing={3}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                        Who are your main competitors that shouldn't be endorsed or promoted?{' '}
                        <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>
                          (optional)
                        </span>
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        List companies or products that your application should remain neutral
                        about. This helps test for competitor endorsement vulnerabilities, brand
                        bias issues, and inappropriate imitation behaviors.
                      </Typography>
                      <TextField
                        fullWidth
                        value={config.applicationDefinition?.competitors}
                        onChange={(e) => updateApplicationDefinition('competitors', e.target.value)}
                        placeholder="e.g. Epic Systems, Cerner, Allscripts, athenahealth..."
                        multiline
                        minRows={2}
                        variant="outlined"
                        sx={{
                          '& .MuiInputBase-inputMultiline': {
                            resize: 'vertical',
                            minHeight: '56px',
                          },
                        }}
                      />
                    </Box>
                  </Stack>
                </AccordionDetails>
              </Accordion>
            </Stack>

            {/* Red Team User - Standalone Section */}
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" sx={{ fontWeight: 'medium', mb: 2 }}>
                Red Team User
              </Typography>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                  Who is the red team user?{' '}
                  <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>(optional)</span>
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Define the persona attempting to attack your system. This helps create realistic
                  attack scenarios for social engineering attacks targeting PII, hijacking attempts,
                  prompt extraction, system prompt override, and role-based security
                  vulnerabilities.
                </Typography>

                {discoveryResult && discoveryResult.user && (
                  <DiscoveryResult text={discoveryResult.user} section="redteamUser" />
                )}

                <TextField
                  fullWidth
                  value={config.applicationDefinition?.redteamUser}
                  onChange={(e) => updateApplicationDefinition('redteamUser', e.target.value)}
                  placeholder="e.g. A patient seeking medical assistance, a customer service representative, an external researcher..."
                  multiline
                  minRows={2}
                  variant="outlined"
                  sx={{
                    '& .MuiInputBase-inputMultiline': {
                      resize: 'vertical',
                      minHeight: '56px',
                    },
                  }}
                />
              </Box>
            </Box>

            {/* Test Generation Instructions - Standalone Section */}
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" sx={{ fontWeight: 'medium', mb: 2 }}>
                Test Generation Instructions
              </Typography>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mb: 1 }}>
                  Additional instructions for test generation{' '}
                  <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>(optional)</span>
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Provide specific guidance on how red team attacks should be generated for your
                  application. These instructions will be included in all test generation prompts to
                  ensure attacks are contextually relevant and follow your desired approach. This is
                  particularly useful for domain-specific applications or when you want to focus on
                  particular attack patterns.
                </Typography>
                <TextField
                  fullWidth
                  value={config.testGenerationInstructions}
                  onChange={(e) => updateConfig('testGenerationInstructions', e.target.value)}
                  placeholder="e.g. Focus on healthcare-specific attacks using medical terminology and patient scenarios. Ensure all prompts reference realistic medical situations that could occur in patient interactions."
                  multiline
                  minRows={3}
                  variant="outlined"
                  sx={{
                    '& .MuiInputBase-inputMultiline': {
                      resize: 'vertical',
                      minHeight: '72px',
                    },
                  }}
                />
              </Box>
            </Box>
          </Stack>
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
              When testing a model directly, you don't need to provide application details. You can
              proceed to configure the model and test scenarios in the next steps.
            </Alert>
          </Box>
        )}

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
      </Stack>
    </Box>
  );
}
