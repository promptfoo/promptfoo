import Cal, { getCalApi } from '@calcom/embed-react';
import React, { useState, useEffect } from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { useColorMode } from '@docusaurus/theme-common';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import styles from './events.module.css';

// Define the event type for better TypeScript support
interface ConferenceEvent {
  id: number;
  name: string;
  displayDate: string; // Human-readable date (e.g., "April 26-27, 2025")
  startDate: string; // ISO format date (e.g., "2025-04-26")
  endDate: string; // ISO format date (e.g., "2025-04-27")
  location: string;
  venue?: string;
  description: string;
  logo: string;
  website: string;
  meetingLink: string;
  calendarLink: string;
  boothNumber?: string;
  conferenceType: 'security' | 'ai' | 'other';
  status: 'upcoming' | 'ongoing' | 'past';
  structuredData: any;
}

// Event data with real security conferences
const upcomingEvents: ConferenceEvent[] = [
  {
    id: 1,
    name: 'DEF CON 33',
    displayDate: 'August 7-10, 2025',
    startDate: '2025-08-07',
    endDate: '2025-08-10',
    location: 'Las Vegas, NV',
    venue: 'Las Vegas Convention Center',
    description:
      "Join the promptfoo team at DEF CON 33 to learn how our tools help identify and mitigate security vulnerabilities in LLM implementations. Visit our booth to see demonstrations of our red teaming and vulnerability scanning capabilities for AI systems. DEF CON is the world's largest hacking conference, bringing together security professionals, researchers, and enthusiasts.",
    logo: '/img/events/defcon-33.png',
    website: 'https://defcon.org/',
    meetingLink: 'https://calendly.com/promptfoo/defcon-33',
    calendarLink: 'team/promptfoo/defcon33',
    boothNumber: 'TBD',
    conferenceType: 'security',
    status: 'upcoming',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'DEF CON 33',
      startDate: '2025-08-07',
      endDate: '2025-08-10',
      eventStatus: 'https://schema.org/EventScheduled',
      location: {
        '@type': 'Place',
        name: 'Las Vegas Convention Center',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Las Vegas',
          addressRegion: 'NV',
          addressCountry: 'US',
        },
      },
      image: ['https://www.promptfoo.dev/img/events/defcon-33.png'],
      description:
        'Join the promptfoo team at DEF CON 33 to learn how our tools help identify and mitigate security vulnerabilities in LLM implementations.',
      organizer: {
        '@type': 'Organization',
        name: 'DEF CON',
        url: 'https://defcon.org/',
      },
    },
  },
  {
    id: 2,
    name: 'BSides SF 2025',
    displayDate: 'April 26-27, 2025',
    startDate: '2025-04-26',
    endDate: '2025-04-27',
    location: 'San Francisco, CA',
    venue: 'City View at Metreon',
    description:
      "Meet the promptfoo team at BSides SF 2025 where we'll showcase how our tools can help security professionals evaluate and test LLM applications for vulnerabilities and ensure they meet security standards. BSides SF is a non-profit, community-driven information security conference with this year's theme 'Here Be Dragons'.",
    logo: '/img/events/bsides-sf-2025.png',
    website: 'https://bsidessf.org/',
    meetingLink: 'https://calendly.com/promptfoo/bsides-sf-2025',
    calendarLink: 'team/promptfoo/bsidessf2025',
    conferenceType: 'security',
    status: 'upcoming',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'BSides SF 2025',
      startDate: '2025-04-26',
      endDate: '2025-04-27',
      eventStatus: 'https://schema.org/EventScheduled',
      location: {
        '@type': 'Place',
        name: 'City View at Metreon',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'San Francisco',
          addressRegion: 'CA',
          addressCountry: 'US',
        },
      },
      image: ['https://www.promptfoo.dev/img/events/bsides-sf-2025.png'],
      description:
        "Meet the promptfoo team at BSides SF 2025 where we'll showcase how our tools can help security professionals evaluate and test LLM applications for vulnerabilities and ensure they meet security standards.",
      organizer: {
        '@type': 'Organization',
        name: 'BSides SF',
        url: 'https://bsidessf.org/',
      },
    },
  },
  {
    id: 3,
    name: 'BSides Seattle 2025',
    displayDate: 'April 18-19, 2025',
    startDate: '2025-04-18',
    endDate: '2025-04-19',
    location: 'Redmond, WA',
    venue: 'Microsoft Building 92',
    description:
      'Visit promptfoo at BSides Seattle to see demonstrations of our LLM testing and evaluation tools with a focus on security applications. Learn how to implement effective red teaming strategies for your AI systems. BSides Seattle is a community-based InfoSec conference focused on open knowledge-sharing and collaboration.',
    logo: '/img/events/bsides-seattle-2025.png',
    website: 'https://www.bsidesseattle.com/',
    meetingLink: 'https://calendly.com/promptfoo/bsides-seattle-2025',
    calendarLink: 'team/promptfoo/bsidesseattle2025',
    conferenceType: 'security',
    status: 'upcoming',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'BSides Seattle 2025',
      startDate: '2025-04-18',
      endDate: '2025-04-19',
      eventStatus: 'https://schema.org/EventScheduled',
      location: {
        '@type': 'Place',
        name: 'Microsoft Building 92',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Redmond',
          addressRegion: 'WA',
          addressCountry: 'US',
        },
      },
      image: ['https://www.promptfoo.dev/img/events/bsides-seattle-2025.png'],
      description:
        'Visit promptfoo at BSides Seattle to see demonstrations of our LLM testing and evaluation tools with a focus on security applications.',
      organizer: {
        '@type': 'Organization',
        name: 'BSides Seattle',
        url: 'https://www.bsidesseattle.com/',
      },
    },
  },
  {
    id: 4,
    name: 'RSA Conference USA 2025',
    displayDate: 'April 28-May 1, 2025',
    startDate: '2025-04-28',
    endDate: '2025-05-01',
    location: 'San Francisco, CA',
    venue: 'Moscone Center',
    description:
      "Connect with the promptfoo team at RSA Conference, the world's leading information security conference with the theme 'Unite. Innovate. Shine.' Discover how our LLM evaluation and security testing tools can help your organization implement secure AI systems and detect vulnerabilities before they become exploits. Early registrants who sign up by March 28, 2025 can save up to $600 on passes.",
    logo: '/img/events/rsa-conference.png',
    website: 'https://www.rsaconference.com/usa',
    meetingLink: 'https://calendly.com/promptfoo/rsa-conference',
    calendarLink: 'team/promptfoo/rsac2025',
    conferenceType: 'security',
    status: 'upcoming',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'RSA Conference USA 2025',
      startDate: '2025-04-28',
      endDate: '2025-05-01',
      eventStatus: 'https://schema.org/EventScheduled',
      location: {
        '@type': 'Place',
        name: 'Moscone Center',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'San Francisco',
          addressRegion: 'CA',
          addressCountry: 'US',
        },
      },
      image: ['https://www.promptfoo.dev/img/events/rsa-conference.png'],
      description:
        "Connect with the promptfoo team at RSA Conference, the world's leading information security conference. Discover how our LLM evaluation and security testing tools can help your organization implement secure AI systems.",
      organizer: {
        '@type': 'Organization',
        name: 'RSA Conference',
        url: 'https://www.rsaconference.com/usa',
      },
    },
  },
];

