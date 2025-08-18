# Site Pages Frontmatter Description Audit

Generated: 2025-08-13

## Summary

Total pages analyzed: 331

- Pages WITH descriptions: 135
- Pages WITHOUT descriptions: 194
- Pages with NO frontmatter: 2

## Pages Without Descriptions (Requiring Action)

### Blog Posts

| File                            | Proposed Description                                                       |
| ------------------------------- | -------------------------------------------------------------------------- |
| site/README.md                  | Technical setup and development guide for the Promptfoo documentation site |
| site/src/pages/markdown-page.md | Example markdown page template for site documentation                      |

### Configuration Documentation

| File                                                   | Proposed Description                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| site/docs/configuration/expected-outputs/classifier.md | Use HuggingFace text classifiers to evaluate LLM outputs for sentiment, toxicity, bias, PII, and other classifications  |
| site/docs/configuration/expected-outputs/guardrails.md | Validate LLM outputs against provider-specific safety guardrails including AWS Bedrock and Azure OpenAI content filters |
| site/docs/configuration/expected-outputs/javascript.md | Create custom JavaScript functions to validate LLM outputs with flexible scoring and error handling                     |
| site/docs/configuration/expected-outputs/python.md     | Write Python scripts for custom LLM output validation with complex logic and external dependencies                      |
| site/docs/configuration/expected-outputs/moderation.md | Configure content moderation checks to filter harmful, toxic, or inappropriate LLM outputs                              |
| site/docs/configuration/expected-outputs/similar.md    | Measure semantic similarity between LLM outputs and expected responses using embedding models                           |

### Model-Graded Evaluations

| File                                                                            | Proposed Description                                                                        |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| site/docs/configuration/expected-outputs/model-graded/answer-relevance.md       | Evaluate how well LLM responses answer the user's specific question using AI-based grading  |
| site/docs/configuration/expected-outputs/model-graded/context-faithfulness.md   | Assess whether LLM outputs accurately reflect provided context without hallucination        |
| site/docs/configuration/expected-outputs/model-graded/context-recall.md         | Measure how completely LLM responses utilize relevant information from provided context     |
| site/docs/configuration/expected-outputs/model-graded/context-relevance.md      | Evaluate whether retrieved context is relevant to answering the user's query in RAG systems |
| site/docs/configuration/expected-outputs/model-graded/conversation-relevance.md | Check if LLM responses maintain relevance throughout multi-turn conversations               |
| site/docs/configuration/expected-outputs/model-graded/factuality.md             | Verify factual accuracy of LLM outputs against known information using AI grading           |
| site/docs/configuration/expected-outputs/model-graded/g-eval.md                 | Implement Google's G-Eval framework for multi-criteria LLM output evaluation                |
| site/docs/configuration/expected-outputs/model-graded/index.md                  | Overview of model-graded evaluation techniques using AI to assess AI outputs                |
| site/docs/configuration/expected-outputs/model-graded/llm-rubric.md             | Define custom rubrics for LLM output evaluation using natural language criteria             |
| site/docs/configuration/expected-outputs/model-graded/model-graded-closedqa.md  | Evaluate closed-domain question answering with model-based correctness assessment           |
| site/docs/configuration/expected-outputs/model-graded/pi.md                     | Detect and prevent prompt injection attempts using model-based classification               |
| site/docs/configuration/expected-outputs/model-graded/select-best.md            | Use AI models to select the best output from multiple LLM responses                         |

### Enterprise Features

| File                             | Proposed Description                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| site/docs/enterprise/webhooks.md | Configure webhook integrations for real-time notifications of security findings and evaluation events |

### Provider Integrations

