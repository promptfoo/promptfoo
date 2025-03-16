# OpenLLM

To use [OpenLLM](https://github.com/bentoml/OpenLLM) with promptfoo, we take advantage of OpenLLM's support for [OpenAI-compatible endpoint](https://colab.research.google.com/github/bentoml/OpenLLM/blob/main/examples/openllm-llama2-demo/openllm_llama2_demo.ipynb#scrollTo=0G5clTYV_M8J&line=3&uniqifier=1).

1. Start the server using the `openllm start` command.

2. Set environment variables:

   - Set `OPENAI_BASE_URL` to `http://localhost:8001/v1`
   - Set `OPENAI_API_KEY` to a dummy value `foo`.

3. Depending on your use case, use the `chat` or `completion` model types.

   **Chat format example**:
   To run a Llama2 eval using chat-formatted prompts, first start the model:

   ```sh
   openllm start llama --model-id meta-llama/Llama-2-7b-chat-hf
   ```

   Then set the promptfoo configuration:

   ```yaml
   providers:
     - openai:chat:llama2
   ```

   **Completion format example**:
   To run a Flan eval using completion-formatted prompts, first start the model:

   ```sh
   openllm start flan-t5 --model-id google/flan-t5-large
   ```

   Then set the promptfoo configuration:

   ```yaml
   providers:
     - openai:completion:flan-t5
   ```

4. See [OpenAI provider documentation](/docs/providers/openai) for more details.
