---
sidebar_position: 0
sidebar_label: Testing LLM chains
slug: /configuration/testing-llm-chains
---

# Testing LLM chains

Prompt chaining is a common pattern used to perform more complex reasoning with LLMs. It's used by libraries like [LangChain](https://langchain.readthedocs.io/), and OpenAI has released built-in support via [OpenAI functions](https://openai.com/blog/function-calling-and-other-api-updates).

A "chain" is defined by a list of LLM prompts that are executed sequentially (and sometimes conditionally). The output of each LLM call is parsed/manipulated/executed, and then the result is fed into the next prompt.

This page explains how to test an LLM chain. At a high level, you have these options:

- Break the chain into separate calls, and test those. This is useful if your testing strategy is closer to unit tests, rather than end to end tests.

- Test the full end-to-end chain, with a single input and single output. This is useful if you only care about the end result, and are not interested in how the LLM chain got there.

## Unit testing LLM chains

As mentioned above, the easiest way to test is one prompt at a time. This can be done pretty easily with a basic promptfoo [configuration](/docs/configuration/guide).

Run `npx promptfoo@latest init chain_step_X` to create the test harness for the first step of your chain. After configuring test cases for that step, create a new set of test cases for step 2 and so on.

## End-to-end testing for LLM chains

### Using a script provider

To test your chained LLMs, provide a script that takes a prompt input and outputs the result of the chain. This approach is language-agnostic.

In this example, we'll test LangChain's LLM Math plugin by creating a script that takes a prompt and produces an output:

```python
# langchain_example.py

import sys
import os

from langchain import OpenAI
from langchain.chains import LLMMathChain

llm = OpenAI(
    temperature=0,
    openai_api_key=os.getenv('OPENAI_API_KEY')
)

llm_math = LLMMathChain(llm=llm, verbose=True)

prompt = sys.argv[1]
llm_math.run(prompt)
```

This script is set up so that we can run it like this:

```sh
python langchain_example.py "What is 2+2?"
```

Now, let's configure promptfoo to run this LangChain script with a bunch of test cases:

```yaml
prompts: prompt.txt
providers:
  - openai:chat:gpt-4o
  - exec:python langchain_example.py
tests:
  - vars:
      question: What is the cube root of 389017?
  - vars:
      question: If you have 101101 in binary, what number does it represent in base 10?
  - vars:
      question: What is the natural logarithm (ln) of 89234?
  - vars:
      question: If a geometric series has a first term of 3125 and a common ratio of 0.008, what is the sum of the first 20 terms?
  - vars:
      question: A number in base 7 is 3526. What is this number in base 10?
  - vars:
      question: If a complex number is represented as 3 + 4i, what is its magnitude?
  - vars:
      question: What is the fourth root of 1296?
```

For an in-depth look at configuration, see the [guide](/docs/configuration/guide). Note the following:

- **prompts**: `prompt.txt` is just a file that contains `{{question}}`, since we're passing the question directly through to the provider.
- **providers**: We list GPT-4 in order to compare its outputs with LangChain's LLMMathChain. We also use the `exec` directive to make promptfoo run the Python script in its eval.

In this example, the end result is a side-by-side comparison of GPT-4 vs. LangChain math performance:

![langchain eval](/img/docs/langchain-eval.png)

View the [full example on Github](https://github.com/promptfoo/promptfoo/tree/main/examples/langchain-python).

### Using a custom provider

For finer-grained control, use a [custom provider](/docs/providers/custom-api).

A custom provider is a short Javascript file that defines a `callApi` function. This function can invoke your chain. Even if your chain is not implemented in Javascript, you can write a custom provider that shells out to Python.

In the example below, we set up a custom provider that runs a Python script with a prompt as the argument. The output of the Python script is the final result of the chain.

```js title=chainProvider.js
const { spawn } = require('child_process');

class ChainProvider {
  id() {
    return 'my-python-chain';
  }

  async callApi(prompt, context) {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', ['./path_to_your_python_chain.py', prompt]);

      let output = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        reject(data.toString());
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(`python script exited with code ${code}`);
        } else {
          resolve({
            output,
          });
        }
      });
    });
  }
}

module.exports = ChainProvider;
```

Note that you can always write the logic directly in Javascript if you're comfortable with the language.

Now, we can set up a promptfoo config pointing to `chainProvider.js`:

```yaml
prompts:
  - file://prompt1.txt
  - file://prompt2.txt
// highlight-start
providers:
  - './chainProvider.js'
// highlight-end
tests:
  - vars:
      language: French
      input: Hello world
  - vars:
      language: German
      input: How's it going?
```

promptfoo will pass the full constructed prompts to `chainProvider.js` and the Python script, with variables substituted. In this case, the script will be called _# prompts_ \* _# test cases_ = 2 \* 2 = 4 times.

Using this approach, you can test your LLM chain end-to-end, view results in the [web view](/docs/usage/web-ui), set up [continuous testing](/docs/integrations/github-action), and so on.

## Retrieval-augmented generation (RAG)

For more detail on testing RAG pipelines, see [RAG evaluations](/docs/guides/evaluate-rag).

## Other tips

To reference the outputs of previous test cases, use the built-in [`_conversation` variable](/docs/configuration/chat#using-the-conversation-variable).