| File                                         | Proposed Description                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| site/docs/providers/adaline.md               | Connect to Adaline's unified API for accessing multiple LLM providers through a single interface |
| site/docs/providers/ai21.md                  | Integrate AI21 Labs' Jurassic models for text generation and completion tasks                    |
| site/docs/providers/aimlapi.md               | Access 200+ open-source models through AIML API's unified interface                              |
| site/docs/providers/alibaba.md               | Use Alibaba Cloud's Qwen and other models via their AI platform                                  |
| site/docs/providers/anthropic.md             | Configure Claude models from Anthropic for conversational AI and reasoning tasks                 |
| site/docs/providers/browser.md               | Run LLM evaluations directly in web browsers using WebGPU and local models                       |
| site/docs/providers/cerebras.md              | Access Cerebras' ultra-fast inference for Llama and other open models                            |
| site/docs/providers/cloudera.md              | Connect to Cloudera's enterprise AI platform for secure model deployment                         |
| site/docs/providers/cloudflare-ai.md         | Use Cloudflare Workers AI for edge-deployed model inference                                      |
| site/docs/providers/cohere.md                | Integrate Cohere's Command models for text generation and RAG applications                       |
| site/docs/providers/custom-api.md            | Create custom API integrations for proprietary or specialized LLM endpoints                      |
| site/docs/providers/custom-script.md         | Write custom scripts to integrate any LLM or API into your evaluation pipeline                   |
| site/docs/providers/databricks.md            | Connect to Databricks Model Serving for enterprise MLOps workflows                               |
| site/docs/providers/deepseek.md              | Use DeepSeek's cost-effective models for coding and reasoning tasks                              |
| site/docs/providers/echo.md                  | Simple echo provider for testing and debugging evaluation configurations                         |
| site/docs/providers/f5.md                    | Integrate F5's enterprise AI security and inference platform                                     |
| site/docs/providers/fireworks.md             | Access fast inference for open-source models through Fireworks AI                                |
| site/docs/providers/go.md                    | Write custom Go programs to integrate with your evaluation pipeline                              |
| site/docs/providers/google.md                | Configure Google's Gemini models for multimodal AI evaluations                                   |
| site/docs/providers/groq.md                  | Use Groq's LPU inference for ultra-low latency model serving                                     |
| site/docs/providers/http.md                  | Generic HTTP provider for RESTful API integrations                                               |
| site/docs/providers/huggingface.md           | Access thousands of models from HuggingFace's model hub                                          |
| site/docs/providers/hyperbolic.md            | Connect to Hyperbolic's decentralized GPU network for model inference                            |
| site/docs/providers/ibm-bam.md               | Use IBM's BAM research platform for advanced model experimentation                               |
| site/docs/providers/index.md                 | Overview of all supported LLM providers and integration methods                                  |
| site/docs/providers/jfrog.md                 | Integrate JFrog's ML model management and security scanning                                      |
| site/docs/providers/lambdalabs.md            | Access Lambda Labs' GPU cloud for high-performance model inference                               |
| site/docs/providers/llama.cpp.md             | Run quantized models locally using the llama.cpp inference engine                                |
| site/docs/providers/llamafile.md             | Deploy single-file executable LLMs with llamafile                                                |
| site/docs/providers/localai.md               | Self-hosted OpenAI-compatible API for local model deployment                                     |
| site/docs/providers/manual-input.md          | Manually provide responses for testing without LLM calls                                         |
| site/docs/providers/ollama.md                | Run open-source models locally with Ollama's simple interface                                    |
| site/docs/providers/openai.md                | Configure OpenAI's GPT models including GPT-4, GPT-3.5, and embeddings                           |
| site/docs/providers/openllm.md               | Deploy and serve open LLMs with BentoML's OpenLLM framework                                      |
| site/docs/providers/openrouter.md            | Access multiple LLM providers through OpenRouter's unified API                                   |
| site/docs/providers/perplexity.md            | Use Perplexity's online LLMs with real-time web search capabilities                              |
| site/docs/providers/python.md                | Write Python scripts for custom model integrations and evaluations                               |
| site/docs/providers/replicate.md             | Run open-source models in the cloud with Replicate's API                                         |
| site/docs/providers/sequence.md              | Chain multiple providers in sequence for complex evaluation workflows                            |
| site/docs/providers/simulated-user.md        | Simulate user interactions for testing conversational AI systems                                 |
| site/docs/providers/text-generation-webui.md | Connect to Oobabooga's text-generation-webui for local model hosting                             |
| site/docs/providers/togetherai.md            | Access open-source models through Together AI's inference platform                               |
| site/docs/providers/vertex.md                | Use Google Cloud Vertex AI for enterprise model deployment                                       |
| site/docs/providers/vllm.md                  | High-throughput serving of LLMs with vLLM's optimized inference                                  |
| site/docs/providers/voyage.md                | Integrate Voyage AI's specialized embedding models for semantic search                           |
| site/docs/providers/watsonx.md               | Connect to IBM watsonx for enterprise AI model management                                        |
| site/docs/providers/webhook.md               | Send LLM requests to custom webhook endpoints                                                    |
| site/docs/providers/websocket.md             | Real-time bidirectional communication with LLM services via WebSocket                            |

