export async function generate(request) {
  const response = await fetch(process.env.AI_GATEWAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'model-inference', ...request }),
  });
  if (!response.ok) {
    throw new Error('Inference failed');
  }
  return response.json();
}
