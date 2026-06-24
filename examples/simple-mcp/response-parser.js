export default function parseMcpResponse(result, content) {
  return result.structuredContent?.summary ?? content;
}
