This example demonstrates how to use PromptFoo to classify images. It uses the `prompt.js` file to format the prompt and the `promptfooconfig.yaml` file to configure the test and provider.

We are using fashion mnist to classify the image and extract a few other useful attributes. We are asking the model to product XML but you could just as easily product JSON or any other format.

To get started, try generating a dataset with `python dataset_gen.py`. This will create a CSV file with 100 random images from the fashion mnist dataset and their labels.

Then run `npx promptfoo@latest eval`

followed by promptfoo view to view the results.

Pay special attention to the assertions defined in promptfooconfig.yaml

We are using anthropic but you could very easily use gpt4o or any other model by changing the provider in the config file.
