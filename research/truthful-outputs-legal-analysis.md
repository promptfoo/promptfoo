# What "Truthful Outputs" Means in Law, Not ML

"Truthful outputs" is not (yet) a settled legal term of art. In U.S. law, "truthful" usually functions as shorthand for "true or, more often, not false or misleading to a reasonable audience," and its legal consequences depend heavily on context: consumer protection (deception), commercial-speech doctrine, and compelled speech.

Below is how the phrase is doing work across the two 2025 AI policy tracks and the two core legal doctrines.

---

## 1) July 2025 "Procurement Guidance": Truthfulness as a Contractual Performance Spec

### The July 2025 EO Frames "Truth" as an Acquisition Requirement, Not a Tort Standard

Executive Order **"Preventing Woke AI in the Federal Government"** (July 23, 2025) makes "truth-seeking" and "ideological neutrality" the two "Unbiased AI Principles" that agencies must require in federal LLM procurements. ([The White House][1])

It defines **Truth-seeking** as:

* LLMs must be **"truthful"** responding to prompts seeking factual info or analysis
* and must "prioritize historical accuracy, scientific inquiry, and objectivity"
* while "acknowledg[ing] uncertainty" when information is incomplete/contradictory ([The White House][1])

And it defines **Ideological Neutrality** as:

* LLMs should be "neutral, nonpartisan tools"
* that do not "manipulate responses in favor of ideological dogmas"
* and developers should not "intentionally encode partisan or ideological judgments" into outputs unless prompted or otherwise readily accessible to the user ([The White House][1])

**Legal meaning in this setting:** This is best understood as **a procurement specification** (a condition of doing business with the federal government), not a general legal standard for what private AI systems "must" say.

That matters because the enforcement mechanism is typically **contractual** (termination, remedies, decommissioning costs shifting to vendor) rather than consumer-protection liability or constitutional litigation. The EO explicitly tells agencies to bake compliance into contract terms. ([The White House][1])

### OMB's Implementing Memo Turns "Truthful Outputs" into Auditability and Feedback Mechanisms

OMB Memorandum **M-26-04** (Dec. 11, 2025) implements the July EO and repeats the same two principles verbatim. ([The White House][2])

It then operationalizes them with procurement controls: contractual requirements for solicitations, updates to agency procurement policies, and processes for end users to report outputs that violate the principles. ([The White House][2])

The memo also hints at what "truthful" will mean in practice by pointing agencies toward documentation and evaluation evidence, including actions "impact[ing] the factuality and grounding of LLM outputs." ([The White House][2])

**Key point:** In procurement, "truthful outputs" functions like **a quality attribute** (accuracy + epistemic humility + neutrality defaults) and a **compliance target** (documentation, evaluations, reporting channels). It is not the FTC's "reasonable consumer" test, and it is not a First Amendment doctrine.

---

## 2) Dec 2025 EO: "Truthful Outputs" as a Trigger for Preemption and Constitutional Arguments

Executive Order **"Ensuring a National Policy Framework for Artificial Intelligence"** (Dec. 11, 2025) uses "truthful outputs" differently. It does not define the phrase. Instead, it deploys it as a **classification tool** for identifying "onerous" state AI laws for federal challenge.

Two key moves:

1. It directs Commerce to identify state laws "that require AI models to **alter their truthful outputs**," and also laws that might compel disclosures that would violate the First Amendment. ([The White House][3])
2. It directs the FTC to issue a policy statement explaining when state laws that require "alterations to the truthful outputs of AI models" are **preempted by the FTC Act's ban on deceptive acts or practices**. ([The White House][3])

**Legal meaning in this setting:** "Truthful outputs" is being used as a **legal wedge**:

* If outputs are "truthful," then state-law mandates to change them can be portrayed as **compelled distortion** (a First Amendment frame) or even as forced "deceptive conduct" (a federal preemption frame via Section 5 of the FTC Act). ([The White House][3])

Because the EO doesn't define "truthful outputs," the term's meaning is doing a lot of rhetorical work. In practice, it will likely be argued in litigation using the *nearest available legal analogs*:

* "truthful and non-misleading" (FTC / commercial speech)
* "editorial judgment" and "compelled speech" (First Amendment)

---

## 3) FTC Act Deception: "Truthful" Means "Not Misleading," and Omissions Matter

