const { ChatOpenAI } = require('@langchain/openai');
const { createSqlQueryChain } = require('langchain/chains/sql_db');
const { SqlDatabase } = require('langchain/sql_db');
const { DataSource } = require('typeorm');
const { QuerySqlTool } = require('langchain/tools/sql');
const { PromptTemplate } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { RunnablePassthrough, RunnableSequence } = require('@langchain/core/runnables');
const datasource = new DataSource({
  type: 'sqlite',
  database: './Chinook.db',
});

async function initializeDB() {
  const db = await SqlDatabase.fromDataSourceParams({
    appDataSource: datasource,
  });

  const llm = new ChatOpenAI({ model: 'gpt-4', temperature: 0 });
  const executeQuery = new QuerySqlTool(db);
  const writeQuery = await createSqlQueryChain({
    llm,
    db,
    dialect: 'sqlite',
  });

  const answerPrompt =
    PromptTemplate.fromTemplate(`Given the following user question, corresponding SQL query, and SQL result, answer the user question.

Question: {question}
SQL Query: {query}
SQL Result: {result}
Answer: `);

  const answerChain = answerPrompt.pipe(llm).pipe(new StringOutputParser());

  const chain = RunnableSequence.from([
    RunnablePassthrough.assign({ query: writeQuery }).assign({
      result: (i) => executeQuery.invoke(i.query),
    }),
    answerChain,
  ]);

  return chain;
}

let chainInstance;
module.exports = {
  query: async function (question) {
    if (!chainInstance) {
      chainInstance = await initializeDB();
    }
    return await chainInstance.invoke({ question });
  },
};
