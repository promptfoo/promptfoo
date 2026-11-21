# provider-pi/working-dir (Pi Working Directory)

Include the bundled `sample.txt` in the prompt while using this directory as the working directory. All Pi tools stay disabled.

## Usage

Use Linux or macOS. Install the Pi CLI in a trusted location outside the project.

```sh
npm install --global --ignore-scripts @earendil-works/pi-coding-agent@0.99.1
pi --list-models
```

Set `OPENAI_API_KEY` in the shell that runs Promptfoo. From this example directory, run the eval.

```sh
npx promptfoo@latest eval
```

See the [Pi provider documentation](https://www.promptfoo.dev/docs/providers/pi/) for configuration and security requirements.
