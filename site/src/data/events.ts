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

// Helper to determine event status based on date
function getEventStatus(endDate: string): EventStatus {
  const today = new Date();
  const eventEnd = new Date(endDate);
  return eventEnd < today ? 'past' : 'upcoming';
}

// Event Data
export const events: Event[] = [
  // Future Events (2026)
  {
    id: 'bsides-seattle-2026',
    slug: 'bsides-seattle-2026',
    name: 'Promptfoo at BSides Seattle 2026',
    shortName: 'BSides Seattle 2026',
    status: 'upcoming',
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
      'Meet the Promptfoo team at BSides Seattle for hands-on AI red teaming demos, hallway-track threat intel, and practical ways to harden LLM apps.',
    fullDescription:
      'Meet the Promptfoo team for live demos of AI red teaming: prompt injection, jailbreaks, and data exfiltration against real-world LLM apps. Bring your use case and leave with a testing plan you can run in CI.',
    cardImage: '/img/events/bsides-seattle-2026.jpg',
    heroImage: '/img/events/bsides-seattle-2026.jpg',
    highlights: [
      {
        icon: '🌲',
        title: 'PNW Community',
        description: 'Connect with Seattle security pros',
      },
      {
        icon: '🛠️',
        title: 'Workshops',
        description: 'Hands-on AI security training',
      },
      {
        icon: '🤝',
        title: 'Networking',
        description: 'Meet security researchers',
      },
    ],
    customPageUrl: '/events/bsides-seattle-2026',
  },
  {
    id: 'rsa-2026',
    slug: 'rsa-2026',
    name: 'Promptfoo at RSA Conference 2026',
    shortName: 'RSA 2026',
    status: 'upcoming',
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
      'Meet Promptfoo at RSAC for executive-ready AI security: red teaming, guardrails, and reporting your leadership can act on.',
    fullDescription:
      'Meet Promptfoo to see how security teams build an AI security program that scales: continuous red teaming, runtime guardrails, and reporting that tracks risk reduction over time.',
    cardImage: '/img/events/rsa-2026.jpg',
    heroImage: '/img/events/rsa-2026.jpg',
    highlights: [
      {
        icon: '🎯',
        title: 'Live Demos',
        description: 'Watch AI red teaming attacks in real-time',
      },
      {
        icon: '🔒',
        title: 'Free Assessment',
        description: 'Get a complimentary AI vulnerability assessment',
      },
      {
        icon: '🎁',
        title: 'Exclusive Swag',
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
    status: 'upcoming',
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
      'Stop by to compare notes on prompt injection, agent abuse, and the testing workflows security teams actually run. We show quick demos, then go deep on how to reproduce issues and prevent regressions.',
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
        description: 'Connect with security researchers',
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
    status: 'upcoming',
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
      'For AI leaders shipping real products: see how to evaluate and secure LLM apps and agents without slowing teams down.',
    fullDescription:
      'AI is moving fast. Security and evaluation need to keep up. Meet Promptfoo for live demos on testing and securing LLM features across copilots, RAG, and agents, before launch and continuously in production.',
    cardImage: '/img/events/humanx-2026.jpg',
    heroImage: '/img/events/humanx-2026.jpg',
    highlights: [
      {
        icon: '🧠',
        title: 'AI Leadership',
        description: 'Connect with AI executives and innovators',
      },
      {
        icon: '🎯',
        title: 'Live Demos',
        description: 'See AI security testing in action',
      },
      {
        icon: '🤝',
        title: 'Networking',
        description: 'Meet enterprise AI teams',
      },
    ],
    customPageUrl: '/events/humanx-2026',
  },
  {
    id: 'gartner-security-2026',
    slug: 'gartner-security-2026',
    name: 'Promptfoo at Gartner Security & Risk Management Summit 2026',
    shortName: 'Gartner Security 2026',
    status: 'upcoming',
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
      'Turn AI risk into a measurable program. Meet Promptfoo for briefings on continuous red teaming, guardrails, and executive reporting.',
    fullDescription:
      'If you are building an AI security program, we can help you move from ad hoc testing to continuous coverage. Meet Promptfoo for demos of automated red teaming, runtime guardrails, and reporting security leadership can track.',
    cardImage: '/img/events/gartner-security-2026.jpg',
    heroImage: '/img/events/gartner-security-2026.jpg',
    highlights: [
      {
        icon: '📊',
        title: 'Analyst Briefings',
        description: 'Meet with Gartner analysts',
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
    status: 'upcoming',
    type: 'conference',
    startDate: '2026-08-01T09:00:00-07:00', // PDT
    endDate: '2026-08-06T18:00:00-07:00', // PDT
    location: {
      venue: 'Mandalay Bay Convention Center',
      city: 'Las Vegas',
      state: 'NV',
      country: 'USA',
    },
    description:
      'See live AI attack demos at Black Hat USA: prompt injection, jailbreaks, data exfiltration, and how to automate LLM red teaming at scale.',
    fullDescription:
      'Join us at Black Hat USA to see how Promptfoo helps security teams find and fix LLM vulnerabilities with automated red teaming, repeatable evals, and production guardrails.',
    cardImage: '/img/events/blackhat-2026.jpg',
    heroImage: '/img/events/blackhat-2026.jpg',
    highlights: [
      {
        icon: '🎯',
        title: 'Attack Demos',
        description: 'Prompt injection, jailbreaks, data exfiltration',
      },
      {
        icon: '🤖',
        title: 'Red Team Automation',
        description: 'Generate application-specific attack variants',
      },
      {
        icon: '🔄',
        title: 'CI/CD Integration',
        description: 'Turn findings into regression tests',
      },
    ],
    customPageUrl: '/events/blackhat-2026',
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
    description: 'Meet us at booth #4712 for live AI red teaming demos and security consultations.',
    fullDescription:
      'Join us at Black Hat USA 2025 for live AI red teaming demos, security consultations, and the latest in LLM vulnerability research. Visit our booth to see how Fortune 500 companies protect their AI applications.',
    cardImage: '/img/events/blackhat-2025.jpg',
    heroImage: '/img/events/blackhat-2025.jpg',
    highlights: [
      {
        icon: '🎯',
        title: 'Live Demos',
        description: 'Watch AI red teaming attacks in real-time',
      },
      {
        icon: '🔒',
        title: 'Free Scan',
        description: 'Get a complimentary AI vulnerability assessment',
      },
      {
        icon: '🎁',
        title: 'Exclusive Swag',
        description: 'Limited edition Promptfoo gear',
      },
    ],
    demos: [
      {
        title: 'LLM Red Teaming Demo',
        description:
          'Watch our team attempt to jailbreak and exploit a live AI application using prompt injection, data exfiltration, and other OWASP Top 10 attacks.',
        schedule: 'Running every 30 minutes at the booth',
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
    meetingUrl: 'https://cal.com/team/promptfoo/promptfoo-at-blackhat',
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
      'Join hackers, security researchers, and the open source community for the AI security party of DEF CON.',
    fullDescription:
      "Join hackers, security researchers, and the open source community for the AI security event of DEF CON at the galaxy's most iconic cantina. Free drinks, great vibes, and security war stories.",
    cardImage: '/img/events/defcon-2025.jpg',
    heroImage: '/img/events/defcon-2025.jpg',
    highlights: [
      {
        icon: '🍺',
        title: 'Open Bar',
        description: 'Free drinks on us',
      },
      {
        icon: '⚔️',
        title: 'Mos Eisley Vibes',
        description: 'Party in a wretched hive of scum and villainy',
      },
      {
        icon: '🤖',
        title: 'Community',
        description: 'Network with security researchers',
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
export function getUpcomingEvents(): Event[] {
  return events
    .filter((event) => event.status === 'upcoming')
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

export function getPastEvents(): Event[] {
  return events
    .filter((event) => event.status === 'past')
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
}

export function getEventBySlug(slug: string): Event | undefined {
  return events.find((event) => event.slug === slug);
}

export function getEventsByYear(year: number): Event[] {
  return events.filter((event) => new Date(event.startDate).getFullYear() === year);
}

export function getEventsByType(type: EventType): Event[] {
  return events.filter((event) => event.type === type);
}

export function getFeaturedEvent(): Event | undefined {
  const upcoming = getUpcomingEvents();
  return upcoming.length > 0 ? upcoming[0] : undefined;
}

export function formatEventDate(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = start.getFullYear();

  if (startDate === endDate) {
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
