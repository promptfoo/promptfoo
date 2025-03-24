## What's Changed

### Features

* feat(providers): Added support for OpenAI Responses API by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3440

### Fixes

* fix(Dockerfile): Created .promptfoo directory in Dockerfile and removed initContainer by @zewelor in https://github.com/promptfoo/promptfoo/pull/3435
* fix(providers): Fixed caching behavior for Azure assistants by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3443
* fix(providers): Resolved Go provider CallApi redeclaration issue by @MrFlounder in https://github.com/promptfoo/promptfoo/pull/3414
* fix(redteam): Added missing constants for RAG poisoning plugin by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3375

### Chores

* chore(dependencies): Bumped OpenAI from 4.87.4 to 4.88.0 by @dependabot in https://github.com/promptfoo/promptfoo/pull/3436
* chore(webui): Included error message in toast by @typpo in https://github.com/promptfoo/promptfoo/pull/3437
* chore(providers): Added o1-pro by @typpo in https://github.com/promptfoo/promptfoo/pull/3438
* chore(scripts): Specified repository for postversion PR creation by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3432

### Documentation

* docs(blog): Added misinformation blog post by @vsauter in https://github.com/promptfoo/promptfoo/pull/3433
* docs(examples): Added redteam-azure-assistant example by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3446
* docs(redteam): Added guidance on purpose for image redteams by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3444
* docs(redteam): Created guides section under red teaming by @typpo in https://github.com/promptfoo/promptfoo/pull/3445
* docs(site): Added responsible disclosure policy by @typpo in https://github.com/promptfoo/promptfoo/pull/3434

### Tests

* test: Added unit test for src/evaluatorHelpers.ts by @gru-agent in https://github.com/promptfoo/promptfoo/pull/3430

## New Contributors

* @zewelor made their first contribution in https://github.com/promptfoo/promptfoo/pull/3435

**Full Changelog**: https://github.com/promptfoo/promptfoo/compare/0.107.3...0.107.4