Section 5 of the FTC Act declares "unfair or deceptive acts or practices" unlawful. ([Legal Information Institute][4])

The FTC's **Deception Policy Statement** (1983) sets out the classic 3-part framework:

* A "representation, omission or practice" that is **likely to mislead** the consumer
* judged from the perspective of a consumer acting **reasonably** under the circumstances
* and the representation/omission must be **material** (likely to affect consumer conduct/decision)

**How that maps to "truthful outputs":**

* In FTC-land, "truthful" is rarely metaphysical. It is about the **net impression** and whether the output (or the way the product is marketed) misleads a reasonable user in a material way.
* "Truthfulness" includes avoiding **misleading omissions**. The Deception Policy Statement treats omissions as deception when disclosure is necessary to prevent being misleading.

**So the conceptual translation is:**

> A "truthful output," legally, is one that does not create a materially misleading net impression for a reasonable user in context.

That definition has two implications that cut in opposite directions from the Dec 2025 EO's framing:

* If a vendor markets an LLM as "accurate," "objective," "unbiased," etc., then **hallucinated or slanted outputs** can become an FTC problem when they are likely to mislead and material. The "output" is functionally a representation.
* Conversely, state laws requiring **disclosures** (for example, that an output is AI-generated, or that reliability is uncertain) can be defended as **anti-deception** measures, not as "mandating deceptive conduct," depending on what they require and how they are framed.

That tension is exactly why the Dec 2025 EO's planned FTC "preemption" move is conceptually important: it tries to invert the usual orientation of deception law, arguing that *state-required modifications* can themselves force deception. ([The White House][3])

---

## 4) First Amendment Compelled Speech: "Truthful" Matters, But It Doesn't End the Analysis

### The Baseline Rule: Government Generally Can't Force You to Carry or Affirm Messages

The compelled-speech line of cases treats mandatory inclusion of someone else's message as constitutionally suspect:

* **Miami Herald v. Tornillo**: a newspaper can't be forced to publish a reply; that interferes with editorial judgment. ([Justia Law][5])
* **Wooley v. Maynard**: state can't force individuals to display an ideological motto on a license plate. ([Justia Law][6])
* **Pacific Gas & Electric v. PUC**: state can't force a private entity to carry a third party's speech in its own envelope; it alters the speaker's message. ([Justia Law][7])

These cases are the constitutional backdrop for the Dec 2025 EO's idea that state laws forcing models to "alter" outputs can be cast as compelled speech. ([The White House][3])

### The Key Exception: Compelled Commercial Disclosures Can Be Allowed (Zauderer), But Only If Narrowly Factual

**Zauderer** is the doctrinal bridge between compelled speech and deception prevention. It distinguishes disclosure mandates from outright bans and holds that, in commercial advertising, a state can require "purely factual and uncontroversial" information about terms of service availability, so long as the requirement is reasonably related to preventing deception. ([Justia Law][8])

But the Supreme Court later emphasized limits. In **NIFLA v. Becerra**, the Court rejected applying Zauderer to compelled notices that were not limited to "purely factual and uncontroversial" information about the terms of services, and treated the notice as content-based compelled speech. ([Legal Information Institute][9])

### Why This Matters Specifically for AI "Output" Rules

Many AI-related state requirements will fall into one of two buckets:

1. **Disclosure/labeling rules** (for example, "this is synthetic media," "this chatbot is automated," "limitations exist").
   * These are most plausibly argued under Zauderer if treated as commercial or consumer-protection disclosures. ([Justia Law][8])

2. **Substantive output-shaping rules** (for example, "must present X viewpoint," "must downrank Y viewpoint," "must equalize outcomes across groups," "must refuse certain truthful statements").
   * These look more like Tornillo/Wooley/PG&E problems because they "alter the content" of the speaker's message. ([Justia Law][5])

A modern wrinkle: whether algorithmic curation or generation counts as the platform's own protected expression. The Supreme Court's **Moody v. NetChoice** syllabus describes platforms' personalized feeds as driven by "prioritization of content, achieved through algorithms," and treats compelled changes to those choices as intruding on editorial discretion.

That is not a generative-AI case, but it is a strong precedent for treating algorithmic selection/ranking as part of protected expressive activity.

---

## 5) Putting It Together: What "Truthful Outputs" Means in Law Across the Four Frames

Here is the clean conceptual crosswalk:

