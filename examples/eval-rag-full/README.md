# eval-rag-full (Rag Full)

You can run this example with:

```bash
npx promptfoo@latest init --example eval-rag-full
cd eval-rag-full
```

## Usage

This RAG example allows you to ask questions over a number of public company SEC filings. It uses LangChain, but the flow is representative of any RAG solution.

There are 3 parts:

1. `ingest.py`: Chunks and loads PDFs into a vector database (PDFs are pulled from a public Google Cloud bucket)

1. `retrieve.py`: Promptfoo-compatible provider that answers RAG questions using the database.

1. `promptfooconfig.yaml`: Test inputs and requirements.

To get started:

1. Set the OPENAI_API_KEY environment variable.

1. Create a python virtual environment: `python3 -m venv venv`

1. Enter the environment: `source venv/bin/activate`

1. Install python dependencies: `pip install -r requirements.txt`

1. Run `ingest.py` to create the vector database: `python ingest.py`

Now we're ready to go.

- Edit `promptfooconfig.yaml` to your liking to configure the questions you'd like to ask in your tests. Then run:
- Edit `retrieve.py` to control how context is loaded and questions are answered.

```bash
npx promptfoo@latest eval
```

Promptfoo is a Node.js CLI, but the `file://retrieve.py` provider runs inside Python. Keep the virtual environment active when running the eval, or set `PROMPTFOO_PYTHON=./venv/bin/python` so Promptfoo can import the packages from `requirements.txt`.

Afterwards, you can view the results by running `npx promptfoo@latest view`

See `promptfooconfig.with-asserts.yaml` for a more complete example that compares the performance of two RAG configurations. The smaller retrieval configuration is intentionally expected to miss a couple of details so the comparison view demonstrates failures as well as passes.
