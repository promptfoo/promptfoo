import { zodToJsonSchema } from 'zod-to-json-schema';
import { UnifiedConfigSchema } from '../src/types';

// Type assertion needed for Zod v4 compatibility with zod-to-json-schema
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsonSchema = zodToJsonSchema(UnifiedConfigSchema as any, 'PromptfooConfigSchema');

console.log(JSON.stringify(jsonSchema, null, 2));