### Testing Guides

| File                                                   | Proposed Description                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| site/docs/guides/azure-vs-openai.md                    | Compare Azure OpenAI Service with OpenAI API for enterprise deployments      |
| site/docs/guides/chatbase-redteam.md                   | Red team Chatbase AI chatbots for security vulnerabilities                   |
| site/docs/guides/choosing-best-gpt-model.md            | Systematic approach to selecting the optimal GPT model for your use case     |
| site/docs/guides/cohere-command-r-benchmark.md         | Benchmark Cohere's Command R models against other LLMs for RAG performance   |
| site/docs/guides/compare-llama2-vs-gpt.md              | Head-to-head comparison of Llama 2 and GPT models for various tasks          |
| site/docs/guides/dbrx-benchmark.md                     | Evaluate Databricks' DBRX model performance across standard benchmarks       |
| site/docs/guides/deepseek-benchmark.md                 | Assess DeepSeek model capabilities for coding and reasoning tasks            |
| site/docs/guides/evaling-with-harmbench.md             | Use HarmBench dataset to evaluate LLM safety and harmful content generation  |
| site/docs/guides/evaluate-crewai.md                    | Test and evaluate CrewAI multi-agent systems for reliability and performance |
| site/docs/guides/evaluate-json.md                      | Validate JSON output generation from LLMs for structured data tasks          |
| site/docs/guides/evaluate-llm-temperature.md           | Optimize temperature settings for consistent and creative LLM outputs        |
| site/docs/guides/evaluate-openai-assistants.md         | Test OpenAI Assistants API for function calling and retrieval capabilities   |
| site/docs/guides/evaluate-rag.md                       | Comprehensive testing strategies for retrieval-augmented generation systems  |
| site/docs/guides/evaluate-replicate-lifeboat.md        | Evaluate Replicate's Lifeboat models for specific use cases                  |
| site/docs/guides/gemini-vs-gpt.md                      | Compare Google Gemini and OpenAI GPT models across multimodal tasks          |
| site/docs/guides/gemma-vs-llama.md                     | Benchmark Google's Gemma against Meta's Llama for efficiency and performance |
| site/docs/guides/gpt-3.5-vs-gpt-4.md                   | Detailed comparison of GPT-3.5 and GPT-4 capabilities and costs              |
| site/docs/guides/langchain-prompttemplate.md           | Test LangChain PromptTemplates for consistency and correctness               |
| site/docs/guides/llama2-uncensored-benchmark-ollama.md | Evaluate uncensored Llama 2 variants using Ollama for local testing          |
| site/docs/guides/llm-redteaming.md                     | Comprehensive guide to red teaming LLMs for security vulnerabilities         |
| site/docs/guides/mistral-vs-llama.md                   | Compare Mistral and Llama models for European language support               |
| site/docs/guides/mixtral-vs-gpt.md                     | Evaluate Mixtral mixture-of-experts against GPT for efficiency               |
| site/docs/guides/phi-vs-llama.md                       | Compare Microsoft Phi and Meta Llama small language models                   |
| site/docs/guides/prevent-llm-hallucations.md           | Strategies and tests to detect and prevent LLM hallucinations                |
| site/docs/guides/qwen-benchmark.md                     | Benchmark Alibaba's Qwen models for multilingual performance                 |
| site/docs/guides/sandboxed-code-evals.md               | Safely evaluate code generation in isolated sandbox environments             |
| site/docs/guides/testing-llm-chains.md                 | Test complex LLM chains and pipelines for reliability                        |
| site/docs/guides/text-to-sql-evaluation.md             | Evaluate text-to-SQL generation accuracy and safety                          |

