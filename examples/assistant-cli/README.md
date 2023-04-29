This example shows how you can use promptfoo to generate a side-by-side eval of two prompts for an ecommerce chat bot.

Run:

```
promptfoo --prompts prompts.txt --vars vars.csv -r openai:chat
```

In development:

```
npm run local eval -- --prompts prompts.txt --vars vars.csv -r openai:chat
```
