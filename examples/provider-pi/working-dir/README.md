# Pi working directory

Asks Pi to read the included `sample.py` with its default read-only tools.

Download this example:

```bash
npx promptfoo@latest init --example provider-pi/working-dir
```

From the downloaded directory, install the Pi CLI and set `OPENAI_API_KEY` in your environment (or configure the matching providers with Pi's `/login` command):

```bash
npm install --ignore-scripts @earendil-works/pi-coding-agent
```

Run the eval from the downloaded directory:

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache -o output.json
```

Use `npx pi --list-models` to check model availability and edit the provider IDs if needed. See the [Pi provider guide](https://www.promptfoo.dev/docs/providers/pi/) for authentication and configuration options.
