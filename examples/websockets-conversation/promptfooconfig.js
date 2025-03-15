module.exports = {
  providers: [
    {
      id: 'websocket-chat',
      type: 'websocket',
      url: 'ws://localhost:4000',
      // This provider will maintain WebSocket connection state between prompts
      maintainConnectionBetweenCalls: true,
      transformResponse: (response) => {
        const parsed = JSON.parse(response);
        return parsed.output || parsed.error || JSON.stringify(parsed);
      },
    },
  ],
  defaultProvider: 'websocket-chat',
};
