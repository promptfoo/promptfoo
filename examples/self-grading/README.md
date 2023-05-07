This example shows how you can have an LLM grade its own output according to predefined expectations.

Run:

```
promptfoo -p prompts.txt --vars vars.csv -r openai:chat:gpt-3.5-turbo --grader openai:chat:gpt-4
```
