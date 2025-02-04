# Image Classification Example with Promptfoo

This example demonstrates how to use Promptfoo for image classification tasks using the Fashion MNIST dataset. The example uses GPT-4o and GPT-4o-mini with a structured json schema to analyze images, including classification, color analysis, and additional attributes.

## Getting Started

1. Set up your OpenAI API key:

   ```sh
   export OPENAI_API_KEY='your-api-key'
   ```

2. Run the evaluation:

   ```sh
   npx promptfoo@latest eval
   ```

3. View the results:

   ```sh
   npx promptfoo@latest view
   ```

4. Optionally, re-generate or update the dataset:

   ```sh
   python dataset_gen.py
   ```

   Note: You may need to install dependencies with:

   ```sh
   pip install -r requirements.txt
   ```

   This script creates a CSV file with 100 random images from the Fashion MNIST dataset and their labels. A CSV with 10 sample images is included so you can skip this step if preferred.

5. Experiment with the configuration:
   - Modify the JSON schema in `promptfooconfig.yaml` to add or adjust required fields
   - Try different models such as llama3.2 or Claude 3.5 by changing the provider in the config
   - Adjust the system prompt to improve classification accuracy
   - Add additional assertions to validate model outputs
