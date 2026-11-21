# redteam-langchain (LangChain Red Team Example)

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-langchain
cd redteam-langchain
```

Example of red teaming a LangChain customer service agent using Promptfoo.

## Setup

Use Python 3.10 or newer.

On macOS or Linux:

```bash
python3 -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt
export OPENAI_API_KEY=your_key_here
npx promptfoo@latest redteam run
```

On Windows PowerShell:

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
$env:PROMPTFOO_PYTHON = (Resolve-Path .\venv\Scripts\python.exe).Path
$env:OPENAI_API_KEY = "your_key_here"
npx.cmd promptfoo@latest redteam run
```

See the [LangChain Red Team Guide](https://promptfoo.dev/blog/red-team-langchain) for details.

On macOS or Linux, keep the virtual environment active or set `PROMPTFOO_PYTHON` to the absolute path of `venv/bin/python`. The PowerShell setup sets the Windows executable path explicitly. The provider reports token counts returned by the API, including the reasoning breakdown when supplied, and omits usage when the API supplies none.

Run the offline provider checks with `python -m unittest discover -p '*_test.py'` in the active environment, or `.\venv\Scripts\python.exe -m unittest discover -p '*_test.py'` on Windows.
