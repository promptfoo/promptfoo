/**
 * Socket.IO Connection Management
 *
 * Re-exports createAgentClient for backwards compatibility.
 * New code should import from '../../util/agent/agentClient' directly.
 */

export {
  type AgentClient,
  type CreateAgentClientOptions,
  createAgentClient,
} from '../../util/agent/agentClient';
