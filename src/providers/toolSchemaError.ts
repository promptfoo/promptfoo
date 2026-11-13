/** Tool definitions that cannot be loaded or compiled: a configuration error, not a validation verdict. */
export class InvalidToolSchemaError extends Error {
  override name = 'InvalidToolSchemaError';
}
