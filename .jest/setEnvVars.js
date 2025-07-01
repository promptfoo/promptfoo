export const TEST_CONFIG_DIR = './.local/jest/config';

process.env.ANTHROPIC_API_KEY = 'foo';
process.env.AZURE_OPENAI_API_HOST = 'azure.openai.host';
process.env.AZURE_OPENAI_API_KEY = 'foo';
process.env.HF_API_TOKEN = 'foo';
process.env.IS_TESTING = 'true';
process.env.OPENAI_API_KEY = 'foo';
process.env.PROMPTFOO_CONFIG_DIR = TEST_CONFIG_DIR;

delete process.env.PROMPTFOO_REMOTE_GENERATION_URL;
