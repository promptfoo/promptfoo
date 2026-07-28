// Event Types
export type EventStatus = 'upcoming' | 'past';
export type EventType = 'conference' | 'webinar' | 'workshop' | 'party';

export interface EventSpeaker {
  name: string;
  title: string;
  photo?: string;
  linkedin?: string;
}

export interface EventSession {
  title: string;
  description: string;
  date?: string;
  time?: string;
  location?: string;
  speakers: EventSpeaker[];
  recording?: string;
  slides?: string;
}

export interface EventDemo {
  title: string;
  description: string;
  schedule?: string;
}

export interface EventResource {
  title: string;
  description: string;
  type: 'pdf' | 'video' | 'link' | 'report';
  url: string;
}

export interface EventHighlight {
  icon: string;
  title: string;
  description: string;
}

export interface EventLocation {
  venue: string;
  city: string;
  state: string;
  country: string;
}

export interface Event {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  status: EventStatus;
  type: EventType;
  startDate: string;
  endDate: string;
  location: EventLocation;
  booth?: string;
  description: string;
  fullDescription?: string;
  heroImage?: string;
  cardImage?: string;
  highlights?: EventHighlight[];
  demos?: EventDemo[];
  sessions?: EventSession[];
  teamMembers?: EventSpeaker[];
  registrationUrl?: string;
  meetingUrl?: string;
  photos?: string[];
  resources?: EventResource[];
  externalLinks?: { label: string; url: string }[];
  customPageUrl?: string; // Custom dedicated page URL for special events
}

/**
 * Injected by webpack's DefinePlugin (see `site/docusaurus.config.ts`). Declared as
 * possibly-undefined because it does not exist outside a webpack build (vitest, the
 * OG-image generation script); `typeof` guards make the reference safe there.
 */
declare const __SITE_BUILD_TIMESTAMP__: string | undefined;

/**
 * The instant every event status is measured against.
 *
 * This is deliberately a BUILD-TIME snapshot, not a live clock. The site is statically
 * generated, so a bare `new Date()` at module scope resolves to two different instants:
 * build time in the prerendered HTML, and page-load time during hydration. An event that
 * ends between deploys would then be `upcoming` in the crawled HTML and `past` on the
 * client, which reorders the event list and swaps the featured event out from under the
 * reader after hydration.
 *
 * DefinePlugin replaces `__SITE_BUILD_TIMESTAMP__` with the same string literal in both
 * the server and the client bundle, so their initial renders agree. The events index
 * refreshes statuses against the visitor's clock after hydration and at each closing
 * time, so a new deploy is not required to retire a finished event.
 *
 * Outside webpack the identifier is undefined and this falls back to the current time,
 * which is the right behavior for tests and node scripts.
 */
const STATUS_REFERENCE_TIME: number = (() => {
  const injected = typeof __SITE_BUILD_TIMESTAMP__ === 'string' ? __SITE_BUILD_TIMESTAMP__ : null;
  const parsed = injected === null ? Number.NaN : Date.parse(injected);
  return Number.isNaN(parsed) ? Date.now() : parsed;
})();

// Build-safe initial statuses use the shared snapshot. The events page passes the visitor
// clock explicitly when it refreshes those statuses after hydration.
function getEventStatus(endDate: string, referenceTime = STATUS_REFERENCE_TIME): EventStatus {
  return Date.parse(endDate) < referenceTime ? 'past' : 'upcoming';
}

