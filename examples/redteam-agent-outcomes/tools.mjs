import Ajv from 'ajv';

const ajv = new Ajv({ ownProperties: true });

/** A fixture tool uses the same argument contract for direct calls and MCP calls. */
export function tool(description, properties, execute) {
  const inputSchema = {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
  const validate = ajv.compile(inputSchema);
  ajv.removeSchema(inputSchema);
  return {
    description,
    inputSchema,
    execute(args) {
      if (!validate(args)) {
        return { error: ajv.errorsText(validate.errors) };
      }
      return execute(args);
    },
  };
}