### CI/CD Integrations

| File                                          | Proposed Description                                               |
| --------------------------------------------- | ------------------------------------------------------------------ |
| site/docs/integrations/azure-pipelines.md     | Integrate promptfoo testing into Azure DevOps pipelines            |
| site/docs/integrations/bitbucket-pipelines.md | Add LLM testing to Bitbucket CI/CD workflows                       |
| site/docs/integrations/burp.md                | Use promptfoo with Burp Suite for web application security testing |
| site/docs/integrations/circle-ci.md           | Configure CircleCI for automated LLM evaluation in CI/CD           |
| site/docs/integrations/github-action.md       | GitHub Actions integration for automated prompt testing            |
| site/docs/integrations/gitlab-ci.md           | Set up GitLab CI/CD pipelines with promptfoo evaluations           |
| site/docs/integrations/google-sheets.md       | Export evaluation results to Google Sheets for analysis            |
| site/docs/integrations/helicone.md            | Monitor LLM usage and costs with Helicone observability            |
| site/docs/integrations/jenkins.md             | Add promptfoo to Jenkins build pipelines                           |
| site/docs/integrations/jest.md                | Integrate LLM testing with Jest test framework                     |
| site/docs/integrations/langfuse.md            | Track LLM performance with Langfuse observability platform         |
| site/docs/integrations/looper.md              | Automated testing loops with Looper integration                    |
| site/docs/integrations/mocha-chai.md          | Use promptfoo with Mocha and Chai test frameworks                  |
| site/docs/integrations/portkey.md             | LLM gateway integration with Portkey for monitoring                |
| site/docs/integrations/travis-ci.md           | Configure Travis CI for continuous LLM testing                     |

### Red Team Documentation

| File                                          | Proposed Description                                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| site/docs/red-team/agents.md                  | Red team LLM agents by simulating adversarial attacks and testing autonomous system vulnerabilities |
| site/docs/red-team/architecture.md            | Technical architecture for systematic red teaming and adversarial testing of AI systems             |
| site/docs/red-team/configuration.md           | Configure red team simulations with adversarial plugins, attack strategies, and target systems      |
| site/docs/red-team/discovery.md               | Automatically red team your LLM by discovering vulnerabilities through systematic probing           |
| site/docs/red-team/guardrails.md              | Red team AI safety guardrails by testing their effectiveness against adversarial inputs             |
| site/docs/red-team/index.md                   | Complete guide to red teaming LLMs through adversarial testing and vulnerability assessment         |
| site/docs/red-team/llm-vulnerability-types.md | Red team against known LLM vulnerabilities using this comprehensive security taxonomy               |
| site/docs/red-team/owasp-llm-top-10.md        | Red team your LLM against OWASP's Top 10 security risks through systematic testing                  |
| site/docs/red-team/quickstart.md              | Start red teaming your LLM in 5 minutes with automated adversarial testing                          |
| site/docs/red-team/rag.md                     | Red team RAG systems by testing retrieval vulnerabilities and data poisoning attacks                |

### Red Team Plugins

