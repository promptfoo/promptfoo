import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dedent from 'dedent';
import { z } from 'zod';
import { cloudConfig } from '../../../globalConfig/cloud';
import logger from '../../../logger';
import Eval from '../../../models/eval';
import {
  createShareableUrl,
  getShareableUrl,
  hasEvalBeenShared,
  isSharingEnabled,
} from '../../../share';
import { loadDefaultConfig } from '../../../util/config/default';
import { createToolResponse } from '../utils';

/**
 * Share an evaluation to create a publicly accessible URL
 *
 * Use this tool to:
 * - Create shareable URLs for evaluation results
 * - Share evaluation insights with team members or stakeholders
 * - Generate links for reporting and presentations
 * - Make evaluation data accessible outside the local environment
 *
 * Features:
 * - Share specific evaluations by ID or latest evaluation
 * - Support for both cloud and self-hosted sharing
 * - Option to include or exclude authentication information
 * - Automatic handling of sharing configuration and permissions
 * - Validation that evaluations are complete and shareable
 *
 * Perfect for:
 * - Creating reports and presentations
 * - Collaborating with team members
 * - Sharing results with stakeholders
 * - Publishing evaluation insights
 */
export function registerShareEvaluationTool(server: McpServer) {
  server.tool(
    'share_evaluation',
    {
      evalId: z
        .string()
        .optional()
        .describe(
          dedent`
            Specific evaluation ID to share.
            If not provided, shares the most recent evaluation.
            Example: "eval_abc123def456"
          `,
        ),
      showAuth: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          dedent`
            Whether to include authentication information in the shared URL.
            Default: false (excludes auth for security)
          `,
        ),
      overwrite: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          dedent`
            Whether to overwrite if the evaluation has already been shared.
            Default: false (will return existing URL if already shared)
          `,
        ),
    },
    async (args) => {
      try {
        const { evalId, showAuth = false, overwrite = false } = args;

        // Find the evaluation to share
        let evalRecord: Eval | undefined = undefined;
        if (evalId) {
          evalRecord = await Eval.findById(evalId);
          if (!evalRecord) {
            return createToolResponse(
              'share_evaluation',
              false,
              undefined,
              `Could not find evaluation with ID: ${evalId}. Use list_evaluations to find valid IDs.`,
            );
          }
        } else {
          evalRecord = await Eval.latest();
          if (!evalRecord) {
            return createToolResponse(
              'share_evaluation',
              false,
              undefined,
              'No evaluations found. Run an evaluation first using run_evaluation or the CLI.',
            );
          }
        }

        // Apply sharing configuration from default config if available
        try {
          const { defaultConfig } = await loadDefaultConfig();
          if (defaultConfig && defaultConfig.sharing) {
            evalRecord.config.sharing = defaultConfig.sharing;
            logger.debug(`Applied sharing config: ${JSON.stringify(defaultConfig.sharing)}`);
          }
        } catch (err) {
          logger.debug(`Could not load sharing config: ${err}`);
        }

        // Validate that the evaluation can be shared
        if (evalRecord.prompts.length === 0) {
          return createToolResponse(
            'share_evaluation',
            false,
            undefined,
            dedent`
              Evaluation ${evalRecord.id} cannot be shared.
              This may be because:
              - The evaluation is still running
              - The evaluation did not complete successfully
              - No prompts were defined in the evaluation
              
              Wait for the evaluation to complete or check its status.
            `,
          );
        }

        // Check if sharing is enabled
        if (isSharingEnabled(evalRecord) === false) {
          const isCloudEnabled = cloudConfig.isEnabled();
          return createToolResponse(
            'share_evaluation',
            false,
            {
              evalId: evalRecord.id,
              sharingEnabled: false,
              cloudEnabled: isCloudEnabled,
              instructions: {
                cloudSetup:
                  isCloudEnabled === false
                    ? [
                        'Sign up or log in at https://promptfoo.app',
                        'Follow instructions at https://promptfoo.app/welcome to login via CLI',
                        'Configure sharing in your promptfooconfig.yaml',
                      ]
                    : null,
                configHelp: 'Enable sharing by adding "sharing: true" to your promptfooconfig.yaml',
              },
            },
            dedent`
              Sharing is not enabled for this evaluation.
              ${
                isCloudEnabled === false
                  ? 'You need a cloud account to share evaluations securely.'
                  : 'Check your sharing configuration in promptfooconfig.yaml.'
              }
            `,
          );
        }

        // Check if evaluation has already been shared (only for cloud)
        let existingUrl: string | null = null;
        if (cloudConfig.isEnabled() && !overwrite) {
          const alreadyShared = await hasEvalBeenShared(evalRecord);
          if (alreadyShared && evalId) {
            existingUrl = await getShareableUrl(evalRecord, evalId, showAuth);
            if (existingUrl) {
              const shareData = {
                url: existingUrl,
                evalId,
                createdAt: evalRecord.createdAt,
                description: evalRecord.description,
                isExisting: true,
                message: 'Evaluation already shared',
              };
              return createToolResponse('share_evaluation', true, shareData);
            }
          }
        }

        // Create new shareable URL
        logger.debug(`Creating shareable URL for evaluation ${evalRecord.id}`);
        const shareUrl = await createShareableUrl(evalRecord, showAuth);

        if (!shareUrl) {
          return createToolResponse(
            'share_evaluation',
            false,
            {
              evalId: evalRecord.id,
              error: 'Failed to create shareable URL',
              troubleshooting: [
                'Check internet connectivity',
                'Verify sharing service is accessible',
                'Check authentication credentials',
                'Ensure evaluation data is valid',
              ],
            },
            'Failed to create shareable URL. Check connectivity and authentication.',
          );
        }

        // Success response with comprehensive metadata
        const shareData = {
          evalId: evalRecord.id,
          shareUrl,
          alreadyShared: false,
          sharing: {
            showAuth,
            cloudEnabled: cloudConfig.isEnabled(),
            domain: new URL(shareUrl).hostname,
            isPublic: !cloudConfig.isEnabled(),
          },
          evaluation: {
            description: evalRecord.config.description || 'No description',
            promptCount: evalRecord.prompts.length,
            createdAt: (evalRecord as any).createdAt || 'Unknown',
            author: evalRecord.author || 'Unknown',
          },
          instructions: {
            sharing: 'Share this URL with team members or stakeholders',
            viewing: 'Recipients can view evaluation results in their browser',
            collaboration: 'Use this for reports, presentations, and team collaboration',
          },
        };

        return createToolResponse('share_evaluation', true, shareData);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logger.error(`Share evaluation failed: ${errorMessage}`);

        const errorData = {
          evalId: args.evalId || 'latest',
          error: errorMessage,
          sharing: {
            showAuth: args.showAuth || false,
            cloudEnabled: cloudConfig.isEnabled(),
          },
          troubleshooting: {
            commonIssues: [
              'Network connectivity problems',
              'Authentication/authorization issues',
              'Invalid evaluation ID',
              'Sharing service unavailable',
              'Evaluation not completed or corrupted',
            ],
            configurationTips: [
              'Ensure sharing is enabled in promptfooconfig.yaml',
              'Check cloud authentication status',
              'Verify evaluation exists and completed successfully',
              'Check network connectivity to sharing service',
            ],
            examples: {
              shareLatest: '{"evalId": null}',
              shareSpecific: '{"evalId": "eval_abc123def456"}',
              withAuth: '{"evalId": "eval_123", "showAuth": true}',
              overwrite: '{"evalId": "eval_123", "overwrite": true}',
            },
          },
        };

        return createToolResponse('share_evaluation', false, errorData);
      }
    },
  );
}
