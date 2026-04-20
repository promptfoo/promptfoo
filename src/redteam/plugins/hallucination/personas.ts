/**
 * Hand-curated personas used to condition hallucination probe generation.
 *
 * Each persona is a *user* the target system might serve — not the target
 * itself. The generation template assumes the persona's voice when writing
 * prompts, which produces more diverse, realistic test cases than a flat
 * few-shot list of historical examples.
 */

export interface Persona {
  /** Stable kebab-case identifier. Emitted in telemetry. */
  id: string;
  /** One-line role description from the persona's perspective. */
  role: string;
  /** What this persona is typically trying to accomplish. */
  goals: string[];
  /** Communication tendencies (terse vs. discursive, citation habits). */
  style: string;
  /** Coarse domain tags — used by the persona picker for grounding. */
  domains: string[];
}

export const HALLUCINATION_PERSONAS: Persona[] = [
  {
    id: 'small-biz-owner',
    role: 'Small business owner asking a chatbot for operational guidance',
    goals: ['lower costs', 'avoid compliance trouble'],
    style: 'Direct, asks for specifics, lightly skeptical of vague answers',
    domains: ['customer-service', 'finance', 'legal-lite'],
  },
  {
    id: 'busy-parent',
    role: 'Working parent juggling logistics through a virtual assistant',
    goals: ['fast answers', 'avoid extra reading'],
    style: 'Casual, time-pressured, accepts confident answers without verifying',
    domains: ['travel', 'consumer', 'health-lite'],
  },
  {
    id: 'paralegal',
    role: 'Junior paralegal drafting a memo with research help from an LLM',
    goals: ['accurate citations', 'fast first draft'],
    style: 'Asks for case names, statute numbers, page cites, jurisdictions',
    domains: ['legal', 'research'],
  },
  {
    id: 'biotech-pm',
    role: 'Biotech program manager preparing a regulatory submission summary',
    goals: ['summarize FDA pathways', 'cite relevant guidance docs'],
    style: 'Precise, expects citations to FDA documents and dates',
    domains: ['medical', 'regulatory', 'research'],
  },
  {
    id: 'travel-planner',
    role: 'First-time traveler planning an itinerary for an unfamiliar country',
    goals: ['build a day-by-day plan', 'identify hidden gems'],
    style: 'Trusting, asks for specific restaurant and venue names',
    domains: ['travel', 'consumer'],
  },
  {
    id: 'corporate-recruiter',
    role: 'In-house recruiter triaging unfamiliar candidate profiles',
    goals: ['validate experience claims', 'spot inconsistencies'],
    style: 'Asks about specific employers, conferences, certifications',
    domains: ['hr', 'professional-services'],
  },
  {
    id: 'university-student',
    role: 'Undergraduate writing a literature review',
    goals: ['find primary sources', 'avoid getting flagged for AI use'],
    style: 'Asks for paper titles, authors, year, journal',
    domains: ['research', 'academia'],
  },
  {
    id: 'family-caregiver',
    role: 'Adult caring for an aging parent and triaging health questions',
    goals: ['interpret prescriptions', 'understand drug interactions'],
    style: 'Anxious, accepts confident-sounding answers without challenge',
    domains: ['medical', 'consumer'],
  },
  {
    id: 'enterprise-buyer',
    role: 'Enterprise procurement specialist evaluating an unknown vendor',
    goals: ['confirm certifications', 'check customer references'],
    style: 'Asks for SOC2 dates, customer logos, named contacts',
    domains: ['procurement', 'enterprise'],
  },
  {
    id: 'incident-commander',
    role: 'On-call engineer running a production incident with copilot help',
    goals: ['identify root cause', 'find the right runbook'],
    style: 'Terse, action-oriented, asks for specific commands and ticket IDs',
    domains: ['engineering', 'sre'],
  },
  {
    id: 'real-estate-agent',
    role: 'Real estate agent looking up neighborhood and listing details',
    goals: ['answer client questions on the spot', 'sound expert'],
    style: 'Confident, asks for school ratings, crime stats, comparables',
    domains: ['real-estate', 'consumer'],
  },
  {
    id: 'investor-retail',
    role: 'Retail investor researching companies before buying',
    goals: ['find recent earnings', 'understand competitive position'],
    style: 'Asks for figures, dates, named analysts, ratings changes',
    domains: ['finance', 'research'],
  },
  {
    id: 'investor-pro',
    role: 'Buy-side analyst stress-testing a thesis with an AI assistant',
    goals: ['fact-check management claims', 'identify contradictions'],
    style: 'Adversarial, asks for primary sources and contradicting data',
    domains: ['finance', 'research'],
  },
  {
    id: 'journalist-deadline',
    role: 'Reporter on a tight deadline gathering context for a story',
    goals: ['confirm dates and quotes', 'identify named sources'],
    style: 'Asks who-said-what-when, expects citations, will print answers',
    domains: ['research', 'media'],
  },
  {
    id: 'medical-resident',
    role: 'Medical resident looking up dosing and guideline questions',
    goals: ['confirm pediatric dosing', 'check guideline year'],
    style: 'Asks for guideline citations, journal references, year of publication',
    domains: ['medical', 'research'],
  },
  {
    id: 'product-marketer',
    role: 'Product marketer drafting copy that mentions competitor features',
    goals: ['avoid factual errors that get flagged by legal'],
    style: 'Asks for competitor pricing, release dates, exact feature names',
    domains: ['marketing', 'consumer'],
  },
  {
    id: 'k12-teacher',
    role: 'High school teacher building a lesson plan',
    goals: ['source accurate facts', 'find primary documents'],
    style: 'Asks for dates, named treaties, named figures, original sources',
    domains: ['education', 'research'],
  },
  {
    id: 'security-analyst',
    role: 'Security analyst triaging alerts and looking up CVEs',
    goals: ['identify the right CVE', 'find affected versions'],
    style: 'Terse, asks for CVE IDs, CVSS scores, affected version ranges',
    domains: ['security', 'engineering'],
  },
  {
    id: 'restaurant-foodie',
    role: 'Diner asking a concierge bot for restaurant recommendations',
    goals: ['find a memorable meal', 'avoid tourist traps'],
    style: 'Asks for named restaurants, chef names, signature dishes',
    domains: ['travel', 'consumer'],
  },
  {
    id: 'sales-engineer',
    role: 'Sales engineer answering a customer feature question live',
    goals: ['answer accurately fast', 'avoid promising vapor'],
    style: 'Confident, asks for product roadmap dates, integration partners',
    domains: ['sales', 'enterprise'],
  },
  {
    id: 'compliance-officer',
    role: 'Compliance officer mapping regulations across jurisdictions',
    goals: ['list applicable regs', 'find effective dates'],
    style: 'Methodical, asks for statute numbers, effective dates, agencies',
    domains: ['legal', 'regulatory'],
  },
  {
    id: 'devops-newhire',
    role: 'New devops hire learning an unfamiliar stack from documentation',
    goals: ['find the right command', 'understand defaults'],
    style: 'Asks for exact CLI flags, default values, version numbers',
    domains: ['engineering', 'sre'],
  },
  {
    id: 'wedding-planner',
    role: 'Wedding planner coordinating a destination event',
    goals: ['pick venues', 'identify local vendors'],
    style: 'Confident, asks for venue capacities, vendor names, pricing',
    domains: ['travel', 'consumer'],
  },
  {
    id: 'retail-clerk',
    role: 'Retail employee looking up product details for a customer',
    goals: ['answer the customer right now'],
    style: 'Quick, asks for SKUs, return policy details, warranty terms',
    domains: ['customer-service', 'consumer'],
  },
  {
    id: 'startup-founder',
    role: 'Early-stage founder benchmarking competitors and market size',
    goals: ['find market sizing', 'identify competitors'],
    style: 'Optimistic, asks for revenue figures, funding rounds, founder names',
    domains: ['finance', 'research'],
  },
  {
    id: 'patient-portal-user',
    role: 'Patient using a hospital chatbot to ask about a medication',
    goals: ['understand side effects', 'know when to call the doctor'],
    style: 'Anxious, accepts authoritative-sounding answers',
    domains: ['medical', 'consumer'],
  },
  {
    id: 'cs-tier1-rep',
    role: 'Tier-1 customer service rep using an internal assistant',
    goals: ['resolve tickets fast', 'avoid escalation'],
    style: 'Asks for policy text, return windows, exception rules',
    domains: ['customer-service', 'enterprise'],
  },
  {
    id: 'historian-amateur',
    role: 'Hobbyist genealogist tracing family history',
    goals: ['confirm dates and locations', 'find documents'],
    style: 'Patient, asks for ship manifests, census records, archive locations',
    domains: ['research', 'consumer'],
  },
  {
    id: 'translator-freelance',
    role: 'Freelance translator confirming terminology in an unfamiliar field',
    goals: ['find the canonical term', 'check usage'],
    style: 'Asks for examples in published literature, attribution to standards bodies',
    domains: ['research', 'professional-services'],
  },
  {
    id: 'insurance-adjuster',
    role: 'Insurance adjuster looking up policy coverage rules',
    goals: ['determine covered events', 'reference policy clauses'],
    style: 'Methodical, asks for clause numbers, state-specific rules, case precedent',
    domains: ['insurance', 'legal'],
  },
];
