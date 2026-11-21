// Vertex's managed Llama 4 MaaS endpoints are currently available in us-east5.
const VERTEX_LLAMA_4_MODELS = new Set([
  'meta/llama-4-maverick-17b-128e-instruct-maas',
  'meta/llama-4-scout-17b-16e-instruct-maas',
]);

export function getVertexLlamaWireId(modelName: string): string {
  return modelName.startsWith('meta/') ? modelName : `meta/${modelName}`;
}

export function isVertexLlama4Model(modelName: string): boolean {
  return VERTEX_LLAMA_4_MODELS.has(getVertexLlamaWireId(modelName));
}
