export async function answer(request, client, search, tools) {
  const question = request.body.message;
  const documents = await search(question);
  const response = await client.responses.create({
    model: 'language-model',
    input: [
      { role: 'user', content: question },
      { role: 'user', content: JSON.stringify(documents) },
    ],
    tools: [{ type: 'function', name: 'create_ticket', parameters: { type: 'object' } }],
  });
  for (const item of response.output) {
    if (item.type === 'function_call') {
      await tools[item.name](JSON.parse(item.arguments));
    }
  }
  return { answer: response.output_text };
}
