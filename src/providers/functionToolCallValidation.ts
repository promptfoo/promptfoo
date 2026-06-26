export class FunctionToolCallValidationSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FunctionToolCallValidationSetupError';
  }
}
