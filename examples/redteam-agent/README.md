# redteam-agent (Redteam: Agent)

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-agent
```

This example demonstrates redteaming a travel agent agent implemented using LangGraph.

## Getting Started

1. Install the required packages

   ```sh
   npm run i
   ```

2. Set up environment variables:
   Create a `.env` file with your OpenAI API key:

   ```
   OPENAI_API_KEY=your_api_key_here
   ```

3. Run the agent:

   ```sh
   npm run server
   ```

4. Run the redteam:

   ```sh
   promptfoo redteam run --config examples/redteam-agent/promptfooconfig.yaml
   ```
