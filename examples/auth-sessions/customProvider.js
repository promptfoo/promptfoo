/**
 * Custom Provider Example with Session Management
 *
 * This provider demonstrates how to:
 * 1. Access session metadata set by hooks
 * 2. Include session ID in HTTP headers
 * 3. Make authenticated requests to a session-aware API
 */

class CustomJavascriptProvider {
  constructor(options) {
    this.config = options.config || {};
    this.id = () => 'javascript-provider';
  }

  async callApi(prompt, context) {
    // Access the session ID from metadata (set by beforeAll hook)
    const sessionId = context?.metadata?.sessionId;
    const serverUrl = context?.metadata?.serverUrl || 'http://localhost:8000';

    if (!sessionId) {
      return {
        error: 'No session ID found in metadata. Make sure the beforeAll hook is running.',
      };
    }

    console.log(`📤 Making request with session: ${sessionId}`);

    // Example: Make a request with session ID in headers
    // In a real scenario, this would be your API endpoint
    try {
      // For this demo, we'll simulate an API call that uses the session
      // In practice, you would call your actual API here with the session ID
      const response = await fetch(`${serverUrl}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        return {
          error: `Session request failed: ${response.statusText}`,
        };
      }

      const { output } = await response.json();
      return { output };
    } catch (error) {
      return {
        error: `Failed to call API: ${error.message}`,
      };
    }
  }
}

module.exports = CustomJavascriptProvider;