// EventCalendar component that uses Cal.com
function EventCalendar({ calendarLink, eventName }: { calendarLink: string; eventName: string }) {
  const isDarkTheme = useColorMode().colorMode === 'dark';

  useEffect(() => {
    (async function () {
      const cal = await getCalApi({});
      cal('ui', {
        styles: { branding: { brandColor: '#000000' } },
        hideEventTypeDetails: false,
        layout: 'month_view',
      });
    })();
  }, []);

  return (
    <div className={styles.calendarContainer}>
      <h3 className={styles.calendarTitle}>Schedule a Meeting at {eventName}</h3>
      <Cal
        calLink={calendarLink}
        style={{ width: '100%', height: '100%', overflow: 'scroll', minHeight: '600px' }}
        config={{ layout: 'month_view', theme: isDarkTheme ? 'dark' : 'light' }}
      />
    </div>
  );
}

// Helper function to determine if an event is upcoming
const isUpcoming = (event: ConferenceEvent): boolean => {
  const eventStartDate = new Date(event.startDate);
  const today = new Date();
  return eventStartDate >= today;
};

// Helper to get days until event
const getDaysUntilEvent = (event: ConferenceEvent): number => {
  const eventStartDate = new Date(event.startDate);
  const today = new Date();
  const diffTime = eventStartDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Sort events by date (closest upcoming first, then past events by most recent)
const sortedEvents = [...upcomingEvents].sort((a, b) => {
  const dateA = new Date(a.startDate);
  const dateB = new Date(b.startDate);

  const isAUpcoming = isUpcoming(a);
  const isBUpcoming = isUpcoming(b);

  // Both upcoming or both past - sort by date
  if (isAUpcoming === isBUpcoming) {
    return dateA.getTime() - dateB.getTime();
  }

  // A is upcoming, B is past
  if (isAUpcoming) {
    return -1;
  }

  // B is upcoming, A is past
  return 1;
});

// Event Card Component
function EventCard({ event, index }: { event: ConferenceEvent; index: number }) {
  const [isScheduling, setIsScheduling] = useState(false);
  const daysUntil = getDaysUntilEvent(event);

  return (
    <div
      className={styles.eventCard}
      data-event-type={event.conferenceType}
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      {event.status === 'upcoming' && (
        <div className={styles.eventStatusBadge}>
          {daysUntil > 0 ? `${daysUntil} days away` : 'Starting today!'}
        </div>
      )}
      {event.status === 'ongoing' && (
        <div className={`${styles.eventStatusBadge} ${styles.statusOngoing}`}>Happening now</div>
      )}
      {event.status === 'past' && (
        <div className={`${styles.eventStatusBadge} ${styles.statusPast}`}>Past event</div>
      )}

      <div className={styles.eventCardHeader}>
        <img
          src={event.logo}
          alt={`${event.name} logo`}
          className={styles.eventLogo}
          onError={(e) => {
            e.currentTarget.src = '/img/logo-panda.svg'; // Fallback to promptfoo logo
          }}
        />
        <div className={styles.eventTitleArea}>
          <h3 className={styles.eventName}>{event.name}</h3>
          {event.boothNumber && <div className={styles.boothBadge}>Booth: {event.boothNumber}</div>}
        </div>
      </div>
      <div className={styles.eventDetails}>
        <div className={styles.eventMeta}>
          <div className={styles.eventDate}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className={styles.icon}
              aria-hidden="true"
            >
              <path d="M12.75 12.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM7.5 15.75a.75.75 0 100-1.5.75.75 0 000 1.5zM8.25 17.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM9.75 15.75a.75.75 0 100-1.5.75.75 0 000 1.5zM10.5 17.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12 15.75a.75.75 0 100-1.5.75.75 0 000 1.5zM12.75 17.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM14.25 15.75a.75.75 0 100-1.5.75.75 0 000 1.5zM15 17.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM16.5 15.75a.75.75 0 100-1.5.75.75 0 000 1.5zM15 12.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM16.5 13.5a.75.75 0 100-1.5.75.75 0 000 1.5z" />
              <path
                fillRule="evenodd"
                d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z"
                clipRule="evenodd"
              />
            </svg>
            <span>{event.displayDate}</span>
          </div>
          <div className={styles.eventLocation}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className={styles.icon}
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z"
                clipRule="evenodd"
              />
            </svg>
            <span>{event.venue ? `${event.venue}, ${event.location}` : event.location}</span>
          </div>
        </div>
        <p className={styles.eventDescription}>{event.description}</p>

        <div className={styles.eventActions}>
          <Link
            className={clsx('button', 'button--secondary', styles.eventButton)}
            to={event.website}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Visit ${event.name} website`}
          >
            Event Website
          </Link>
          <button
            className={clsx('button', 'button--primary', styles.eventButton)}
            onClick={() => setIsScheduling(!isScheduling)}
            aria-label={`Schedule a meeting with promptfoo at ${event.name}`}
          >
            {isScheduling ? 'Hide Calendar' : 'Schedule a Meeting'}
          </button>
          <div className={styles.calendarIntegration}>
            <a
              href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=Meet promptfoo at ${encodeURIComponent(event.name)}&dates=${event.startDate.replace(/-/g, '')}/${event.endDate.replace(/-/g, '')}&location=${encodeURIComponent(event.venue || event.location)}&details=${encodeURIComponent(`Meet the promptfoo team at ${event.name}. Learn more: https://promptfoo.dev/events`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.calendarButton}
              aria-label={`Add ${event.name} to Google Calendar`}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" className={styles.calendarIcon}>
                <path
                  d="M19,4H17V3a1,1,0,0,0-2,0V4H9V3A1,1,0,0,0,7,3V4H5A3,3,0,0,0,2,7V19a3,3,0,0,0,3,3H19a3,3,0,0,0,3-3V7A3,3,0,0,0,19,4Zm1,15a1,1,0,0,1-1,1H5a1,1,0,0,1-1-1V10H20ZM20,8H4V7A1,1,0,0,1,5,6H7V7A1,1,0,0,0,9,7V6h6V7a1,1,0,0,0,2,0V6h2a1,1,0,0,1,1,1Z"
                  fill="currentColor"
                />
              </svg>
              Add to Calendar
            </a>
          </div>
        </div>

        {isScheduling && (
          <div className={styles.scheduleContainer}>
            <EventCalendar calendarLink={event.calendarLink} eventName={event.name} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function Events(): JSX.Element {
  const [filter, setFilter] = useState<'all' | 'upcoming'>('upcoming');

  // Filter events based on the selected filter
  const filteredEvents = sortedEvents.filter((event) => {
    if (filter === 'all') {
      return true;
    }
    return isUpcoming(event);
  });

  return (
    <Layout
      title="Security Conferences 2025 | Meet the promptfoo Team | AI Security Testing"
      description="Meet the promptfoo team at DEF CON, BSides, RSA and other security conferences in 2025. Schedule a meeting to discuss LLM security testing, red teaming, and vulnerability scanning."
    >
      <Head>
        {/* Add structured data for events */}
        {upcomingEvents.map((event) => (
          <script
            key={event.id}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(event.structuredData) }}
          />
        ))}
      </Head>

      <header className={clsx('hero', styles.heroBanner)}>
        <div className="container">
          <h1 className={styles.title}>Security Conferences 2025</h1>
          <p className={styles.subtitle}>
            Connect with the promptfoo team at these upcoming security conferences. Schedule a
            meeting or visit our booth to discuss how we can help secure your LLM applications.
          </p>
        </div>
      </header>
      <main className={styles.main}>
        <div className="container">
          <div className={styles.controlsContainer}>
            <div className={styles.filterToggle}>
              <button
                className={clsx(
                  styles.filterButton,
                  filter === 'upcoming' && styles.filterButtonActive,
                )}
                onClick={() => setFilter('upcoming')}
                aria-pressed={filter === 'upcoming'}
              >
                Upcoming Events
              </button>
              <button
                className={clsx(styles.filterButton, filter === 'all' && styles.filterButtonActive)}
                onClick={() => setFilter('all')}
                aria-pressed={filter === 'all'}
              >
                All Events
              </button>
            </div>
          </div>

          <section className={styles.listView}>
            {filteredEvents.length > 0 ? (
              filteredEvents.map((event, index) => (
                <EventCard key={event.id} event={event} index={index} />
              ))
            ) : (
              <div className={styles.noEvents}>
                <p>
                  No events match your current filter. Try changing your filters to see more events.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
    </Layout>
  );
}