| File                                                    | Proposed Description                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| site/docs/red-team/plugins/aegis.md                     | Red team your AI by simulating Aegis benchmark adversarial attacks to uncover model vulnerabilities |
| site/docs/red-team/plugins/age-bias.md                  | Red team for age discrimination by probing LLM responses for age-related biases                     |
| site/docs/red-team/plugins/ascii-smuggling.md           | Red team prompt security by testing ASCII art injection techniques that bypass content filters      |
| site/docs/red-team/plugins/beavertails.md               | Red team with 700+ harmful prompts from BeaverTails to stress-test safety measures                  |
| site/docs/red-team/plugins/bfla.md                      | Red team API security by simulating Broken Function Level Authorization attacks                     |
| site/docs/red-team/plugins/bias.md                      | Red team for demographic biases through comprehensive adversarial bias testing                      |
| site/docs/red-team/plugins/bola.md                      | Red team authorization controls by attempting Broken Object Level Authorization exploits            |
| site/docs/red-team/plugins/competitors.md               | Red team for information leakage by probing whether LLMs reveal competitor data                     |
| site/docs/red-team/plugins/context-compliance-attack.md | Red team compliance boundaries by attempting to make LLMs violate context rules                     |
| site/docs/red-team/plugins/contracts.md                 | Red team legal safety by testing for unauthorized contract generation vulnerabilities               |
| site/docs/red-team/plugins/cross-session-leak.md        | Red team session isolation by probing for cross-user information leakage                            |
| site/docs/red-team/plugins/custom.md                    | Build custom red team tests to simulate organization-specific adversarial scenarios                 |
| site/docs/red-team/plugins/cyberseceval.md              | Red team with Meta's CyberSecEval to benchmark security against industry standards                  |
| site/docs/red-team/plugins/debug-access.md              | Red team for exposed debug information through systematic endpoint probing                          |
| site/docs/red-team/plugins/disability-bias.md           | Red team for disability discrimination by testing AI responses for ableist content                  |
| site/docs/red-team/plugins/divergent-repetition.md      | Red team output stability by inducing repetitive or divergent generation patterns                   |
| site/docs/red-team/plugins/donotanswer.md               | Red team refusal mechanisms using DoNotAnswer adversarial test cases                                |
| site/docs/red-team/plugins/excessive-agency.md          | Red team capability boundaries by testing if LLMs claim unauthorized abilities                      |
| site/docs/red-team/plugins/gender-bias.md               | Red team for gender discrimination through adversarial gender bias testing                          |
| site/docs/red-team/plugins/hallucination.md             | Red team factual accuracy by probing for hallucinated and false information                         |
| site/docs/red-team/plugins/harmbench.md                 | Red team with HarmBench's comprehensive suite of adversarial safety tests                           |
| site/docs/red-team/plugins/harmful.md                   | Red team content safety by simulating attempts to generate harmful outputs                          |
| site/docs/red-team/plugins/hijacking.md                 | Red team conversation control by attempting to hijack AI system purpose                             |
| site/docs/red-team/plugins/imitation.md                 | Red team brand safety by testing for impersonation and imitation attempts                           |
| site/docs/red-team/plugins/index.md                     | Complete catalog of red team plugins for adversarial AI security testing                            |
| site/docs/red-team/plugins/indirect-prompt-injection.md | Red team indirect attacks by injecting prompts through external content sources                     |
| site/docs/red-team/plugins/intent.md                    | Red team intent recognition by testing with ambiguous and malicious requests                        |
| site/docs/red-team/plugins/malicious-code.md            | Red team code generation safety by attempting to produce malicious scripts                          |
| site/docs/red-team/plugins/mcp.md                       | Red team Model Context Protocol integrations through adversarial tool testing                       |
| site/docs/red-team/plugins/memory-poisoning.md          | Red team stateful systems by attempting memory poisoning and corruption attacks                     |
| site/docs/red-team/plugins/overreliance.md              | Red team user safety by identifying scenarios that encourage over-reliance on AI                    |
| site/docs/red-team/plugins/pii.md                       | Red team data privacy by attempting to extract personally identifiable information                  |
| site/docs/red-team/plugins/pliny.md                     | Red team with Pliny's advanced prompt injection attack framework                                    |
| site/docs/red-team/plugins/policy.md                    | Red team policy compliance through adversarial organizational rule testing                          |
| site/docs/red-team/plugins/politics.md                  | Red team political neutrality by probing for partisan bias and controversial content                |
| site/docs/red-team/plugins/prompt-extraction.md         | Red team prompt security by attempting to extract system instructions and prompts                   |
| site/docs/red-team/plugins/race-bias.md                 | Red team for racial discrimination through adversarial bias testing                                 |
| site/docs/red-team/plugins/rag-poisoning.md             | Red team RAG systems by simulating data poisoning and manipulation attacks                          |
| site/docs/red-team/plugins/rbac.md                      | Red team access controls by testing role-based authorization boundaries                             |
| site/docs/red-team/plugins/reasoning-dos.md             | Red team system resilience with denial-of-service through complex reasoning                         |
| site/docs/red-team/plugins/religion.md                  | Red team religious sensitivity by testing for bias and inappropriate content                        |
| site/docs/red-team/plugins/shell-injection.md           | Red team command execution safety by attempting shell injection attacks                             |
| site/docs/red-team/plugins/sql-injection.md             | Red team database security by simulating SQL injection attack patterns                              |
| site/docs/red-team/plugins/ssrf.md                      | Red team network security through Server-Side Request Forgery attempts                              |
| site/docs/red-team/plugins/system-prompt-override.md    | Red team prompt integrity by attempting to override system instructions                             |
| site/docs/red-team/plugins/xstest.md                    | Red team output sanitization by testing for cross-site scripting vulnerabilities                    |

