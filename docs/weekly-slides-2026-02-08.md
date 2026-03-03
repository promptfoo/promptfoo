# Promptfoo Weekly Update — Feb 1–8, 2026

---

## Slide Option A (feature-heavy)

**Eng Update**

**At the frontier:** Indirect web-pwn — new redteam attack strategy for testing AI agents against indirect prompt injection via web content. Landed across OSS + Cloud after 25 days of development and review.

**Hanging in there:** 86 open PRs across the org (43 in cloud alone). Observability (Langfuse tracing) and MCP Shadow server are large in-flight efforts spanning multiple repos.

**Other notable lands:**

- Eval Creator — build and run evals directly in Cloud UI, no CLI needed
- External grading guidelines — upload your org's safety policies, LLM extracts per-plugin grading guidance
- Claude Opus 4.6 support across all platforms
- Admin app migrated from MUI to Radix UI + Tailwind
- Public eval sharing (unauthenticated viewing)
- HuggingFace + xAI Grok video providers
- Staging safety checks after Feb 5 production outage
- On-prem smoke tests now gate all image tagging

---

## Slide Option B (metrics-heavy)

**Eng Update**

**At the frontier:** 309 PRs merged across 20 repos in one week. 91% merge rate, 6.8h median time-to-merge. 96K net new lines of code shipped.

**Hanging in there:** Dependency churn — 155+ bot PRs from Renovate/Dependabot. 30 PRs closed without merge (mostly superseded dep bumps and scope pivots).

**Other notable lands:**

- Eval Creator for Cloud UI (will-holley, 18K lines)
- Indirect web-pwn redteam strategy (yash, 25-day PR)
- External grading guidelines (yash, 35K lines)
- Multilingual redteam for audio/video/image
- Provider guardrails — define tools once, use across all providers
- Real estate domain plugins
- Playwright test sharding (4x parallelism)
- 3 community PRs merged (Google AI Studio pricing, g-eval fix, payload fix)

---

## Slide Option C (narrative, concise)

**Eng Update**

**At the frontier:** Shipped indirect web-pwn — a brand new attack strategy that tests whether AI agents can be manipulated through injected web content. Also launched the Eval Creator, letting users build and run evals directly in Cloud without touching the CLI.

**Hanging in there:** Large cross-repo features (Langfuse observability, MCP Shadow, team-scoped API tokens) still in flight — each touching 3+ repos and 5K+ lines.

**Other notable lands:**

- External grading guidelines — grade redteam results against your own org's policies
- Claude Opus 4.6 across Anthropic, Bedrock, Vertex, Azure
- Admin app → Radix UI + Tailwind (bye MUI)
- Public eval sharing
- Staging deploy safety checks (post Feb 5 outage)
- HuggingFace chat + xAI video providers
- Bulk regrading UX overhaul

---

## Slide Option D (people-focused)

**Eng Update**

**At the frontier:** 16 human contributors + 3 community PRs merged this week. faizanminhas reviewed 25 PRs while landing only 2 of his own. will-holley, addelong, yash, minhle1291, and danenania had 100% approval rates — every PR reviewed before merge.

**Hanging in there:** yash's indirect web-pwn PR lived for 25 days before merging — complex cross-repo feature spanning OSS + Cloud. 3 more large features (Langfuse, MCP Shadow, team-scoped tokens) are 6+ days open.

**Other notable lands:**

- yash: indirect web-pwn + external guidelines (34K lines)
- will-holley: Eval Creator + datasets + prompts pages (23K lines)
- JustinBeckwith: admin app MUI → Radix migration + public evals (28K lines)
- addelong: multilingual redteam + on-prem smoke tests
- danenania: staging safety checks + tix worktree tooling
- minhle1291: bulk regrading UX modernization

---

## Bonus: Coming Soon slide

**What's next**

- **MCP Shadow Server** — red team AI agents via hostile MCP servers (MrFlounder, 20K+ lines in draft)
- **Langfuse Observability** — full tracing across all 13 LLM call sites (danenania)
- **Team-Scoped API Tokens** — restrict CI/CD tokens to a single team (mldangelo, 15K lines)
- **Azure Content Safety Guardrails** — text moderation, prompt shields, protected material detection (jameshiester)
- **GCP On-Prem Automation** — one-click service account provisioning from admin app (addelong, 15K lines)
- **OpenClaw Provider** — 4 provider types with auto-config detection (mldangelo)
- **API Rate Limits** — 1000/min auth, 300/min unauth (typpo, blocked on Redis decision)
- **CI Rollback Workflow** — emergency rollback for prod + staging (danenania)
