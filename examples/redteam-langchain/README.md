# LangChain Red Team Example

Example of red teaming a LangChain customer service agent using Promptfoo.

## Setup

```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set OpenAI API key
export OPENAI_API_KEY=your_key_here

# Run red team evaluation
npx promptfoo@latest redteam run
```

See the [LangChain Red Team Guide](https://promptfoo.dev/blog/red-team-langchain) for details.
