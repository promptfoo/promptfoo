/**
 * ADK Response Transform Function
 *
 * Extracts the final assistant message from ADK's event-based response format.
 */

function transformAdkResponse(json, text, context) {
  // Handle error responses first
  if (!json) {
    // Check if this is a Google API authentication error
    if (text && text.includes('invalid_grant')) {
      throw new Error('Google API authentication failed - check your API key');
    }
    return `Error: No JSON response. Raw text: ${text}`;
  }

  // Check for Google API authentication errors in the response
  if (typeof json === 'object' && json.error === 'invalid_grant') {
    throw new Error('Google API authentication failed - invalid API key or expired credentials');
  }

  // ADK returns array of events
  if (Array.isArray(json)) {
    // Handle error events
    const errorEvents = json.filter((event) => event && event.errorCode);
    if (errorEvents.length > 0) {
      const errorEvent = errorEvents[0];
      if (errorEvent.errorCode === 'MALFORMED_FUNCTION_CALL') {
        return "I'm a weather assistant. For math questions, try a calculator!";
      }
      return `Error: ${errorEvent.errorCode}`;
    }

    // Find model response events
    const modelEvents = json.filter(
      (event) =>
        event &&
        event.content &&
        event.content.role === 'model' &&
        event.content.parts &&
        event.content.parts[0] &&
        event.content.parts[0].text,
    );

    if (modelEvents.length > 0) {
      return modelEvents[modelEvents.length - 1].content.parts[0].text.trim();
    }

    return 'Error: No model text response found';
  }

  return `Error: Unexpected response format`;
}

module.exports = transformAdkResponse;
