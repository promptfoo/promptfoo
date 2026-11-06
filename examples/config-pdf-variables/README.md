# config-pdf-variables (PDF Variables)

You can run this example with:

```bash
npx promptfoo@latest init --example config-pdf-variables
cd config-pdf-variables
```

## Usage

Install Promptfoo and the PDF parser together in this example directory:

```bash
npm install promptfoo pdf-parse@^2.4.5
```

Then download some PDFs from arxiv.org:

```bash
./fetch_pdfs.sh
```

Run the eval with the included `promptfooconfig.yaml`:

```bash
npx promptfoo eval
```
