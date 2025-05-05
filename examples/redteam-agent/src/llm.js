const { ChatOpenAI } = require('@langchain/openai');

const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini' });

module.exports = llm;