### July 2025 Procurement EO / OMB Guidance

**"Truthful outputs"** = *contractible quality behavior*: accuracy, objectivity, and explicit uncertainty handling, plus a default of ideological neutrality unless the user asks otherwise. ([The White House][1])

**Enforcement lever:** contracts and procurement policy. ([The White House][2])

### Dec 2025 EO

**"Truthful outputs"** = *a constitutional and preemption trigger*: state laws that change "truthful outputs" are framed as forcing distortion (First Amendment) and possibly mandating deception (FTC Act). ([The White House][3])

**Enforcement lever:** federal litigation task force + agency evaluations + FTC policy statement directive. ([The White House][3])

### FTC Deception Doctrine

**"Truthful"** = *not materially misleading in context*, including not misleading by omission, judged by a reasonable consumer standard.

### First Amendment Compelled Speech

**"Truthful"** helps only sometimes:

* Compelling "purely factual and uncontroversial" disclosures in commercial contexts can be permissible (Zauderer). ([Justia Law][8])
* Compelling substantive viewpoint-bearing content or forcing a speaker to carry messages is usually suspect (Tornillo/Wooley/PG&E). ([Justia Law][5])
* Algorithmic curation is increasingly treated as editorial discretion (Moody).

---

## 6) Why It Matters as the Conceptual Spine

The phrase "truthful outputs" is doing unification work across three legal domains that normally do not collapse into one another:

### 1. It Turns Model Behavior into Speech Doctrine

By labeling baseline outputs as "truthful," the Dec 2025 EO invites courts to see output mandates as compelled speech or forced alteration of protected expression. ([The White House][3])

### 2. It Reframes Some State AI Rules as "Deception Mandates"

The EO's FTC preemption move depends on equating output-shaping with compelled misrepresentation, even though classic deception law usually treats disclosures as a remedy. ([The White House][3])

### 3. It Blurs Factual Accuracy and Ideological Dispute

Procurement guidance defines truth-seeking as objectivity and acknowledging uncertainty, while also pairing it with "ideological neutrality." That coupling creates ambiguity: what is "truth" versus a contested value judgment? ([The White House][1])

That ambiguity is legally important because compelled speech doctrine and Zauderer hinge on whether required content is "purely factual and uncontroversial." ([Justia Law][8])

---

## One-Sentence "Spine" Definition

> In law, "truthful outputs" is best read as a proxy for "non-misleading speech," and it becomes powerful because it can be litigated as either (a) consumer deception or (b) compelled alteration of protected expression, depending on whether the government is acting as purchaser (procurement) or regulator (state law).

---

## References

[1]: https://www.whitehouse.gov/presidential-actions/2025/07/preventing-woke-ai-in-the-federal-government/ "Preventing Woke AI in the Federal Government – The White House"
[2]: https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf "Increasing Public Trust in Artificial Intelligence Through Unbiased AI Principles"
[3]: https://www.whitehouse.gov/presidential-actions/2025/12/eliminating-state-law-obstruction-of-national-artificial-intelligence-policy/ "Ensuring a National Policy Framework for Artificial Intelligence – The White House"
[4]: https://www.law.cornell.edu/uscode/text/15/45 "15 U.S. Code § 45 - Unfair methods of competition unlawful; prevention by Commission | U.S. Code | US Law | LII / Legal Information Institute"
[5]: https://supreme.justia.com/cases/federal/us/418/241/?utm_source=chatgpt.com "Miami Herald Pub. Co. v. Tornillo | 418 U.S. 241 (1974)"
[6]: https://supreme.justia.com/cases/federal/us/430/705/?utm_source=chatgpt.com "Wooley v. Maynard | 430 U.S. 705 (1977)"
[7]: https://supreme.justia.com/cases/federal/us/475/1/?utm_source=chatgpt.com "PG&E v. Public Utilities Comm'n | 475 U.S. 1 (1986)"
[8]: https://supreme.justia.com/cases/federal/us/471/626/ "Zauderer v. Office of Disc. Counsel | 471 U.S. 626 (1985) | Justia U.S. Supreme Court Center"
[9]: https://www.law.cornell.edu/supremecourt/text/16-1140 "NATIONAL INSTITUTE OF FAMILY AND LIFE ADVOCATES v. BECERRA | Supreme Court | US Law | LII / Legal Information Institute"
