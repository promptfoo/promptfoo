import { zodToJsonSchema } from 'zod-to-json-schema';
import { UnifiedConfigSchema } from '../src/types';

const jsonSchema = zodToJsonSchema(UnifiedConfigSchema, 'PromptfooConfigSchema');

console.log(JSON.stringify(jsonSchema, null, 2));
