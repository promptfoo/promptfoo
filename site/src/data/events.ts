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
    id: 'rsa-2026',
    slug: 'rsa-2026',
    name: 'Promptfoo at RSA Conference 2026',
    shortName: 'RSA 2026',
    status: 'upcoming',
    type: 'conference',
    startDate: '2026-04-27',
    endDate: '2026-04-30',
    location: {
      venue: 'Moscone Center',
      city: 'San Francisco',
      state: 'CA',
      country: 'USA',
    },
    description:
      'Meet the Promptfoo team at RSA Conference 2026. See live AI red teaming demos and learn how enterprises secure their AI applications.',
    fullDescription:
      'Join us at RSA Conference 2026 for live AI red teaming demonstrations, security consultations, and the latest in LLM vulnerability research. Meet our security experts and see how Fortune 500 companies protect their AI applications.',
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
    startDate: '2026-04-25',
    endDate: '2026-04-26',
    location: {
      venue: 'City View at Metreon',
      city: 'San Francisco',
      state: 'CA',
      country: 'USA',
    },
    description:
      'Join us at BSides SF 2026 for hands-on AI security workshops and community discussions.',
    fullDescription:
      'Connect with the Promptfoo team and the security community at BSides SF 2026. Experience hands-on workshops, participate in AI security challenges, and learn about the latest threats to LLM applications.',
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

  // Past Events (2025)
  {
    id: 'scaleup-ai-2025',
    slug: 'scaleup-ai-2025',
    name: 'Promptfoo at ScaleUp:AI 2025',
    shortName: 'ScaleUp:AI 2025',
    status: 'past',
    type: 'webinar',
    startDate: '2025-12-03',
    endDate: '2025-12-03',
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
        url: 'https://www.insightpartners.com/ideas/scaleup-ai-promptfoo-trust-security-generative-ai/',
      },
    ],
  },
  {
    id: 'blackhat-2025',
    slug: 'blackhat-2025',
    name: 'Promptfoo at Black Hat USA 2025',
    shortName: 'Black Hat 2025',
    status: getEventStatus('2025-08-07'),
    type: 'conference',
    startDate: '2025-08-05',
    endDate: '2025-08-07',
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
  },
  {
    id: 'defcon-2025',
    slug: 'defcon-2025',
    name: 'Promptfoo Party at DEF CON 33',
    shortName: 'DEF CON 33',
    status: getEventStatus('2025-08-09'),
    type: 'party',
    startDate: '2025-08-09',
    endDate: '2025-08-09',
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
  },
  {
    id: 'rsa-2025',
    slug: 'rsa-2025',
    name: 'Promptfoo at RSA Conference 2025',
    shortName: 'RSA 2025',
    status: 'past',
    type: 'conference',
    startDate: '2025-04-28',
    endDate: '2025-05-01',
    location: {
      venue: 'Moscone Center',
      city: 'San Francisco',
      state: 'CA',
      country: 'USA',
    },
    booth: 'Early Stage Expo',
    description:
      'We showcased AI red teaming capabilities and security solutions at RSA Conference 2025.',
    fullDescription:
      'Promptfoo was at RSA Conference 2025 in the Early Stage Expo. We demonstrated our AI red teaming platform and connected with security professionals about protecting LLM applications.',
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
    startDate: '2025-04-26',
    endDate: '2025-04-27',
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
    startDate: '2025-04-18',
    endDate: '2025-04-19',
    location: {
      venue: 'The Collective Seattle',
      city: 'Seattle',
      state: 'WA',
      country: 'USA',
    },
    description: 'We engaged with the Pacific Northwest security community at BSides Seattle 2025.',
    fullDescription:
      'Promptfoo participated in BSides Seattle 2025, engaging with the Pacific Northwest security community and discussing the latest in AI security threats and mitigations.',
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
    startDate: '2025-04-09',
    endDate: '2025-04-09',
    location: {
      venue: 'SRI International',
      city: 'Menlo Park',
      state: 'CA',
      country: 'USA',
    },
    description:
      'Ian Webster joined Swisscom on stage to discuss AI security in telecommunications.',
    fullDescription:
      'Promptfoo CEO Ian Webster joined Swisscom on stage at Telecom Talks 2025 to discuss the unique challenges of securing AI systems in telecommunications infrastructure.',
    cardImage: '/img/events/telecom-talks-2025.jpg',
    heroImage: '/img/events/telecom-talks-2025.jpg',
    highlights: [
      {
        icon: '📡',
        title: 'Joint Session',
        description: 'On stage with Swisscom',
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
    status: getEventStatus('2025-10-02'),
    type: 'conference',
    startDate: '2025-09-30',
    endDate: '2025-10-02',
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
    status: getEventStatus('2025-10-23'),
    type: 'conference',
    startDate: '2025-10-22',
    endDate: '2025-10-23',
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
