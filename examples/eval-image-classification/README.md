# eval-image-classification (Image Classification Example with Promptfoo)

You can run this example with:

```bash
npx promptfoo@latest init --example eval-image-classification
cd eval-image-classification
```

Classify Fashion MNIST images with two OpenAI vision models and a JSON response schema. The evaluation checks the response format and compares each predicted class with its dataset label.

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

   The generator downloads the official Fashion MNIST training data and writes 100 grayscale JPEGs with their class labels. It samples without replacement using a fixed seed, then sorts by label and original index. Regenerated rows differ from the older NumPy-based sampler.

   Use `--num_samples 10 --filename sample.csv` to choose a sample size and output file. To reuse downloaded data offline, pass `--data-dir /path/to/fashion-mnist` containing `train-images-idx3-ubyte.gz` and `train-labels-idx1-ubyte.gz`. The output columns remain `index`, `label`, and `image_base64`.

   Run the offline generator checks with `python -m unittest discover -p '*_test.py'`.

5. Experiment with the configuration:
   - Modify the JSON schema in `promptfooconfig.yaml` to add or adjust required fields
   - Try different models such as llama3.2 or Claude Sonnet 5 by changing the provider in the config
   - Adjust the system prompt to improve classification accuracy
   - Add additional assertions to validate model outputs
