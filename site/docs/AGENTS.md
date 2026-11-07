# Promptfoo documentation standard

Apply this standard when creating or editing public docs in `site/docs`, including
with AI assistance. Write for people using Promptfoo. Help them complete a task or
understand something that affects how they use the product.

Use this file for content selection and editorial judgment. Use the
[Google developer documentation style guide](https://developers.google.com/style/highlights)
for sentence-level writing, subject to the repository conventions in
[`site/AGENTS.md`](../AGENTS.md). This file is author guidance and is excluded from
the published site.

## Start with the reader's need

Before drafting, identify the reader's goal, what they already know, and what they
must have configured. Establish which interface or deployment the topic concerns
and what the reader should be able to do or explain afterward. This is a working
brief, not a required section on the page.

Read nearby docs first. Extend the appropriate existing page before creating a
new one. Keep shared explanations in one place and link to them. Improve the
requested topic without reorganizing adjacent pages or changing established URLs
and heading anchors.

## Decide what belongs

Include information that helps the reader act correctly, choose between relevant
options, understand surprising behavior, interpret a result, or recover from a
known failure. For each section, ask what the reader would lose if it disappeared.
If it changes nothing about their ability to use or understand Promptfoo, cut it.

A detail's presence in the code does not make it useful documentation. Explain its
consequence for the user. Internal class names, orchestration, development history,
and rollout mechanics belong only when needed to explain a public interface or
observable behavior.

Cover the chosen topic adequately. Conciseness must not remove reasoning or
examples the reader needs. Link to adjacent topics instead of covering every
related capability.

## Give the page a purpose

Use [Diátaxis](https://diataxis.fr/) to choose a primary purpose for a page or
substantial topic:

| Purpose     | What the reader needs                                            | Promptfoo example                           |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------- |
| Tutorial    | A guided first experience with an observable result              | Run an eval and inspect a failed assertion  |
| How-to      | Steps to reach a specific goal from a stated starting point      | Connect an HTTP target for red teaming      |
| Reference   | Exact syntax, defaults, accepted values, constraints, and errors | Provider configuration or assertion options |
| Explanation | A mental model and its practical implications                    | How plugins, strategies, and grading relate |

Choose the structure that serves the purpose. Do not force a common outline,
create all four types for every feature, or expose the taxonomy in navigation.
An explanation needs reasoning. A reference may need exhaustive options that
would distract from a getting-started guide.

## Ground product claims

Inspect the relevant implementation and tests before describing behavior. Check
command definitions, configuration schemas, provider code, and scoring logic as
appropriate. Verify UI labels and examples against the interface they describe.
Existing prose and AI output are leads to verify, not proof.

Establish whether behavior applies to the CLI, local web UI, Node library, or
Promptfoo Enterprise, and to which deployment or version when that matters. Do
not infer parity between them or between providers. Source code alone does not
establish that a feature is available in a published release.

When documenting data handling, verify where target requests, attack generation,
grading, and result storage happen for the configuration shown. Running the CLI
locally does not establish that all processing is local. Explain permissions,
costs, or side effects when they affect the user's choice or next action.

If evidence conflicts or is missing, investigate. Put unresolved factual questions
in the handoff and ask when an answer is necessary. Do not fill gaps with invented
behavior or speculative warnings about the product. Keep verification notes and
source pointers available for review, with only useful public links in the docs.

## Explain results precisely

Preserve distinctions that change how users interpret an eval or red team run:

- The target being tested and the models or services generating tests or grading outputs.
- A failed assertion, a numeric score, and the threshold used to decide pass or fail.
- An execution or grading error and a completed test with a pass or fail result.
- A grader's judgment and the response or trace that supports it.
- Passing the selected tests and establishing security or compliance beyond their scope.

Define a metric's direction and denominator where readers need them to interpret
it. Verify how errors, skipped tests, and retries affect the reported value. Ground
comparisons in the tested configuration and cases, including the grading method.
Do not invent performance, cost, or coverage claims.

Place a material limitation beside the claim it qualifies, explain its consequence,
and give a useful next action when one exists. Avoid repeating generic AI or
security disclaimers on every page.

## Make instructions usable

Lead with a recommended path when one exists. Introduce alternatives at the point
where the reader must choose, with a reason to choose each. Put prerequisites
before the steps that depend on them. After a consequential action, explain how
to recognize success and where to find the output.

Use a concrete example that demonstrates the task. Include the required config
context and any referenced files, or clearly identify a fragment and where it goes.
Use synthetic data and obvious placeholders for credentials and endpoints. Label
sample model output so readers do not expect identical generated text or findings.

Run changed runnable examples with the local build using the repository's testing
instructions. Inspect exported results, including errors and grading, rather than
treating a successful process exit as sufficient verification. State what could
not be verified in the handoff. Troubleshooting should connect an observed symptom
to a diagnostic check or recovery action.

## Cut ideas that only look useful

Review AI drafts for unnecessary ideas before polishing their wording. Remove:

- Generic introductions about why AI testing or security matters.
- Feature praise and capability lists that do not help the reader choose or act.
- Source-file tours in place of explanations of product behavior.
- Generic best practices, invented FAQs, and repeated conclusions.
- Sections added to fill an outline, repeat keywords, or make a short page look complete.
- Speculative caveats, unrelated edge cases, and terminology the product does not use.

A polished sentence does not rescue an unnecessary idea. Search terms should help
readers find useful answers, not determine which extra sections to generate. This
follows the emphasis on scope, evidence, and repetition in
[GitLab's AI documentation guidance](https://docs.gitlab.com/development/documentation/styleguide/#ai-generated-content).

Examples of editorial choices:

| Topic                        | Include                                                                                    | Leave out or link elsewhere                                |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| First eval                   | A working config, credentials it needs, run command, and how to inspect a failed assertion | Every provider and assertion option                        |
| HTTP target                  | Request shape, authentication, response extraction, and how to check the returned output   | A general introduction to HTTP or internal request classes |
| Choose red team plugins      | The risk each relevant plugin tests and an example tied to the application                 | An unfiltered catalog of every security feature            |
| Interpret a red team failure | The attack, target response, grading reason, and what to check next                        | Claims about untested risks or compliance certification    |

## Review before finishing

Read as someone with the stated goal who has not seen your research. Check:

1. Does the page answer their actual question?
2. Can they follow the instructions or explain the concept?
3. Are consequential claims verified for the interface and configuration described?
4. Could missing context cause a wrong action or interpretation?
5. Which paragraphs can be removed without losing useful information?

Apply this standard during drafting and revision. Keep the working brief, review
checklist, and research gaps out of published pages. Briefly report meaningful
verification and unresolved questions in the handoff.
