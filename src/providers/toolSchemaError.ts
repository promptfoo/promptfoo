/** A tool schema that cannot be compiled: a configuration error, not a validation verdict. */
export class InvalidToolSchemaError extends Error {
  override name = 'InvalidToolSchemaError';
}
