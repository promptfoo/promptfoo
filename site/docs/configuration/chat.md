---
sidebar_label: Chat threads
sidebar_position: 10
---

# Chat conversations / threads

The [prompt file](/docs/configuration/parameters#prompts-from-file) supports a message in OpenAI's JSON prompt format. This allows you to set multiple messages including the system prompt. For example:

```json
[
  { "role": "system", "content": "You are a helpful assistant." },
  { "role": "user", "content": "Who won the world series in {{ year }}?" }
]
```

Equivalent yaml is also supported:

```yaml
- role: system
  content: You are a helpful assistant.
- role: user
  content: Who won the world series in {{ year }}?
```

## Multishot conversations

Most providers support full "multishot" chat conversations, including multiple assistant, user, and system prompts.

One way to do this, if you are using the OpenAI format, is by creating a list of `{role, content}` objects. Here's an example:

```yaml
prompts:
  - file://prompt.json

providers:
  - openai:gpt-4o-mini

tests:
  - vars:
      messages:
        - role: system
          content: Respond as a pirate
        - role: user
          content: Who founded Facebook?
        - role: assistant
          content: Mark Zuckerberg
        - role: user
          content: Did he found any other companies?
```

Then the prompt itself is just a JSON dump of `messages`:

```liquid title=prompt.json
{{ messages | dump }}
```

## Simplified chat markup

Alternatively, you may prefer to specify a list of `role: message`, like this:

```yaml
tests:
  - vars:
      messages:
        - user: Who founded Facebook?
        - assistant: Mark Zuckerberg
        - user: Did he found any other companies?
```

This simplifies the config, but we need to work some magic in the prompt template:

```liquid title=prompt.json
[
{% for message in messages %}
  {% set outer_loop = loop %}
  {% for role, content in message %}
  {
    "role": "{{ role }}",
    "content": "{{ content }}"
  }{% if not (loop.last and outer_loop.last) %},{% endif %}
  {% endfor %}
{% endfor %}
]
```

## Creating a conversation history fixture

Using nunjucks templates, we can combine multiple chat messages. Here's an example in which the previous conversation is a fixture for _all_ tests. Each case tests a different follow-up message:

```yaml
# Set up the conversation history
defaultTest:
  vars:
    system_message: Answer concisely
    messages:
      - user: Who founded Facebook?
      - assistant: Mark Zuckerberg
      - user: What's his favorite food?
      - assistant: Pizza

# Test multiple follow-ups
tests:
  - vars:
      question: Did he create any other companies?
  - vars:
      question: What is his role at Internet.org?
  - vars:
      question: Will he let me borrow $5?
```

In the prompt template, we construct the conversation history followed by a user message containing the `question`:

```liquid title=prompt.json
[
  {
    "role": "system",
    "content": {{ system_message | dump }}
  },
  {% for message in messages %}
    {% for role, content in message %}
      {
        "role": "{{ role }}",
        "content": {{ content | dump }}
      },
    {% endfor %}
  {% endfor %}
  {
    "role": "user",
    "content": {{ question | dump }}
  }
]
```

:::info
Variables containing multiple lines and quotes are automatically escaped in JSON prompt files.

If the file is not valid JSON (such as in the case above, due to the nunjucks `{% for %}` loops), use the built-in nunjucks filter [`dump`](https://mozilla.github.io/nunjucks/templating.html#dump) to stringify the object as JSON.
:::

## Using the `_conversation` variable {#using-the-conversation-variable}

A built-in `_conversation` variable contains the full prompt and previous turns of a conversation. Use it to reference previous outputs and test an ongoing chat conversation.

The `_conversation` variable has the following type signature:

```ts
type Completion = {
  prompt: string | object;
  input: string;
  output: string;
};

type Conversation = Completion[];
```

In most cases, you'll loop through the `_conversation` variable and use each `Completion` object.

Use `completion.prompt` to reference the previous conversation. For example, to get the number of messages in a chat-formatted prompt:

```
{{ completion.prompt.length }}
```

Or to get the first message in the conversation:

```
{{ completion.prompt[0] }}
```

Use `completion.input` as a shortcut to get the last user message. In a chat-formatted prompt, `input` is set to the last user message, equivalent to `completion.prompt[completion.prompt.length - 1].content`.

Here's an example test config. Note how each question assumes context from the previous output:

```yaml
tests:
  - vars:
      question: Who founded Facebook?
  - vars:
      question: Where does he live?
  - vars:
      question: Which state is that in?
```

Here is the corresponding prompt:

```json
[
  // highlight-start
  {% for completion in _conversation %}
    {
      "role": "user",
      "content": "{{ completion.input }}"
    },
    {
      "role": "assistant",
      "content": "{{ completion.output }}"
    },
  {% endfor %}
  // highlight-end
  {
    "role": "user",
    "content": "{{ question }}"
  }
]
```

The prompt inserts the previous conversation into the test case, creating a full turn-by-turn conversation:

![multiple turn conversation eval](https://github.com/promptfoo/promptfoo/assets/310310/70048ae5-34ce-46f0-bd28-42d3aa96f03e)

Try it yourself by using the [full example config](https://github.com/promptfoo/promptfoo/tree/main/examples/multiple-turn-conversation).

:::info
When the `_conversation` variable is present, the eval will run single-threaded (concurrency of 1).
:::

## Separating Chat Conversations

When running multiple test files or test sequences, you may want to maintain separate conversation histories in the same eval run. This can be achieved by adding a `conversationId` to the test metadata:

```yaml
# test1.yaml
- vars:
    question: 'Who founded Facebook?'
  metadata:
    conversationId: 'conversation1'
- vars:
    question: 'Where does he live?'
  metadata:
    conversationId: 'conversation1'
```

```yaml
# test2.yaml
- vars:
    question: 'Where is Yosemite National Park?'
  metadata:
    conversationId: 'conversation2'
- vars:
    question: 'What are good hikes there?'
  metadata:
    conversationId: 'conversation2'
```

Each unique `conversationId` maintains its own separate conversation history. If no `conversationId` is specified, all tests using the same provider and prompt will share a conversation history.

### Including JSON in prompt content

In some cases, you may want to send JSON _within_ the OpenAI `content` field. In order to do this, you must ensure that the JSON is properly escaped.

Here's an example that prompts OpenAI with a JSON object of the structure `{query: string, history: {reply: string}[]}`. It first constructs this JSON object as the `input` variable. Then, it includes `input` in the prompt with proper JSON escaping:

```json
{% set input %}
{
    "query": "{{ query }}",
    "history": [
      {% for completion in _conversation %}
        {"reply": "{{ completion.output }}"} {% if not loop.last %},{% endif %}
      {% endfor %}
    ]
}
{% endset %}

[{
  "role": "user",
  "content": {{ input | trim | dump }}
}]
```

Here's the associated config:

```yaml
prompts:
  - file://prompt.json
providers:
  - openai:gpt-4o-mini
tests:
  - vars:
      query: how you doing
  - vars:
      query: need help with my passport
```

This has the effect of including the conversation history _within_ the prompt content. Here's what's sent to OpenAI for the second test case:

```json
[
  {
    "role": "user",
    "content": "{\n    \"query\": \"how you doing\",\n    \"history\": [\n      \n    ]\n}"
  }
]
```

## Using `storeOutputAs`

The `storeOutputAs` option makes it possible to reference previous outputs in multi-turn conversations. When set, it records the LLM output as a variable that can be used in subsequent chats.

Here's an example:

```yaml
prompts:
  - 'Respond to the user: {{message}}'

providers:
  - openai:gpt-4o

tests:
  - vars:
      message: "What's your favorite fruit? You must pick one. Output the name of a fruit only"
    options:
      storeOutputAs: favoriteFruit
  - vars:
      message: 'Why do you like {{favoriteFruit}} so much?'
    options:
      storeOutputAs: reason
  - vars:
      message: 'Write a snarky 2 sentence rebuttal to this argument for loving {{favoriteFruit}}: \"{{reason}}\"'
```

This creates `favoriteFruit` and `reason` vars on-the-go, as the chatbot answers questions.

### Manipulating outputs with `transform`

Outputs can be modified before storage using the `transform` property:

```yaml
tests:
  - vars:
      message: "What's your favorite fruit? You must pick one. Output the name of a fruit only"
    options:
      storeOutputAs: favoriteFruit
      // highlight-start
      transform: output.split(' ')[0]
      // highlight-end
  - vars:
      message: "Why do you like {{favoriteFruit}} so much?"
    options:
      storeOutputAs: reason
  - vars:
      message: 'Write a snarky 2 sentence rebuttal to this argument for loving {{favoriteFruit}}: \"{{reason}}\"'
```

Transforms can be Javascript snippets or they can be entire separate Python or Javascript files. See [docs on transform](/docs/configuration/guide/#transforming-outputs).
