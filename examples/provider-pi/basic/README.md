# provider-pi/basic (Pi Chat-Only Eval)

Generate Python code in a temporary workspace. All Pi tools stay disabled.

## Usage

Use Linux or macOS. Install the Pi CLI in a trusted location outside the project.

```sh
npm install --global --ignore-scripts @earendil-works/pi-coding-agent@0.99.1
pi --list-models
```

Set `OPENAI_API_KEY` in the shell that runs Promptfoo. Use a Promptfoo release that includes the Pi provider. To start from a fresh directory, run these commands.

```sh
npx promptfoo@latest init --example provider-pi/basic
cd provider-pi/basic
npx promptfoo@latest eval
```

See the [Pi provider documentation](https://www.promptfoo.dev/docs/providers/pi/) for configuration and security requirements.
