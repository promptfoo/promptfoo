# redteam-langchain (LangChain Red Team Example)

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-langchain
cd redteam-langchain
```

Example of red teaming a LangChain customer service agent using Promptfoo.

## Setup

Use Python 3.10 or newer.

```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate

# Install dependencies
python -m pip install -r requirements.txt

# Set OpenAI API key
export OPENAI_API_KEY=your_key_here

# Run red team evaluation
npx promptfoo@latest redteam run
```

See the [LangChain Red Team Guide](https://promptfoo.dev/blog/red-team-langchain) for details.

Keep the virtual environment active so Promptfoo uses its Python packages, or set `PROMPTFOO_PYTHON` to the absolute path of `venv/bin/python`. The provider reports token counts returned by the API and omits them when the API supplies no usage.

Run the offline provider checks with `python -m unittest discover -p '*_test.py'`.
