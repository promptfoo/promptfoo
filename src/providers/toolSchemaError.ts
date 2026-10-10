/** Tool definitions that cannot be loaded or compiled: a configuration error, not a validation verdict. */
export class InvalidToolSchemaError extends Error {
  override name = 'InvalidToolSchemaError';
}

/** A model call could be checked and did not satisfy the configured tool contract. */
export class InvalidToolCallError extends Error {
  override name = 'InvalidToolCallError';
}
