This example shows how to use an external Google Sheet to run tests. To get
started, set your OPENAI_API_KEY environment variable.

Next, duplicate the Google Sheet in promptfooconfig.yaml and replace the URL.

Then run:

```bash
npx promptfoo@latest init --example google-sheets
# or simply
promptfoo eval
```

Afterwards, you can view the results by running `promptfoo view`
