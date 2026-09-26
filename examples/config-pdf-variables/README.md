# config-pdf-variables (PDF Variables)

You can run this example with:

```bash
npx promptfoo@latest init --example config-pdf-variables
cd config-pdf-variables
```

## Usage

Install Promptfoo and the PDF parser together in this example directory:

```bash
npm install promptfoo pdf-parse
```

Then download some PDFs from arxiv.org:

```bash
./fetch_pdfs.sh
```

This example is pre-configured in `promptfooconfig.yaml`. That means you can just run:

```bash
npx promptfoo eval
```