### Red Team Strategies

| File                                              | Proposed Description                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| site/docs/red-team/strategies/index.md            | Overview of attack strategies and jailbreak techniques for red teaming |
| site/docs/red-team/strategies/iterative.md        | Multi-round iterative jailbreaking with adaptive prompts               |
| site/docs/red-team/strategies/leetspeak.md        | Test LLM handling of leetspeak-encoded harmful requests                |
| site/docs/red-team/strategies/likert.md           | Use Likert scale framing to elicit unwanted behaviors                  |
| site/docs/red-team/strategies/math-prompt.md      | Hide harmful requests in mathematical problem contexts                 |
| site/docs/red-team/strategies/mischievous-user.md | Simulate mischievous user behavior patterns                            |
| site/docs/red-team/strategies/multi-turn.md       | Complex multi-turn conversation attacks                                |
| site/docs/red-team/strategies/multilingual.md     | Cross-language jailbreak attempts                                      |
| site/docs/red-team/strategies/other-encodings.md  | Test various encoding methods to bypass filters                        |
| site/docs/red-team/strategies/pandamonium.md      | Advanced composite jailbreak strategy                                  |
| site/docs/red-team/strategies/prompt-injection.md | Direct prompt injection attack patterns                                |
| site/docs/red-team/strategies/retry.md            | Persistence-based jailbreaking through retries                         |
| site/docs/red-team/strategies/rot13.md            | ROT13 encoding to obfuscate harmful content                            |
| site/docs/red-team/strategies/tree.md             | Tree-of-thought jailbreaking approach                                  |
| site/docs/red-team/strategies/video.md            | Multimodal attacks using video inputs                                  |

### Red Team Troubleshooting

| File                                                          | Proposed Description                                   |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| site/docs/red-team/troubleshooting/attack-generation.md       | Debug issues with generating effective attack prompts  |
| site/docs/red-team/troubleshooting/best-practices.md          | Best practices for effective LLM red teaming           |
| site/docs/red-team/troubleshooting/connecting-to-targets.md   | Troubleshoot connection issues with target LLM systems |
| site/docs/red-team/troubleshooting/false-positives.md         | Reduce false positives in vulnerability detection      |
| site/docs/red-team/troubleshooting/grading-results.md         | Improve accuracy of vulnerability assessment           |
| site/docs/red-team/troubleshooting/inference-limit.md         | Handle rate limits and inference constraints           |
| site/docs/red-team/troubleshooting/multi-turn-sessions.md     | Debug multi-turn conversation testing                  |
| site/docs/red-team/troubleshooting/multiple-response-types.md | Handle varied response formats from LLMs               |
| site/docs/red-team/troubleshooting/overview.md                | Common red teaming issues and solutions                |
| site/docs/red-team/troubleshooting/remote-generation.md       | Troubleshoot remote attack generation services         |

