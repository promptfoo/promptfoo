# eval-image-classification (Image Classification Example with Promptfoo)

You can run this example with:

```bash
npx promptfoo@latest init --example eval-image-classification
cd eval-image-classification
```

This example demonstrates how to use Promptfoo for image classification tasks using the Fashion MNIST dataset. The example uses GPT-4o and GPT-4.1-mini with a structured json schema to analyze images, including classification, color analysis, and additional attributes.

## Getting Started

1. Set up your OpenAI API key:

   ```sh
   export OPENAI_API_KEY='your-api-key'
   ```

2. Run the evaluation:

   ```sh
   npx promptfoo@latest eval --no-cache
   ```

3. View the results:

   ```sh
   npx promptfoo@latest view
   ```

4. Optionally, regenerate the dataset using Python 3.10 or newer. The included CSV is ready to evaluate without Python.

   ```sh
   python3 -m venv venv
   source venv/bin/activate
   python -m pip install -r requirements.txt
   python dataset_gen.py
   ```

   The generator downloads the official Fashion MNIST training images and labels and writes 100 sampled grayscale JPEGs with their class labels. It uses Pillow and Python's standard library; no machine-learning framework is needed. Samples are drawn without replacement with a fixed seed, then sorted by label and original index. The sampler differs from the old NumPy-based generator, so regenerated rows will differ from older versions.

   Use `--num_samples 10 --filename sample.csv` to choose a sample size and output file. To reuse downloaded data offline, pass `--data-dir /path/to/fashion-mnist` containing `train-images-idx3-ubyte.gz` and `train-labels-idx1-ubyte.gz`. The output columns remain `index`, `label`, and `image_base64`.

   Run the offline generator checks with `python -m unittest discover -p '*_test.py'`.

5. Experiment with the configuration:
   - Modify the JSON schema in `promptfooconfig.yaml` to add or adjust required fields
   - Try different models such as llama3.2 or Claude Sonnet 5 by changing the provider in the config
   - Adjust the system prompt to improve classification accuracy
   - Add additional assertions to validate model outputs