// Event Data
export const events: Event[] = [
  // Future Events (2026)
  {
    id: 'bsides-seattle-2026',
    slug: 'bsides-seattle-2026',
    name: 'Promptfoo at BSides Seattle 2026',
    shortName: 'BSides Seattle 2026',
    status: getEventStatus('2026-02-28T18:00:00-08:00'),
    type: 'conference',
    startDate: '2026-02-27T09:00:00-08:00', // PST
    endDate: '2026-02-28T18:00:00-08:00', // PST
    location: {
      venue: 'Building 92 (Microsoft Campus)',
      city: 'Redmond',
      state: 'WA',
      country: 'USA',
    },
    description:
      'We ran hands-on AI red teaming demos at BSides Seattle, traded hallway-track threat intel, and worked through practical ways to harden LLM apps.',
    fullDescription:
      'Promptfoo joined BSides Seattle for live demos of AI red teaming: prompt injection, jailbreaks, and data exfiltration against real-world LLM apps. People brought their own use cases and left with a testing plan they could run in CI.',
    cardImage: '/img/events/bsides-seattle-2026.jpg',
    heroImage: '/img/events/bsides-seattle-2026.jpg',
    highlights: [
      {
        icon: '🌲',
        title: 'PNW Community',
        description: 'Connected with Seattle security pros',
      },
      {
        icon: '🛠️',
        title: 'Workshops',
        description: 'Hands-on AI security training',
      },
      {
        icon: '🤝',
        title: 'Networking',
        description: 'Met security researchers',
      },
    ],
    customPageUrl: '/events/bsides-seattle-2026',
  },
  {
    id: 'rsa-2026',
    slug: 'rsa-2026',
    name: 'Promptfoo at RSA Conference 2026',
    shortName: 'RSA 2026',
    status: getEventStatus('2026-03-26T18:00:00-07:00'),
    type: 'conference',
    startDate: '2026-03-23T09:00:00-07:00', // PDT
    endDate: '2026-03-26T18:00:00-07:00', // PDT
    location: {
      venue: 'Moscone Center',
      city: 'San Francisco',
      state: 'CA',
      country: 'USA',
    },
    description:
      'We brought executive-ready AI security to RSAC: red teaming, guardrails, and reporting security leadership can act on.',
    fullDescription:
      'Promptfoo was at RSA Conference 2026 showing how security teams build an AI security program that scales: continuous red teaming, runtime guardrails, and reporting that tracks risk reduction over time.',
    cardImage: '/img/events/rsa-2026.jpg',
    heroImage: '/img/events/rsa-2026.jpg',
    highlights: [
      {
        icon: '🎯',
        title: 'Live Demos',
        description: 'AI red teaming attacks, run on the floor',
      },
      {
        icon: '🔒',
        title: 'Risk Reviews',
        description: 'Walked through AI vulnerability findings',
      },
      {
        icon: '🎁',
        title: 'Swag',
        description: 'Limited edition Promptfoo gear',
      },
    ],
    customPageUrl: '/events/rsa-2026',
  },
  {
    id: 'bsides-sf-2026',
    slug: 'bsides-sf-2026',
    name: 'Promptfoo at BSides SF 2026',
    shortName: 'BSides SF 2026',
    status: getEventStatus('2026-03-22T18:00:00-07:00'),
    type: 'conference',
    startDate: '2026-03-21T09:00:00-07:00', // PDT
    endDate: '2026-03-22T18:00:00-07:00', // PDT
    location: {
      venue: 'City View at the Metreon',
      city: 'San Francisco',
      state: 'CA',
      country: 'USA',
    },
    description:
      'Practitioner-led AI security during RSA week. Fast demos, deep conversations, and concrete red teaming takeaways.',
    fullDescription:
      'We compared notes on prompt injection, agent abuse, and the testing workflows security teams actually run. Quick demos first, then the long version: how to reproduce an issue and keep it from coming back.',
    cardImage: '/img/events/bsides-sf-2026.jpg',
    heroImage: '/img/events/bsides-sf-2026.jpg',
    highlights: [
      {
        icon: '🛠️',
        title: 'Workshops',
        description: 'Hands-on AI security training',
      },
      {
        icon: '🤝',
        title: 'Community',
        description: 'Connected with security researchers',
      },
      {
        icon: '🏆',
        title: 'Challenges',
        description: 'AI red teaming CTF challenges',
      },
    ],
    customPageUrl: '/events/bsides-sf-2026',
  },
  {
    id: 'humanx-2026',
    slug: 'humanx-2026',
    name: 'Promptfoo at HumanX 2026',
    shortName: 'HumanX 2026',
    status: getEventStatus('2026-04-09T18:00:00-07:00'),
    type: 'conference',
    startDate: '2026-04-06T09:00:00-07:00', // PDT
    endDate: '2026-04-09T18:00:00-07:00', // PDT
    location: {
      venue: 'Moscone Center South',
      city: 'San Francisco',
      state: 'CA',
      country: 'USA',
    },
    description:
      'For AI leaders shipping real products: how to evaluate and secure LLM apps and agents without slowing teams down.',
    fullDescription:
      'AI is moving fast. Security and evaluation have to keep up. Promptfoo ran live demos on testing and securing LLM features across copilots, RAG, and agents, before launch and continuously in production.',
    cardImage: '/img/events/humanx-2026.jpg',
    heroImage: '/img/events/humanx-2026.jpg',
    highlights: [
      {
        icon: '🧠',
        title: 'AI Leadership',
        description: 'Connected with AI executives and innovators',
      },
      {
        icon: '🎯',
        title: 'Live Demos',
        description: 'AI security testing, in action',
      },
      {
        icon: '🤝',
        title: 'Networking',
        description: 'Met enterprise AI teams',
      },
    ],
    customPageUrl: '/events/humanx-2026',
  },
  {
    id: 'gartner-security-2026',
    slug: 'gartner-security-2026',
    name: 'Promptfoo at Gartner Security & Risk Management Summit 2026',
    shortName: 'Gartner Security 2026',
    status: getEventStatus('2026-06-03T18:00:00-04:00'),
    type: 'conference',
    startDate: '2026-06-01T09:00:00-04:00', // EDT
    endDate: '2026-06-03T18:00:00-04:00', // EDT
    location: {
      venue: 'Gaylord National Resort & Convention Center',
      city: 'National Harbor',
      state: 'MD',
      country: 'USA',
    },
    description:
      'Turning AI risk into a measurable program: briefings on continuous red teaming, guardrails, and executive reporting.',
    fullDescription:
      'We met with teams building AI security programs and mapped the move from ad hoc testing to continuous coverage: automated red teaming, runtime guardrails, and reporting security leadership can track.',
    cardImage: '/img/events/gartner-security-2026.jpg',
    heroImage: '/img/events/gartner-security-2026.jpg',
    highlights: [
      {
        icon: '📊',
        title: 'Analyst Briefings',
        description: 'Met with Gartner analysts',
      },
      {
        icon: '🏢',
        title: 'Enterprise Focus',
        description: 'Solutions for large organizations',
      },
      {
        icon: '🔒',
        title: 'Risk Management',
        description: 'AI governance and compliance',
      },
    ],
    customPageUrl: '/events/gartner-security-2026',
  },
  {
    id: 'blackhat-2026',
    slug: 'blackhat-2026',
    name: 'Promptfoo at Black Hat USA 2026',
    shortName: 'Black Hat 2026',
    status: getEventStatus('2026-08-06T16:00:00-07:00'),
    type: 'conference',
    startDate: '2026-08-01T09:00:00-07:00', // PDT
    endDate: '2026-08-06T16:00:00-07:00', // PDT
    location: {
      venue: 'Mandalay Bay Convention Center',
      city: 'Las Vegas',
      state: 'NV',
      country: 'USA',
    },
    booth: 'Booth #2967',
    description:
      'Promptfoo at OpenAI booth #2967 in the Black Hat Business Hall, Aug 4-6. Live AI agent attacks, full transcripts, and regression tests.',
    fullDescription:
      'Black Hat runs Aug 1-6, with the Business Hall and OpenAI booth #2967 open Aug 4-6. Promptfoo is part of OpenAI. Demos cover real AI application attacks, confirmed findings, and regression tests.',
    cardImage: '/img/events/blackhat-2026.jpg',
    heroImage: '/img/events/blackhat-2026.jpg',
    customPageUrl: '/events/blackhat-2026',
  },
  {
    id: 'defcon-2026',
    slug: 'defcon-2026',
    name: 'Promptfoo at DEF CON 34',
    shortName: 'DEF CON 34',
    status: getEventStatus('2026-08-09T16:00:00-07:00'),
    type: 'conference',
    startDate: '2026-08-06T09:00:00-07:00', // PDT
    endDate: '2026-08-09T16:00:00-07:00', // PDT
    location: {
      venue: 'Las Vegas Convention Center (West Hall)',
      city: 'Las Vegas',
      state: 'NV',
      country: 'USA',
    },
    booth: 'Booth #1412',
    description:
      'Promptfoo at OpenAI booth #1412 in West Hall, Aug 7-9. Live tests show what happens when an AI agent trusts the wrong document or misuses a tool.',
    fullDescription:
      'DEF CON 34 runs Aug 6-9, and its theme is Agency. OpenAI booth #1412 is in West Hall Aug 7-9. Promptfoo is part of OpenAI. Demos cover agent permissions, tool misuse, memory poisoning, and prompt injection.',
    cardImage: '/img/events/defcon-2026.jpg',
    heroImage: '/img/events/defcon-2026.jpg',
    customPageUrl: '/events/defcon-2026',
  },

  // Past Events (2025)
  {
    id: 'scaleup-ai-2025',
    slug: 'scaleup-ai-2025',
    name: 'Promptfoo at ScaleUp:AI 2025',
    shortName: 'ScaleUp:AI 2025',
    status: 'past',
    type: 'webinar',
    startDate: '2025-12-03T09:00:00-05:00', // EST
    endDate: '2025-12-03T18:00:00-05:00', // EST
    location: {
      venue: 'Insight Partners',
      city: 'New York',
      state: 'NY',
      country: 'USA',
    },
    description:
      "Featured in Insight Partners' ScaleUp:AI 2025 Partner Series. CEO Ian Webster discusses how Promptfoo is restoring trust and security in generative AI.",
    fullDescription:
      "Ian Webster, CEO and co-founder of Promptfoo, was featured in Insight Partners' ScaleUp:AI 2025 Partner Series, discussing how Promptfoo is defining the standard for enterprise AI security. The feature explores the company's journey from open-source tool to serving 200,000+ developers and 80+ Fortune 500 companies.",
    cardImage: '/img/events/scaleup-ai-2025.jpg',
    heroImage: '/img/events/scaleup-ai-2025.jpg',
    highlights: [
      {
        icon: '🔐',
        title: 'AI Security',
        description: 'Closing the gap in AI defenses',
      },
      {
        icon: '📈',
        title: 'Growth Story',
        description: 'From open source to enterprise',
      },
      {
        icon: '🔮',
        title: 'Future Vision',
        description: 'Multi-agent security landscape',
      },
    ],
    customPageUrl: '/events/scaleup-ai-2025',
    externalLinks: [
      {
        label: 'Read Full Article',
        url: 'https://www.insightpartners.com/ideas/promptfoo-scale-up-ai/',
      },
    ],
  },
  {
    id: 'blackhat-2025',
    slug: 'blackhat-2025',
    name: 'Promptfoo at Black Hat USA 2025',
    shortName: 'Black Hat 2025',
    status: getEventStatus('2025-08-07T18:00:00-07:00'),
    type: 'conference',
    startDate: '2025-08-05T09:00:00-07:00', // PDT
    endDate: '2025-08-07T18:00:00-07:00', // PDT
    location: {
      venue: 'Mandalay Bay Convention Center',
      city: 'Las Vegas',
      state: 'NV',
      country: 'USA',
    },
    booth: 'Booth #4712',
    description: 'We ran live AI red teaming demos and security consultations at booth #4712.',
    fullDescription:
      'Promptfoo was at Black Hat USA 2025 with live AI red teaming demos, security consultations, and the latest in LLM vulnerability research. We showed how Fortune 500 companies protect their AI applications.',
    cardImage: '/img/events/blackhat-2025.jpg',
    heroImage: '/img/events/blackhat-2025.jpg',
    highlights: [
      {
        icon: '🎯',
        title: 'Live Demos',
        description: 'AI red teaming attacks, run on the floor',
      },
      {
        icon: '🔒',
        title: 'Risk Reviews',
        description: 'Walked through AI vulnerability findings',
      },
      {
        icon: '🎁',
        title: 'Swag',
        description: 'Limited edition Promptfoo gear',
      },
    ],
    demos: [
      {
        title: 'LLM Red Teaming Demo',
        description:
          'Our team jailbroke and exploited a live AI application using prompt injection, data exfiltration, and other OWASP Top 10 attacks.',
        schedule: 'Ran every 30 minutes at the booth',
      },
    ],
    externalLinks: [
      {
        label: 'Arsenal Labs - Aug 6',
        url: 'https://www.blackhat.com/us-25/arsenal/schedule/index.html#promptfoo-44648',
      },
      {
        label: 'Arsenal Labs - Aug 7',
        url: 'https://www.blackhat.com/us-25/arsenal/schedule/#promptfoo-47875',
      },
    ],
    customPageUrl: '/events/blackhat-2025',
  },
  {
    id: 'defcon-2025',
    slug: 'defcon-2025',
    name: 'Promptfoo Party at DEF CON 33',
    shortName: 'DEF CON 33',
    status: getEventStatus('2025-08-09T23:59:00-07:00'),
    type: 'party',
    startDate: '2025-08-09T20:00:00-07:00', // PDT
    endDate: '2025-08-09T23:59:00-07:00', // PDT
    location: {
      venue: 'Millennium FANDOM Bar',
      city: 'Las Vegas',
      state: 'NV',
      country: 'USA',
    },
    description:
      'Hackers, security researchers, and the open source community joined us for the AI security party of DEF CON.',
    fullDescription:
      "Hackers, security researchers, and the open source community joined us for the AI security event of DEF CON at the galaxy's most iconic cantina. Drinks were on us, and the war stories were free.",
    cardImage: '/img/events/defcon-2025.jpg',
    heroImage: '/img/events/defcon-2025.jpg',
    highlights: [
      {
        icon: '🍺',
        title: 'Open Bar',
        description: 'Drinks were on us',
      },
      {
        icon: '⚔️',
        title: 'Mos Eisley Vibes',
        description: 'A party in a wretched hive of scum and villainy',
      },
      {
        icon: '🤖',
        title: 'Community',
        description: 'Networked with security researchers',
      },
    ],
    registrationUrl: 'https://lu.ma/ljm23pj6?tk=qGE9ez&utm_source=pf-web',
    customPageUrl: '/events/defcon-2025',
  },
  {
    id: 'rsa-2025',
    slug: 'rsa-2025',
    name: 'Promptfoo at RSA Conference 2025',
    shortName: 'RSA 2025',
    status: 'past',
    type: 'conference',
    startDate: '2025-04-28T09:00:00-07:00', // PDT
    endDate: '2025-05-01T18:00:00-07:00', // PDT
    location: {
      venue: 'Moscone Center',
      city: 'San Francisco',
      state: 'CA',
      country: 'USA',
    },
    booth: 'Expo Floor',
    description:
      'We showcased AI red teaming capabilities and security solutions at RSA Conference 2025.',
    fullDescription:
      'Promptfoo was at RSA Conference 2025 on the Expo Floor. We demonstrated our AI red teaming platform and connected with security professionals about protecting LLM applications.',
    cardImage: '/img/events/rsa-2025.jpg',
    heroImage: '/img/events/rsa-2025.jpg',
    highlights: [
      {
        icon: '🎯',
        title: 'Live Demos',
        description: 'AI red teaming demonstrations',
      },
      {
        icon: '🤝',
        title: 'Networking',
        description: 'Connected with security leaders',
      },
      {
        icon: '📊',
        title: 'Research',
        description: 'Shared latest security findings',
      },
    ],
    customPageUrl: '/events/rsa-2025',
  },
  {
    id: 'bsides-sf-2025',
    slug: 'bsides-sf-2025',
    name: 'Promptfoo at BSides SF 2025',
    shortName: 'BSides SF 2025',
    status: 'past',
    type: 'conference',
    startDate: '2025-04-26T09:00:00-07:00', // PDT
    endDate: '2025-04-27T18:00:00-07:00', // PDT
    location: {
      venue: 'City View at Metreon',
      city: 'San Francisco',
      state: 'CA',
      country: 'USA',
    },
    description: 'We connected with the security community at BSides SF 2025 during RSA week.',
    fullDescription:
      'Promptfoo joined the BSides SF 2025 community event during RSA week. We participated in security discussions and connected with researchers working on AI security challenges.',
    cardImage: '/img/events/bsides-sf-2025.jpg',
    heroImage: '/img/events/bsides-sf-2025.jpg',
    highlights: [
      {
        icon: '🤝',
        title: 'Community',
        description: 'Connected with security researchers',
      },
      {
        icon: '💬',
        title: 'Discussions',
        description: 'AI security conversations',
      },
    ],
    customPageUrl: '/events/bsides-sf-2025',
  },
  {
    id: 'bsides-seattle-2025',
    slug: 'bsides-seattle-2025',
    name: 'Promptfoo at BSides Seattle 2025',
    shortName: 'BSides Seattle 2025',
    status: 'past',
    type: 'conference',
    startDate: '2025-04-18T09:00:00-07:00', // PDT
    endDate: '2025-04-19T18:00:00-07:00', // PDT
    location: {
      venue: 'Building 92 (Microsoft Visitor Center)',
      city: 'Redmond',
      state: 'WA',
      country: 'USA',
    },
    description: 'We engaged with the Pacific Northwest security community at BSides Seattle 2025.',
    fullDescription:
      'Promptfoo participated in BSides Seattle 2025 at Building 92, engaging with the Pacific Northwest security community and discussing the latest in AI security threats and mitigations.',
    cardImage: '/img/events/bsides-seattle-2025.jpg',
    heroImage: '/img/events/bsides-seattle-2025.jpg',
    highlights: [
      {
        icon: '🌲',
        title: 'PNW Community',
        description: 'Connected with Seattle security pros',
      },
      {
        icon: '🔐',
        title: 'AI Security',
        description: 'Shared LLM security insights',
      },
    ],
    customPageUrl: '/events/bsides-seattle-2025',
  },
  {
    id: 'telecom-talks-2025',
    slug: 'telecom-talks-2025',
    name: 'Promptfoo at Telecom Talks 2025',
    shortName: 'Telecom Talks 2025',
    status: 'past',
    type: 'conference',
    startDate: '2025-04-09T09:00:00-07:00', // PDT
    endDate: '2025-04-09T18:00:00-07:00', // PDT
    location: {
      venue: 'SRI International',
      city: 'Menlo Park',
      state: 'CA',
      country: 'USA',
    },
    description:
      'Ian Webster joined Swisscom Outpost on stage to discuss AI security in telecommunications.',
    fullDescription:
      'Promptfoo CEO Ian Webster joined Swisscom Outpost on stage at Telecom Talks 2025 to discuss the unique challenges of securing AI systems in telecommunications infrastructure.',
    cardImage: '/img/events/telecom-talks-2025.jpg',
    heroImage: '/img/events/telecom-talks-2025.jpg',
    highlights: [
      {
        icon: '📡',
        title: 'Joint Session',
        description: 'On stage with Swisscom Outpost',
      },
      {
        icon: '🌐',
        title: 'Telecom Focus',
        description: 'Carrier-grade AI security',
      },
    ],
    customPageUrl: '/events/telecom-talks-2025',
  },
  {
    id: 'sector-2025',
    slug: 'sector-2025',
    name: 'Promptfoo at SecTor 2025',
    shortName: 'SecTor 2025',
    status: getEventStatus('2025-10-02T18:00:00-04:00'),
    type: 'conference',
    startDate: '2025-09-30T09:00:00-04:00', // EDT
    endDate: '2025-10-02T18:00:00-04:00', // EDT
    location: {
      venue: 'Metro Toronto Convention Centre',
      city: 'Toronto',
      state: 'ON',
      country: 'Canada',
    },
    description:
      "Canada's largest IT security conference. Arsenal demos and enterprise AI security discussions.",
    fullDescription:
      "Promptfoo was selected for the SecTor Arsenal, showcasing open-source AI security tools to Canada's enterprise security community at Canada's largest IT security conference.",
    cardImage: '/img/events/sector-2025.jpg',
    heroImage: '/img/events/sector-2025.jpg',
    highlights: [
      {
        icon: '🍁',
        title: 'Arsenal Listing',
        description: 'Selected for SecTor Arsenal',
      },
      {
        icon: '🇨🇦',
        title: 'Canadian Enterprise',
        description: 'Major banks and government',
      },
    ],
    customPageUrl: '/events/sector-2025',
  },
  {
    id: 'ai-security-summit-2025',
    slug: 'ai-security-summit-2025',
    name: 'Promptfoo at AI Security Summit 2025',
    shortName: 'AI Security Summit 2025',
    status: getEventStatus('2025-10-23T18:00:00-07:00'),
    type: 'conference',
    startDate: '2025-10-22T09:00:00-07:00', // PDT
    endDate: '2025-10-23T18:00:00-07:00', // PDT
    location: {
      venue: 'Westin St. Francis',
      city: 'San Francisco',
      state: 'CA',
      country: 'USA',
    },
    description:
      'Two days of AI security research, expert panels, and cutting-edge demonstrations.',
    fullDescription:
      'Ian Webster joined industry leaders as a panel speaker at AI Security Summit 2025 to discuss the evolving landscape of LLM vulnerabilities and practical defense strategies.',
    cardImage: '/img/events/ai-security-summit-2025.jpg',
    heroImage: '/img/events/ai-security-summit-2025.jpg',
    highlights: [
      {
        icon: '🧠',
        title: 'Panel Speaker',
        description: 'Ian Webster on expert panel',
      },
      {
        icon: '🔬',
        title: 'Research',
        description: 'Latest AI security findings',
      },
    ],
    customPageUrl: '/events/ai-security-summit-2025',
  },
];

