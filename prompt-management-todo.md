
- [ ] Be able to reference the managed prompt on the eval page
- [ ] Re-run an eval with a new version of a prompt
- [ ] Auto-suggest improvements to the prompt based on the test cases
- [x] Export `{ prompts }` from `src/index.ts` along with every useful function so that people can grab prompts from promptfoo programmatically in their agents
- [x] Add Prompt Management as a high level feature in the docs, including on the main site
- [ ] Have nice usage statistics in the Prompts view for evals that use prompts, their success rates, etc.
- [x] Document the caveats (should file references stay as references or be serialized?)
- [ ] Decide whether to use something like a git repo to back the different versions of prompts
- [ ] Critically audit this feature and compare to other solutions
- [ ] Add useful telemetry within the feature
- [ ] Add support to cloud
- [x] Store metadata in the db alongside the prompt (e.g., version of promptfoo that created it, was logged in, OS info, how many times used)
- [ ] Have LLM-powered features to quickly test the prompt on the creation page, including auto-suggesting vars
- [ ] Be able to use this with assertion generation, dataset generation, and red teaming

- [x] Import/Export: Bulk operations for migrating existing prompts.

- question: should prompt managemnt support paramters like temperature or json schemas? 
- question: should we try to auto-add prompts when untracked ones are run in evals 
- question: how big can prompts be 
- question: where do we want to remove complexity?