# openai-moderation (OpenAI Moderation Dataset)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-moderation
```

This example uses the dataset from OpenAI's paper _A Holistic Approach to Undesired Content Detection_.
Each test case contains a prompt labeled with categories such as sexual content, hate, violence, harassment and more.

Set up any API key environment variables required by your provider (e.g. `OPENAI_API_KEY`).

Then run:

```bash
promptfoo eval
```

## Dataset Information

Evaluation dataset for the paper "A Holistic Approach to Undesired Content Detection".
The dataset file `data/samples-1680.jsonl.gz` contains 1680 prompts labeled across categories:

| Category         | Label | Definition                                                                   |
| ---------------- | ----- | ---------------------------------------------------------------------------- |
| sexual           | S     | Content meant to arouse sexual excitement, or that promotes sexual services. |
| hate             | H     | Content that expresses, incites, or promotes hate.                           |
| violence         | V     | Content that promotes or glorifies violence or celebrates suffering.         |
| harassment       | HR    | Content that may be used to torment or annoy individuals.                    |
| self-harm        | SH    | Content that promotes or depicts acts of self-harm.                          |
| sexual/minors    | S3    | Sexual content that includes an individual under 18 years old.               |
| hate/threatening | H2    | Hateful content that includes violence or serious harm.                      |
| violence/graphic | V2    | Violent content that depicts extreme graphic detail.                         |

Source: <https://github.com/openai/moderation-api-release>