// Helper functions
export function getEventsAt(referenceTime: number): Event[] {
  return events.map((event) => {
    const status = getEventStatus(event.endDate, referenceTime);
    return event.status === status ? event : { ...event, status };
  });
}

export function getUpcomingEvents(source: readonly Event[] = events): Event[] {
  return source
    .filter((event) => event.status === 'upcoming')
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

export function getPastEvents(source: readonly Event[] = events): Event[] {
  return source
    .filter((event) => event.status === 'past')
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
}

export function getEventBySlug(slug: string): Event | undefined {
  return events.find((event) => event.slug === slug);
}

export function getEventsByYear(year: number): Event[] {
  return events.filter((event) => getEventYear(event.startDate) === year);
}

export function getEventsByType(type: EventType): Event[] {
  return events.filter((event) => event.type === type);
}

export function getFeaturedEvent(source: readonly Event[] = events): Event | undefined {
  const upcoming = getUpcomingEvents(source);
  return upcoming.length > 0 ? upcoming[0] : undefined;
}

// Event dates carry an explicit offset (e.g. '2026-08-09T18:00:00-07:00'). Handing those to
// `new Date()` and then reading `getDate()` renders the calendar date in the *build host's*
// timezone, so an evening PDT event rolls onto the next day on a UTC CI box. Read the
// calendar date straight off the ISO string instead so the rendered range is stable.
function parseCalendarDate(isoDate: string): Date {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Same reasoning as `parseCalendarDate`: `new Date(iso).getFullYear()` resolves in the build
// host's timezone, so a late-December evening event in a western offset gets filed under the
// following year on a UTC box — and the year filter on /events then hides it.
export function getEventYear(isoDate: string): number {
  return Number(isoDate.slice(0, 4));
}

export function formatEventDate(startDate: string, endDate: string): string {
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = start.getFullYear();

  // Compare calendar dates, not the raw ISO strings: a single-day event still carries
  // different start and end *times* ('T09:00' vs 'T18:00'), so the string compare never
  // matched and the range branch rendered it as "Dec 3-3, 2025".
  if (start.getTime() === end.getTime()) {
    return `${startMonth} ${startDay}, ${year}`;
  }

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}, ${year}`;
  }

  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

export function formatEventLocation(location: EventLocation): string {
  return `${location.city}, ${location.state}`;
}
