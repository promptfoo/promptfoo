const { ChatOpenAI } = require('@langchain/openai');

const llm = new ChatOpenAI({ modelName: 'gpt-4.1-mini' });

module.exports = llm;
