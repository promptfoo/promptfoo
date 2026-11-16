/** A changed MCP tool contract invalidates the evaluation, not just one tool result. */
export class MCPToolContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MCPToolContractError';
  }
}
