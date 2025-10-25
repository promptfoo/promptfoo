/**
 * Model Context Protocol (MCP) integration for ElevenLabs Agents
 *
 * Enables advanced tool orchestration with approval policies
 */

import logger from '../../../logger';
import { fetchWithProxy } from '../../../util/fetch/index';
import { ElevenLabsClient } from '../client';
import type { MCPConfig } from './types';

/**
 * Set up MCP integration for an agent
 */
export async function setupMCPIntegration(
  client: ElevenLabsClient,
  agentId: string,
  config: MCPConfig,
): Promise<void> {
  logger.debug('[ElevenLabs MCP] Setting up MCP integration', {
    agentId,
    serverUrl: config.serverUrl,
    approvalPolicy: config.approvalPolicy,
  });

  await client.post(`/convai/agents/${agentId}/mcp`, {
    server_url: config.serverUrl,
    approval_policy: config.approvalPolicy || 'auto',
    approval_conditions: config.approvalConditions
      ? {
          require_approval_for_tools: config.approvalConditions.requireApprovalForTools || [],
          require_approval_for_cost: config.approvalConditions.requireApprovalForCost,
        }
      : undefined,
    timeout: config.timeout || 30000,
  });

  logger.debug('[ElevenLabs MCP] MCP integration configured successfully', {
    agentId,
  });
}

/**
 * Validate MCP configuration
 */
export function validateMCPConfig(config: MCPConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate server URL
  if (!config.serverUrl || config.serverUrl.trim().length === 0) {
    errors.push('MCP server URL is required');
  } else {
    try {
      new URL(config.serverUrl);
    } catch {
      errors.push('MCP server URL must be a valid URL');
    }
  }

  // Validate approval policy
  if (config.approvalPolicy) {
    const validPolicies = ['auto', 'manual', 'conditional'];
    if (!validPolicies.includes(config.approvalPolicy)) {
      errors.push(`Approval policy must be one of: ${validPolicies.join(', ')}`);
    }
  }

  // Validate conditional approval config
  if (config.approvalPolicy === 'conditional' && !config.approvalConditions) {
    errors.push('Approval conditions are required when using conditional approval policy');
  }

  // Validate cost threshold
  if (config.approvalConditions?.requireApprovalForCost !== undefined) {
    if (config.approvalConditions.requireApprovalForCost <= 0) {
      errors.push('Cost threshold for approval must be positive');
    }
  }

  // Validate timeout
  if (config.timeout !== undefined && config.timeout <= 0) {
    errors.push('Timeout must be positive');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Test MCP server connectivity
 */
export async function testMCPServer(serverUrl: string): Promise<{
  success: boolean;
  error?: string;
  serverInfo?: {
    name: string;
    version: string;
    capabilities: string[];
  };
}> {
  try {
    const response = await fetchWithProxy(`${serverUrl}/health`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `MCP server returned HTTP ${response.status}`,
      };
    }

    const data = await response.json();

    return {
      success: true,
      serverInfo: {
        name: data.name || 'Unknown',
        version: data.version || 'Unknown',
        capabilities: data.capabilities || [],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Predefined MCP approval policies
 */
export const MCP_APPROVAL_PRESETS = {
  // Auto-approve all tool calls
  autoApprove: {
    approvalPolicy: 'auto' as const,
  },

  // Require manual approval for all tools
  manualApproval: {
    approvalPolicy: 'manual' as const,
  },

  // Conditional: approve low-risk, request approval for high-risk
  conditionalLowRisk: {
    approvalPolicy: 'conditional' as const,
    approvalConditions: {
      requireApprovalForTools: [
        'delete_data',
        'send_payment',
        'modify_permissions',
        'execute_code',
      ],
      requireApprovalForCost: 1.0, // $1 threshold
    },
  },

  // Conditional: very permissive, only block destructive actions
  conditionalPermissive: {
    approvalPolicy: 'conditional' as const,
    approvalConditions: {
      requireApprovalForTools: ['delete_all', 'drop_database', 'send_payment'],
      requireApprovalForCost: 10.0, // $10 threshold
    },
  },

  // Conditional: restrictive, approve only safe read operations
  conditionalRestrictive: {
    approvalPolicy: 'conditional' as const,
    approvalConditions: {
      requireApprovalForTools: ['create', 'update', 'delete', 'send', 'execute', 'modify'],
      requireApprovalForCost: 0.1, // $0.10 threshold
    },
  },
};

/**
 * Get MCP approval preset by name
 */
export function getMCPApprovalPreset(
  presetName: keyof typeof MCP_APPROVAL_PRESETS,
): Partial<MCPConfig> {
  const preset = MCP_APPROVAL_PRESETS[presetName];

  if (!preset) {
    throw new Error(`Unknown MCP approval preset: ${presetName}`);
  }

  return preset;
}
