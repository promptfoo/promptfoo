import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { Code } from '@app/components/ui/code';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { Label } from '@app/components/ui/label';
import { Textarea } from '@app/components/ui/textarea';
import { useApiHealth } from '@app/hooks/useApiHealth';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { cn } from '@app/lib/utils';
import { callApi } from '@app/utils/api';
import { formatToolsAsJSDocs } from '@app/utils/discovery';
import { type TargetPurposeDiscoveryResult } from '@promptfoo/redteam/commands/discover';
import { AlertTriangle, CheckCircle, ChevronDown, Info, Sparkles } from 'lucide-react';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from '../hooks/useRedTeamConfig';
import PageWrapper from './PageWrapper';

import type { ApplicationDefinition } from '../types';

interface PromptsProps {
  onNext: () => void;
  onBack?: () => void;
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
    <div className="relative mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 dark:border-primary/30 dark:bg-primary/10">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary/80">
            Auto-Discovery Result
          </p>
          <p className="whitespace-pre-wrap wrap-break-word font-mono text-[13px] leading-relaxed text-foreground">
            {text}
          </p>
        </div>
        <Button size="sm" onClick={handleApply} disabled={applied}>
          <Sparkles className="mr-2 size-3.5" />
          Apply
        </Button>
      </div>
    </div>
  );
}

/**
 * "Usage Details" step of the red teaming config setup wizard.
 */
