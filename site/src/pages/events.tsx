import React, { useState } from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import styles from './events.module.css';

// Define the event type for better TypeScript support
interface ConferenceEvent {
  id: number;
  name: string;
  date: string;
  location: string;
  description: string;
  logo: string;
  website: string;
  meetingLink: string;
  boothNumber?: string;
  conferenceType: 'security' | 'ai' | 'other';
}

// Event data with real security conferences
const upcomingEvents: ConferenceEvent[] = [
  {
    id: 1,
    name: 'DEF CON 33',
    date: 'August 7-10, 2025',
    location: 'Las Vegas Convention Center, Las Vegas, NV',
    description:
      'Join the promptfoo team at DEF CON 33 to learn how our tools help identify and mitigate security vulnerabilities in LLM implementations. Visit our booth to see demonstrations of our red teaming and vulnerability scanning capabilities for AI systems.',
    logo: '/img/events/defcon-33.png',
    website: 'https://defcon.org/',
    meetingLink: 'https://calendly.com/promptfoo/defcon-33',
    boothNumber: 'TBD',
    conferenceType: 'security',
  },
  {
    id: 2,
    name: 'BSides SF 2025',
    date: 'April 26-27, 2025',
    location: 'San Francisco, CA',
    description:
      "Meet the promptfoo team at BSides SF 2025 where we'll showcase how our tools can help security professionals evaluate and test LLM applications for vulnerabilities and ensure they meet security standards.",
    logo: '/img/events/bsides-sf-2025.png',
    website: 'https://bsidessf.org/',
    meetingLink: 'https://calendly.com/promptfoo/bsides-sf-2025',
    conferenceType: 'security',
  },
  {
    id: 3,
    name: 'BSides Seattle 2025',
    date: 'April 18-19, 2025',
    location: 'Microsoft Building 92, Redmond, WA',
    description:
      'Visit promptfoo at BSides Seattle to see demonstrations of our LLM testing and evaluation tools with a focus on security applications. Learn how to implement effective red teaming strategies for your AI systems.',
    logo: '/img/events/bsides-seattle-2025.png',
    website: 'https://www.bsidesseattle.com/',
    meetingLink: 'https://calendly.com/promptfoo/bsides-seattle-2025',
    conferenceType: 'security',
  },
  {
    id: 4,
    name: 'RSA Conference USA',
    date: 'May 5-8, 2025', // Estimated date based on usual timing
    location: 'Moscone Center, San Francisco, CA',
    description:
      "Connect with the promptfoo team at RSA Conference, the world's leading information security conference. Discover how our LLM evaluation and security testing tools can help your organization implement secure AI systems and detect vulnerabilities before they become exploits.",
    logo: '/img/events/rsa-conference.png',
    website: 'https://www.rsaconference.com/usa',
    meetingLink: 'https://calendly.com/promptfoo/rsa-conference',
    conferenceType: 'security',
  },
];

// Helper function to determine if an event is upcoming
const isUpcoming = (dateString: string): boolean => {
  const eventDate = new Date(dateString.split('-')[0]);
  return eventDate >= new Date();
};

// Sort events by date (closest upcoming first, then past events by most recent)
const sortedEvents = [...upcomingEvents].sort((a, b) => {
  const dateA = new Date(a.date.split('-')[0]);
  const dateB = new Date(b.date.split('-')[0]);

  const isAUpcoming = dateA >= new Date();
  const isBUpcoming = dateB >= new Date();

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
  return (
    <div
      className={styles.eventCard}
      data-event-type={event.conferenceType}
      style={{ animationDelay: `${index * 0.1}s` }}
    >
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
            <span>{event.date}</span>
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
            <span>{event.location}</span>
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
          <Link
            className={clsx('button', 'button--primary', styles.eventButton)}
            to={event.meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Schedule a meeting with promptfoo at ${event.name}`}
          >
            Schedule a Meeting
          </Link>
        </div>
      </div>
    </div>
  );
}

// Calendar View Component - fix TypeScript issues
function CalendarView() {
  type MonthlyEvents = Record<string, ConferenceEvent[]>;

  // Group events by month with proper TypeScript typing
  const eventsByMonth = sortedEvents.reduce<MonthlyEvents>((acc, event) => {
    const dateObj = new Date(event.date.split('-')[0]);
    const month = dateObj.toLocaleString('default', { month: 'long' });
    if (!acc[month]) {
      acc[month] = [];
    }
    acc[month].push(event);
    return acc;
  }, {});

  return (
    <div className={styles.calendarView}>
      {Object.entries(eventsByMonth).map(([month, monthEvents]) => (
        <div key={month} className={styles.monthSection}>
          <h3 className={styles.monthTitle}>{month}</h3>
          <div className={styles.monthEvents}>
            {monthEvents.map((event) => (
              <div
                key={event.id}
                className={styles.calendarEvent}
                tabIndex={0}
                role="button"
                aria-label={`${event.name} on ${event.date} at ${event.location}`}
              >
                <div className={styles.calendarEventDate}>{event.date}</div>
                <div className={styles.calendarEventDetails}>
                  <div className={styles.calendarEventName}>{event.name}</div>
                  <div className={styles.calendarEventLocation}>{event.location}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Events(): JSX.Element {
  const [activeView, setActiveView] = useState<'list' | 'calendar'>('list');
  const [filter, setFilter] = useState<'all' | 'upcoming'>('upcoming');

  // Filter events based on the selected filter
  const filteredEvents = sortedEvents.filter((event) => {
    if (filter === 'all') {
      return true;
    }
    return isUpcoming(event.date);
  });

  return (
    <Layout
      title="Security Conferences | promptfoo"
      description="Meet the promptfoo team at upcoming security conferences and events. Schedule a meeting to discuss LLM security testing, red teaming, and vulnerability scanning capabilities."
    >
      <header className={clsx('hero', styles.heroBanner)}>
        <div className="container">
          <h1 className={styles.title}>Upcoming Security Conferences</h1>
          <p className={styles.subtitle}>
            Connect with the promptfoo team at these upcoming security conferences. Schedule a
            meeting or visit our booth to discuss how we can help secure your LLM applications.
          </p>
        </div>
      </header>
      <main className={styles.main}>
        <div className="container">
          <div className={styles.controlsContainer}>
            <div className={styles.viewToggle} role="tablist" aria-label="Event view options">
              <button
                className={clsx(
                  styles.viewButton,
                  activeView === 'list' && styles.viewButtonActive,
                )}
                onClick={() => setActiveView('list')}
                role="tab"
                aria-selected={activeView === 'list'}
                aria-controls="list-view"
                id="list-tab"
              >
                List View
              </button>
              <button
                className={clsx(
                  styles.viewButton,
                  activeView === 'calendar' && styles.viewButtonActive,
                )}
                onClick={() => setActiveView('calendar')}
                role="tab"
                aria-selected={activeView === 'calendar'}
                aria-controls="calendar-view"
                id="calendar-tab"
              >
                Calendar View
              </button>
            </div>

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

          <section
            id="list-view"
            className={styles.listView}
            style={{ display: activeView === 'list' ? 'flex' : 'none' }}
            role="tabpanel"
            aria-labelledby="list-tab"
          >
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

          <section
            id="calendar-view"
            className={styles.calendarView}
            style={{ display: activeView === 'calendar' ? 'flex' : 'none' }}
            role="tabpanel"
            aria-labelledby="calendar-tab"
          >
            <CalendarView />
          </section>
        </div>
      </main>
    </Layout>
  );
}
