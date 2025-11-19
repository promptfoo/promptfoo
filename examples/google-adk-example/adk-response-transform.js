/**
 * ADK Response Transform Function
 * Extracts the final assistant message from ADK's event-based response format.
 */
function transformAdkResponse(json) {
  if (!Array.isArray(json)) {
    return 'Error: Expected array response';
  }

  // Find the last model response with text
  const modelEvents = json.filter(
    (event) => event?.content?.role === 'model' && event?.content?.parts?.[0]?.text,
  );

  if (modelEvents.length > 0) {
    return modelEvents[modelEvents.length - 1].content.parts[0].text.trim();
  }

  return 'Error: No model response found';
}

module.exports = transformAdkResponse;
