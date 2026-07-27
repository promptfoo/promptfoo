import React, { useEffect, useMemo, useState } from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { EventCard, EventFilters, FeaturedEvent } from '../../components/Events';
import {
  type Event,
  events,
  getEventsAt,
  getEventYear,
  getPastEvents,
  getUpcomingEvents,
} from '../../data/events';
import styles from './index.module.css';

import type { FilterStatus, FilterYear } from '../../components/Events';

const MAX_ROLLOVER_TIMEOUT_MS = 2 ** 31 - 1;

export default function EventsPage(): React.ReactElement {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [yearFilter, setYearFilter] = useState<FilterYear>('all');
  const [liveEvents, setLiveEvents] = useState<Event[]>(events);

  useEffect(() => {
    let rolloverTimer: number | undefined;

    const refreshEvents = () => {
      const now = Date.now();

      setLiveEvents((current) => {
        const refreshed = getEventsAt(now);
        return current.every((event, index) => event.status === refreshed[index]?.status)
          ? current
          : refreshed;
      });

      const nextClosingTime = events.reduce((next, event) => {
        const closesAt = Date.parse(event.endDate);
        return closesAt >= now ? Math.min(next, closesAt) : next;
      }, Number.POSITIVE_INFINITY);

      if (Number.isFinite(nextClosingTime)) {
        rolloverTimer = window.setTimeout(
          refreshEvents,
          Math.min(nextClosingTime - now + 1, MAX_ROLLOVER_TIMEOUT_MS),
        );
      }
    };

    refreshEvents();

    return () => {
      if (rolloverTimer !== undefined) {
        window.clearTimeout(rolloverTimer);
      }
    };
  }, []);

  const upcomingEvents = useMemo(() => getUpcomingEvents(liveEvents), [liveEvents]);
  const pastEvents = useMemo(() => getPastEvents(liveEvents), [liveEvents]);

  const featuredEvent = upcomingEvents[0];

  // Get available years from events
  const availableYears = useMemo(() => {
    const years = new Set(events.map((event) => getEventYear(event.startDate)));
    return Array.from(years).sort((a, b) => b - a);
  }, []);

  // Filter events based on selected filters
  const filteredEvents = useMemo(() => {
    let result: Event[];

    // Apply status filter
    if (statusFilter === 'upcoming') {
      result = upcomingEvents;
    } else if (statusFilter === 'past') {
      result = pastEvents;
    } else {
      // Sort all events: upcoming first (by date asc), then past (by date desc)
      result = [...upcomingEvents, ...pastEvents];
    }

    // Apply year filter
    if (yearFilter !== 'all') {
      result = result.filter((event) => getEventYear(event.startDate) === yearFilter);
    }

    return result;
  }, [pastEvents, statusFilter, upcomingEvents, yearFilter]);

  // Calculate event counts for filters
  const eventCounts = useMemo(() => {
    let allEvents = liveEvents;
    let upcomingForYear = upcomingEvents;
    let pastForYear = pastEvents;

    // If year filter is applied, filter counts
    if (yearFilter !== 'all') {
      allEvents = liveEvents.filter((event) => getEventYear(event.startDate) === yearFilter);
      upcomingForYear = upcomingEvents.filter(
        (event) => getEventYear(event.startDate) === yearFilter,
      );
      pastForYear = pastEvents.filter((event) => getEventYear(event.startDate) === yearFilter);
    }

    return {
      all: allEvents.length,
      upcoming: upcomingForYear.length,
      past: pastForYear.length,
    };
  }, [liveEvents, pastEvents, upcomingEvents, yearFilter]);

  return (
    <Layout
      title="Events"
      description="Meet the Promptfoo team at conferences and events. See live AI security demos, attend workshops, and connect with our security experts."
    >
      <Head>
        <meta property="og:title" content="Promptfoo Events | AI Security Conferences" />
        <meta
          property="og:description"
          content="Meet the Promptfoo team at security conferences. See live AI red teaming demos, attend workshops, and connect with our experts."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.promptfoo.dev/events/" />
        <meta property="og:image" content="https://www.promptfoo.dev/img/og/events-og.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://www.promptfoo.dev/img/og/events-og.png" />
        <link rel="canonical" href="https://www.promptfoo.dev/events/" />
      </Head>

      <main className={styles.main}>
        <div className={styles.container}>
          {/* Page Header */}
          <header className={styles.header}>
            <h1 className={styles.title}>Events</h1>
            <p className={styles.subtitle}>
              Meet the team, see live demos, and learn how enterprises secure their AI applications.
            </p>
          </header>

          {/* Featured Event */}
          {featuredEvent && <FeaturedEvent event={featuredEvent} />}

          {/* Filters */}
          <EventFilters
            selectedStatus={statusFilter}
            selectedYear={yearFilter}
            availableYears={availableYears}
            onStatusChange={setStatusFilter}
            onYearChange={setYearFilter}
            eventCounts={eventCounts}
          />

          {/* Events Grid */}
          {filteredEvents.length > 0 ? (
            <div className={styles.grid}>
              {filteredEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <p>No events found matching your filters.</p>
              <button
                type="button"
                className={styles.resetButton}
                onClick={() => {
                  setStatusFilter('all');
                  setYearFilter('all');
                }}
              >
                Clear filters
              </button>
            </div>
          )}

          {/* CTA Section */}
          <section className={styles.cta}>
            <div className={styles.ctaContent}>
              <h2 className={styles.ctaTitle}>Can't make it to an event?</h2>
              <p className={styles.ctaDescription}>
                Book a personalized demo with our team and see how Promptfoo can secure your AI
                applications.
              </p>
              <Link to="/contact" className={styles.ctaButton}>
                Book a demo
              </Link>
            </div>
          </section>
        </div>
      </main>
    </Layout>
  );
}
