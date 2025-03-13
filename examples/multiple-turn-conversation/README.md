To get started, set your OPENAI_API_KEY environment variable.

Next, have a look at prompt.json and edit promptfooconfig.yaml. The prompt uses a special built-in variable `_conversation` that has the following signature:

```ts
type Completion = {
  prompt: string | object;
  input: string;
  output: string;
};

type Conversation = Completion[];
```

When looping through `_conversation`, use `completion.prompt` in the Nunjucks prompt template to use the previous outputs. For example, `completion.prompt[completion.prompt.length - 1].content` is the last user message sent in a chat-formatted prompt.

`completion.input` is the last part of the prompt. In a chat-formatted conversation, it will be equal to `completion.prompt[completion.prompt.length - 1].content`. In other conversations, it will be equal to `completion.prompt[completion.prompt.length - 1]`.

Use `completion.output` to get the assistant's response to that message.

Then run:

```
promptfoo eval
```

Afterwards, you can view the results by running `promptfoo view`