export default function Purpose({ onNext, onBack }: PromptsProps) {
  const { config, updateApplicationDefinition } = useRedTeamConfig();
  const { recordEvent } = useTelemetry();
  const {
    data: { status: apiHealthStatus },
    refetch: checkHealth,
  } = useApiHealth();
  const [testMode, setTestMode] = useState<'application' | 'model'>('application');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['Core Application Details']), // Expand the first section by default since it has required fields
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_purpose' });
  }, []);

  const handleTestModeChange = (newMode: 'application' | 'model') => {
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
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

  const getNextButtonTooltip = () => {
    if (testMode === 'application' && !isPurposePresent) {
      return 'Please enter the application purpose to continue';
    }
    return undefined;
  };

  return (
    <PageWrapper
      title="Application Details"
      description={(() => {
        switch (testMode) {
          case 'application':
            return 'Describe your application so we can generate targeted security tests.';
          case 'model':
            return 'Describe the foundation model so we can generate targeted tests.';
          default:
            return '';
        }
      })()}
      onNext={onNext}
      onBack={onBack}
      nextDisabled={testMode === 'application' && !isPurposePresent}
      warningMessage={
        testMode === 'application' && !isPurposePresent ? getNextButtonTooltip() : undefined
      }
    >
      <div className="w-full px-3">
        <div className="space-y-8">
          {/* Test Mode Toggle */}
          <div className="flex rounded-lg border border-border">
            <button
              type="button"
              aria-pressed={testMode === 'application'}
              className={cn(
                'flex flex-1 flex-col gap-1 px-4 py-3 text-left transition-colors',
                testMode === 'application' ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50',
              )}
              onClick={() => handleTestModeChange('application')}
            >
              <span className="text-sm font-medium">I'm testing an application</span>
              <span className="text-xs text-muted-foreground">
                Test a complete AI application with its context
              </span>
            </button>
            <button
              type="button"
              aria-pressed={testMode === 'model'}
              className={cn(
                'flex flex-1 flex-col gap-1 border-l border-border px-4 py-3 text-left transition-colors',
                testMode === 'model' ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50',
              )}
              onClick={() => handleTestModeChange('model')}
            >
              <span className="text-sm font-medium">I'm testing a model</span>
              <span className="text-xs text-muted-foreground">
                Test a model directly without application context
              </span>
            </button>
          </div>

          {testMode === 'application' ? (
            <div className="space-y-8">
              {/* Auto-Discover Target Details */}
              {!discoveryResult && (
                <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-linear-to-br from-primary/5 via-background to-background p-6 shadow-sm">
                  {/* Subtle decorative element */}
                  <div className="absolute -right-8 -top-8 size-32 rounded-full bg-primary/5 blur-2xl" />

                  <div className="relative space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                        <Sparkles className="size-5 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold tracking-tight">Auto-Discovery</h2>
                        <p className="text-xs text-muted-foreground">
                          1-click detection of your target's capabilities
                        </p>
                      </div>
                    </div>

                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      Automatically analyze your target to discover its purpose, tools, and
                      limitations.{' '}
                      <a
                        href="https://promptfoo.dev/docs/red-team/discovery"
                        target="_blank"
                        className="text-primary/80 underline underline-offset-2 hover:text-primary"
                      >
                        Learn more
                      </a>
                    </p>

                    <Button
                      disabled={
                        !hasTargetConfigured ||
                        apiHealthStatus !== 'connected' ||
                        !!discoveryError ||
                        !!discoveryResult ||
                        isDiscovering
                      }
                      onClick={handleTargetPurposeDiscovery}
                      className="w-37.5"
                    >
                      {isDiscovering ? 'Discovering...' : 'Discover'}
                    </Button>

                    {isDiscovering && showSlowDiscoveryMessage && (
                      <Alert variant="info">
                        <Info className="size-4" />
                        <AlertContent>
                          <AlertDescription>
                            Discovery is taking a little while. This is normal for complex
                            applications.
                          </AlertDescription>
                        </AlertContent>
                      </Alert>
                    )}
                    {!hasTargetConfigured && (
                      <Alert variant="warning">
                        <AlertTriangle className="size-4" />
                        <AlertContent>
                          <AlertDescription>
                            You must configure a target to run auto-discovery.
                          </AlertDescription>
                        </AlertContent>
                      </Alert>
                    )}
                    {hasTargetConfigured && ['blocked', 'disabled'].includes(apiHealthStatus) && (
                      <Alert variant="destructive">
                        <AlertTriangle className="size-4" />
                        <AlertContent>
                          <AlertDescription>
                            Cannot connect to Promptfoo API. Auto-discovery requires a healthy API
                            connection.
                          </AlertDescription>
                        </AlertContent>
                      </Alert>
                    )}
                    {discoveryError && (
                      <>
                        <Alert variant="destructive">
                          <AlertTriangle className="size-4" />
                          <AlertContent>
                            <AlertDescription>{discoveryError}</AlertDescription>
                          </AlertContent>
                        </Alert>
                        <div className="rounded-lg border border-border bg-background/80 p-4">
                          <p className="mb-3 text-[13px] text-muted-foreground">
                            To re-attempt discovery from your terminal:
                          </p>
                          <div className="space-y-1.5 text-[13px] text-muted-foreground">
                            <p>
                              <span className="font-medium text-foreground">1.</span> Save Config
                              and export as YAML
                            </p>
                            <p>
                              <span className="font-medium text-foreground">2.</span> Run the
                              command:
                            </p>
                          </div>
                          <Code className="mt-2">
                            promptfoo redteam discover -c redteam-config.yaml
                          </Code>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Main Purpose - Standalone Section */}
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">Application Details</h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                    This is the most critical step for generating effective red team attacks. The
                    quality and specificity of your responses directly determines how targeted and
                    realistic the generated attacks will be.
                  </p>
                </div>

                <div>
                  <Label className="mb-1.5 block text-base">
                    What is the main purpose of your application?
                    <span className="ml-1 text-destructive/80">*</span>
                  </Label>
                  <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                    Describe the primary objective and goals of your application. This foundational
                    information provides essential context for generating targeted security tests.
                  </p>

                  {discoveryResult && discoveryResult.purpose && (
                    <DiscoveryResult text={discoveryResult.purpose} section="purpose" />
                  )}

                  <Textarea
                    value={config.applicationDefinition?.purpose ?? ''}
                    onChange={(e) => updateApplicationDefinition('purpose', e.target.value)}
                    placeholder="e.g. Assist healthcare professionals and patients with medical-related tasks, access medical information, schedule appointments..."
                    rows={3}
                    className="min-h-18 resize-y"
                  />
                </div>
                <p className="text-xs text-muted-foreground/80">
                  Only the purpose is required. Additional details improve test targeting.
                </p>
              </div>

              <div className="space-y-0">
                {/* Core Application Details */}
                <Collapsible
                  open={expandedSections.has('Core Application Details')}
                  onOpenChange={() => handleSectionToggle('Core Application Details')}
                  className="rounded-t-lg border border-border"
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between p-4 hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-semibold tracking-tight">
                        Core Application Details
                      </h3>
                      <span className="text-xs font-medium text-muted-foreground">
                        {getCompletionPercentage('Core Application Details')}
                      </span>
                      {getCompletionPercentage('Core Application Details') === '100%' && (
                        <CheckCircle className="size-4 text-emerald-500" />
                      )}
                    </div>
                    <ChevronDown
                      className={cn(
                        'size-5 transition-transform',
                        expandedSections.has('Core Application Details') && 'rotate-180',
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t border-border px-6 py-4">
                    <div className="space-y-6">
                      <div>
                        <Label className="mb-1.5 flex items-baseline gap-2">
                          What key features does your application provide?
                          <span className="text-xs font-normal text-muted-foreground/70">
                            optional
                          </span>
                        </Label>
                        <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
                          List the main capabilities and functionalities available to users.
                        </p>
                        <Textarea
                          value={config.applicationDefinition?.features ?? ''}
                          onChange={(e) => updateApplicationDefinition('features', e.target.value)}
                          placeholder="e.g. Patient record access, appointment scheduling, prescription management, lab results retrieval..."
                          rows={2}
                          className="min-h-14 resize-y"
                        />
                      </div>

                      <div>
                        <Label className="mb-1.5 flex items-baseline gap-2">
                          What industry or domain does your application operate in?
                          <span className="text-xs font-normal text-muted-foreground/70">
                            optional
                          </span>
                        </Label>
                        <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
                          Helps generate industry-specific attacks and compliance tests.
                        </p>
                        <Textarea
                          value={config.applicationDefinition?.industry ?? ''}
                          onChange={(e) => updateApplicationDefinition('industry', e.target.value)}
                          placeholder="e.g. Healthcare, Financial Services, Education, E-commerce, Government, Legal..."
                          rows={1}
                          className="min-h-10 resize-y"
                        />
                      </div>

                      <div>
                        <Label className="mb-1.5 flex items-baseline gap-2">
                          Any constraints or rules attackers should know about?
                          <span className="text-xs font-normal text-muted-foreground/70">
                            optional
                          </span>
                        </Label>
                        <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
                          Describe guardrails, restricted topics, input formats, or domain-specific
                          rules.
                        </p>

                        {discoveryResult && discoveryResult.limitations && (
                          <DiscoveryResult
                            text={discoveryResult.limitations}
                            section="attackConstraints"
                          />
                        )}

                        <Textarea
                          value={config.applicationDefinition?.attackConstraints ?? ''}
                          onChange={(e) =>
                            updateApplicationDefinition('attackConstraints', e.target.value)
                          }
                          placeholder="e.g. The agent only responds to voicemail-related queries, so every attack should mention voicemail services. OR: All interactions must be in the context of medical appointments, so attacks should reference scheduling or patient care."
                          rows={2}
                          className="min-h-14 resize-y"
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Access & Permissions */}
                <Collapsible
                  open={expandedSections.has('Access & Permissions')}
                  onOpenChange={() => handleSectionToggle('Access & Permissions')}
                  className="border-x border-b border-border"
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between p-4 hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-semibold tracking-tight">
                        Access & Permissions
                      </h3>
                      <span className="text-xs font-medium text-muted-foreground">
                        {getCompletionPercentage('Access & Permissions')}
                      </span>
                      {getCompletionPercentage('Access & Permissions') === '100%' && (
                        <CheckCircle className="size-4 text-emerald-500" />
                      )}
                    </div>
                    <ChevronDown
                      className={cn(
                        'size-5 transition-transform',
                        expandedSections.has('Access & Permissions') && 'rotate-180',
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t border-border px-6 py-4">
                    <div className="space-y-6">
                      <div>
                        <Label className="mb-1.5 flex items-baseline gap-2">
                          What systems or resources does your application have access to?
                          <span className="text-xs font-normal text-muted-foreground/70">
                            optional
                          </span>
                        </Label>
                        <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
                          Describe what your application can legitimately access and use.
                        </p>

                        {discoveryResult && toolsAsJSDocs && (
                          <DiscoveryResult text={toolsAsJSDocs} section="hasAccessTo" />
                        )}

                        <Textarea
                          value={config.applicationDefinition?.hasAccessTo ?? ''}
                          onChange={(e) =>
                            updateApplicationDefinition('hasAccessTo', e.target.value)
                          }
                          placeholder="e.g. Patient's own medical records, appointment scheduling system, prescription database..."
                          rows={2}
                          className="min-h-14 resize-y"
                        />
                      </div>

                      <div>
                        <Label className="mb-1.5 flex items-baseline gap-2">
                          What should your application NOT have access to?
                          <span className="text-xs font-normal text-muted-foreground/70">
                            optional
                          </span>
                        </Label>
                        <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
                          Specify restricted systems, data, or resources.
                        </p>
                        <Textarea
                          value={config.applicationDefinition?.doesNotHaveAccessTo ?? ''}
                          onChange={(e) =>
                            updateApplicationDefinition('doesNotHaveAccessTo', e.target.value)
                          }
                          placeholder="e.g. Other patients' records, financial systems, admin backends..."
                          rows={2}
                          className="min-h-14 resize-y"
                        />
                      </div>

                      <div>
                        <Label className="mb-1.5 flex items-baseline gap-2">
                          What types of users interact with your application?
                          <span className="text-xs font-normal text-muted-foreground/70">
                            optional
                          </span>
                        </Label>
                        <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
                          Describe user roles and their authorization levels.
                        </p>
                        <Textarea
                          value={config.applicationDefinition?.userTypes ?? ''}
                          onChange={(e) => updateApplicationDefinition('userTypes', e.target.value)}
                          placeholder="e.g. Authorized Patients, Healthcare Providers, Administrators..."
                          rows={2}
                          className="min-h-14 resize-y"
                        />
                      </div>

                      <div>
                        <Label className="mb-1.5 flex items-baseline gap-2">
                          What security and compliance requirements apply?
                          <span className="text-xs font-normal text-muted-foreground/70">
                            optional
                          </span>
                        </Label>
                        <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
                          List security, privacy, and regulatory requirements.
                        </p>
                        <Textarea
                          value={config.applicationDefinition?.securityRequirements ?? ''}
                          onChange={(e) =>
                            updateApplicationDefinition('securityRequirements', e.target.value)
                          }
                          placeholder="e.g. HIPAA compliance, patient confidentiality, audit logging..."
                          rows={2}
                          className="min-h-14 resize-y"
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Data & Content */}
                <Collapsible
                  open={expandedSections.has('Data & Content')}
                  onOpenChange={() => handleSectionToggle('Data & Content')}
                  className="border-x border-b border-border"
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between p-4 hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-semibold tracking-tight">Data & Content</h3>
                      <span className="text-xs font-medium text-muted-foreground">
                        {getCompletionPercentage('Data & Content')}
                      </span>
                      {getCompletionPercentage('Data & Content') === '100%' && (
                        <CheckCircle className="size-4 text-emerald-500" />
                      )}
                    </div>
                    <ChevronDown
                      className={cn(
                        'size-5 transition-transform',
                        expandedSections.has('Data & Content') && 'rotate-180',
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t border-border px-6 py-4">
                    <div className="space-y-6">
                      <div>
                        <Label className="mb-1.5 flex items-baseline gap-2">
                          What types of sensitive data does your application handle?
                          <span className="text-xs font-normal text-muted-foreground/70">
                            optional
                          </span>
                        </Label>
                        <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
                          Helps generate targeted privacy and data protection attacks. Also used to
                          grade attack effectiveness.
                        </p>
                        <Textarea
                          value={config.applicationDefinition?.sensitiveDataTypes ?? ''}
                          onChange={(e) =>
                            updateApplicationDefinition('sensitiveDataTypes', e.target.value)
                          }
                          placeholder="e.g. Personal health information, financial records, SSNs, payment data..."
                          rows={2}
                          className="min-h-14 resize-y"
                        />
                      </div>

                      <div>
                        <Label className="mb-1.5 flex items-baseline gap-2">
                          Example identifiers or data points your application uses?
                          <span className="text-xs font-normal text-muted-foreground/70">
                            optional
                          </span>
                        </Label>
                        <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
                          Realistic examples help test for PII exposure. Specific formats improve
                          grading accuracy.
                        </p>
                        <Textarea
                          value={config.applicationDefinition?.exampleIdentifiers ?? ''}
                          onChange={(e) =>
                            updateApplicationDefinition('exampleIdentifiers', e.target.value)
                          }
                          placeholder="e.g. Patient IDs (MRN2023001), Emails (user@example.com), Prescription IDs (RX123456)..."
                          rows={2}
                          className="min-h-14 resize-y"
                        />
                      </div>

                      <div>
                        <Label className="mb-1.5 flex items-baseline gap-2">
                          What critical or dangerous actions can your application perform?
                          <span className="text-xs font-normal text-muted-foreground/70">
                            optional
                          </span>
                        </Label>
                        <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
                          High-risk operations that should be protected from misuse.
                        </p>
                        <Textarea
                          value={config.applicationDefinition?.criticalActions ?? ''}
                          onChange={(e) =>
                            updateApplicationDefinition('criticalActions', e.target.value)
                          }
                          placeholder="e.g. Prescribing medication, financial transactions, data deletion..."
                          rows={2}
                          className="min-h-14 resize-y"
                        />
                      </div>

                      <div>
                        <Label className="mb-1.5 flex items-baseline gap-2">
                          What topics should your application never discuss?
                          <span className="text-xs font-normal text-muted-foreground/70">
                            optional
                          </span>
                        </Label>
                        <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
                          Content boundaries to test for harmful or inappropriate responses.
                        </p>
                        <Textarea
                          value={config.applicationDefinition?.forbiddenTopics ?? ''}
                          onChange={(e) =>
                            updateApplicationDefinition('forbiddenTopics', e.target.value)
                          }
                          placeholder="e.g. Self-harm, illegal drugs, violence, competitor products..."
                          rows={2}
                          className="min-h-14 resize-y"
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Business Context */}
                <Collapsible
                  open={expandedSections.has('Business Context')}
                  onOpenChange={() => handleSectionToggle('Business Context')}
                  className="rounded-b-lg border-x border-b border-border"
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between p-4 hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-semibold tracking-tight">Business Context</h3>
                      <span className="text-xs font-medium text-muted-foreground">
                        {getCompletionPercentage('Business Context')}
                      </span>
                      {getCompletionPercentage('Business Context') === '100%' && (
                        <CheckCircle className="size-4 text-emerald-500" />
                      )}
                    </div>
                    <ChevronDown
                      className={cn(
                        'size-5 transition-transform',
                        expandedSections.has('Business Context') && 'rotate-180',
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t border-border px-6 py-4">
                    <div className="space-y-6">
                      <div>
                        <Label className="mb-1.5 flex items-baseline gap-2">
                          Competitors that shouldn't be endorsed or promoted?
                          <span className="text-xs font-normal text-muted-foreground/70">
                            optional
                          </span>
                        </Label>
                        <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
                          Companies or products your application should remain neutral about.
                        </p>
                        <Textarea
                          value={config.applicationDefinition?.competitors ?? ''}
                          onChange={(e) =>
                            updateApplicationDefinition('competitors', e.target.value)
                          }
                          placeholder="e.g. Epic Systems, Cerner, Allscripts, athenahealth..."
                          rows={2}
                          className="min-h-14 resize-y"
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* Red Team User - Standalone Section */}
              <div className="mt-8 space-y-4">
                <h2 className="text-lg font-semibold tracking-tight">Red Team User</h2>
                <div>
                  <Label className="mb-1.5 flex items-baseline gap-2">
                    Who typically uses this system?
                    <span className="text-xs font-normal text-muted-foreground/70">optional</span>
                  </Label>
                  <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
                    The red team will simulate these user personas when testing for vulnerabilities.
                  </p>

                  {discoveryResult && discoveryResult.user && (
                    <DiscoveryResult text={discoveryResult.user} section="redteamUser" />
                  )}

                  <Textarea
                    value={config.applicationDefinition?.redteamUser ?? ''}
                    onChange={(e) => updateApplicationDefinition('redteamUser', e.target.value)}
                    placeholder="e.g. An engineer at Acme Inc, a healthcare provider, a financial analyst..."
                    rows={2}
                    className="min-h-14 resize-y"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <Alert variant="info">
                <Info className="size-4" />
                <AlertContent>
                  <AlertDescription>
                    When testing a model directly, you don't need to provide application details.
                    You can proceed to configure the model and test scenarios in the next steps.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
