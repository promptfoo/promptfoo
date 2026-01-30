/**
 * Socket.IO Connection Management
 *
 * Re-exports createAgentClient for backwards compatibility.
 * New code should import from '../../util/agent/agentClient' directly.
 */

export { createAgentClient, type AgentClient, type CreateAgentClientOptions } from '../../util/agent/agentClient';