### Core Documentation

| File                               | Proposed Description                                       |
| ---------------------------------- | ---------------------------------------------------------- |
| site/docs/faq.md                   | Frequently asked questions about promptfoo and LLM testing |
| site/docs/intro.md                 | Introduction to promptfoo and its core capabilities        |
| site/docs/model-audit/usage.md     | How to use ModelAudit for ML model security scanning       |
| site/docs/releases.md              | Release notes and version history for promptfoo            |
| site/docs/tracing.md               | Distributed tracing for LLM applications and debugging     |
| site/docs/usage/command-line.md    | Complete CLI reference for promptfoo commands              |
| site/docs/usage/node-package.md    | Use promptfoo as a Node.js library in your applications    |
| site/docs/usage/self-hosting.md    | Deploy promptfoo on your own infrastructure                |
| site/docs/usage/sharing.md         | Share evaluation results and collaborate with teams        |
| site/docs/usage/troubleshooting.md | Common issues and solutions for promptfoo usage            |
| site/docs/usage/web-ui.md          | Navigate and use the promptfoo web interface               |

### Legal Pages

| File                                            | Proposed Description                                        |
| ----------------------------------------------- | ----------------------------------------------------------- |
| site/src/pages/privacy.md                       | Privacy policy for promptfoo services and data handling     |
| site/src/pages/responsible-disclosure-policy.md | Security vulnerability disclosure guidelines and procedures |
| site/src/pages/terms-of-service.md              | Terms of service for using promptfoo products and services  |

## Pages With Descriptions (For Reference)

### Blog Posts (48 total)

All blog posts have comprehensive descriptions covering topics like:

- Security vulnerabilities and red teaming
- Model comparisons and benchmarks
- Company announcements
- Technical guides and best practices

### Configuration Documentation (14 with descriptions)

Key pages include:

- Caching strategies
- Chat configuration
- Dataset generation
- Configuration guides and references

### Enterprise Features (7 with descriptions)

Covers authentication, audit logging, teams, and service accounts

### Provider Documentation (19 with descriptions)

Major providers like AWS Bedrock, Azure, Docker, GitHub, and others

### Testing Guides (10 with descriptions)

Various model comparisons and testing methodologies

### Integration Documentation (4 with descriptions)

CI/CD, MCP, n8n, and SonarQube integrations

### Red Team Documentation (12 with descriptions)

Foundation models, MCP security, and various attack strategies

## Recommendations

1. **Priority 1**: Add descriptions to all core documentation pages (intro.md, faq.md, etc.)
2. **Priority 2**: Complete provider documentation descriptions
3. **Priority 3**: Add descriptions to all red team plugins and strategies
4. **Priority 4**: Complete integration documentation
5. **Priority 5**: Add descriptions to legal pages

## Critical Observations

1. **Consistency Issue**: Some related pages have descriptions while others don't (e.g., some model-graded evaluations have descriptions, others don't)
2. **SEO Impact**: 194 pages without descriptions significantly impacts search engine optimization
3. **User Experience**: Missing descriptions make it harder for users to find relevant documentation
4. **Documentation Quality**: The lack of descriptions suggests incomplete documentation metadata

## Next Steps

1. Implement the proposed descriptions above
2. Establish a documentation standard requiring descriptions for all new pages
3. Consider adding other metadata like keywords and last-updated dates
4. Implement automated checks to ensure all pages have descriptions before publishing
