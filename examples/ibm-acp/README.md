# acp-booksmith-example

This example demonstrates how to use ACP (Agent Communication Protocol) with Promptfoo providers to build a multi-agent book-writing system. It implements Python agents that collaborate to outline, draft, edit, and compile a book — making real OpenAI API calls — and offers multiple ways to interact: through the terminal, Gradio app, or automated Promptfoo evaluation.

You can run this example with:

```bash
npx promptfoo@latest init --example ibm-acp
```

## What is ACP?

ACP (Agent Communication Protocol) refers to the open standard developed by IBM to enable communication and collaboration between AI agents, applications, and humans — regardless of framework, programming language, or runtime.  
It provides a standardized interface for agents to interact, making it easier to design, integrate, and scale complex multi-agent systems.

## Features

- **Multi-Agent Book Writing**  
  Agents handle outlining (`agent.py`), drafting chapters, editing (`orchestrator.py`), and compiling the final book (`final_book.txt`, `final_book.pdf`).
- **Real OpenAI API Integration**  
  Agents make actual OpenAI API calls (e.g., using GPT-4o or similar models) to generate and refine book content.
- **Promptfoo Evaluation**  
  Automate testing and evaluation using Promptfoo (`promptfooconfig.yaml`, `provider.py`) to benchmark outputs and track improvements.
- **Interactive Gradio Interface**  
  Launch a user-friendly Gradio app (`gradio app.py`) to interact with the system via the browser.
- **Terminal + Script-Based Control**  
  Run and control all components directly via terminal scripts (`main.py`, `uvicorn agent:app`), with logs and debugging support.
- **Error Handling & Logging**  
  Includes robust exception handling and error logging (`promptfoo-errors.log`) for troubleshooting and monitoring.

## Prerequisites

**Check your environment**

```bash
python --version  # e.g., >= 3.11
node --version    # e.g., >= 20.x
npm --version     # e.g., >= 10.x
```

**Set your OpenAI API key**

```bash
export OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxx"
```

**Install Python dependencies**

```bash
pip install -r requirements.txt
```

## Step-by-step setup

**Initialize your project**

```bash
uv init --python '>=3.11' my_acp_project
cd my_acp_project
```

**Add the ACP SDK**

```bash
uv add acp-sdk
```

## Create an agent

**Create agent.py:**

```python
import asyncio
from collections.abc import AsyncGenerator
from acp_sdk.models import Message
from acp_sdk.server import Context, RunYield, RunYieldResume, Server

server = Server()

@server.agent()
async def echo(input: list[Message], context: Context) -> AsyncGenerator[RunYield, RunYieldResume]:
    """Echoes everything"""
    for message in input:
        await asyncio.sleep(0.5)
        yield {"thought": "I should echo everything"}
        await asyncio.sleep(0.5)
        yield message

server.run()
```

**Start the ACP server**

```bash
uv run agent.py
```

**Server runs at:**

```arduino
http://localhost:8000
```

**Verify your agent**

```bash
curl http://localhost:8000/agents
```

**You should see:**

```json
{
  "agents": [{ "name": "echo", "description": "Echoes everything", "metadata": {} }]
}
```

**Run the agent via HTTP**

```bash
curl -X POST http://localhost:8000/runs \
  -H "Content-Type: application/json" \
  -d '{
        "agent_name": "echo",
        "input": [
          {
            "role": "user",
            "parts": [
              { "content": "Howdy!", "content_type": "text/plain" }
            ]
          }
        ]
      }'
```

**You should see the echoed response.**

## Expand to multi-agent system

- Write `agent.py` → outline agent
- Write `orchestrator.py` → coordinates agents
- Write `main.py` → runs full system

`agent.py`
Defines all ACP agents:

- outline → makes book outline.
- chapter → writes full chapters.
- editor → edits chapters.
- compiler → stitches chapters together.
- Runs an ACP server `(server.run())`, listens at `http://localhost:8000`

`orchestrator.py`
Coordinates multi-agent workflow:

- Sends title to outline agent.
- Sends outline + chapter prompt to chapter agent.
- Sends raw chapter to editor agent.
- Compiles final book (txt + pdf).
- Uses `acp_sdk.client.Client()` to call agents programmatically.

`main.py`
Provides single entry point:

- CLI to run orchestrator.
- Could extend later to launch Gradio or other tools.

## Add Gradio interface

**Create gradio app.py to interact via browser.**

```bash
python gradio app.py
```

**Open:**

```arduino
http://localhost:7860
```

## Setup Promptfoo for evaluation

```bash
npm install -g promptfoo
promptfoo init
```

## Write Promptfoo configuration

- `promptfooconfig.yaml` → defines test prompts + providers
- `provider.py` → links to ACP endpoints

- `promptfooconfig.yaml`
  Defines test prompts, providers, and assertions for Promptfoo.
- `provider.py`
  Sends HTTP requests to local ACP agents, extracts clean text outputs, and returns them to Promptfoo.

## Run Evaluation

```bash
promptfoo eval
```

This will:

- Run multi-agent test cases
- Make real OpenAI API calls
- Export detailed traces with token + timing metrics

Explore results in browser:

```bash
promptfoo view
```

## How It Works

**Outline Agent**

- Generates book outline from title
  **Chapter Agent**
- Writes ~3000-word chapters
  **Editor Agent**
- Polishes chapters for style + coherence
  **Compiler Agent**
- Joins everything into .txt and .pdf

## Example Output

```bash
Title: The Quantum Cat's Journey

Outline:
- Introduction: Quantum Enigma
- Chapter 1: Schrödinger's Paradox
- Chapter 2: Parallel Realities
- Chapter 3: The Quantum Mind

Final book exported as:
- final_book.txt
- final_book.pdf
```

## Cost Considerations

- Real OpenAI API calls per test case
- Default: gpt-4o (cost-effective, but check usage dashboard)

---
