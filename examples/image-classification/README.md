# Image Classification Example with PromptFoo

This example demonstrates how to use PromptFoo for image classification tasks using the Fashion MNIST dataset. It showcases prompt engineering, configuration, and evaluation of AI models for image analysis. We use a prompt designed to output XML and compare class labels from the dataset with the model's output. Additional attributes in the XML illustrate how to extract more information using multi-modal models. This example is set up to use Anthropic, but you can easily switch to GPT-4 or other models by modifying the provider in the config file. You may need to adjust the prompt to match your model's output format and experiment with different prompts to see how they affect performance.

## Getting Started

1. Generate the dataset:

   ```sh
   python dataset_gen.py
   ```

   Note: You may need to install dependencies with:

   ```sh
   pip install -r requirements.txt
   ```

   This script creates a CSV file with 100 random images from the Fashion MNIST dataset and their labels. A CSV with 10 sample images is included so you can skip this step if preferred.

2. Run the evaluation:

   ```sh
   npx promptfoo@latest eval
   ```

3. View the results:

   ```sh
   npx promptfoo@latest view
   ```

4. Modify the prompt to see how it affects the model's performance. For example, try:
    - adding `Begin with <analysis>` to the end of the prompt to make the `is-xml` assertion pass.
    - changing the prompt to output JSON instead of XML.
    - Modifying the prompt to include the classification within the xml `<classification>[T-shirt/top, Trouser, Pullover, Dress, Coat, Sandal, Shirt, Sneaker, Bag, Ankle boot]</classification>`.
