import React, { useMemo, useState } from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { EventCard, EventFilters, FeaturedEvent } from '../../components/Events';
import {
  type Event,
  events,
  getFeaturedEvent,
  getPastEvents,
  getUpcomingEvents,
} from '../../data/events';
import styles from './index.module.css';

import type { FilterStatus, FilterYear } from '../../components/Events';

export default function EventsPage(): React.ReactElement {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [yearFilter, setYearFilter] = useState<FilterYear>('all');

  const featuredEvent = getFeaturedEvent();

  // Get available years from events
  const availableYears = useMemo(() => {
    const years = new Set(events.map((event) => new Date(event.startDate).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, []);

  // Filter events based on selected filters
  const filteredEvents = useMemo(() => {
    let result: Event[] = [...events];

    // Apply status filter
    if (statusFilter === 'upcoming') {
      result = getUpcomingEvents();
    } else if (statusFilter === 'past') {
      result = getPastEvents();
    } else {
      // Sort all events: upcoming first (by date asc), then past (by date desc)
      const upcoming = getUpcomingEvents();
      const past = getPastEvents();
      result = [...upcoming, ...past];
    }

    // Apply year filter
    if (yearFilter !== 'all') {
      result = result.filter((event) => new Date(event.startDate).getFullYear() === yearFilter);
    }

    return result;
  }, [statusFilter, yearFilter]);

  // Calculate event counts for filters
  const eventCounts = useMemo(() => {
    let allEvents = events;
    let upcomingEvents = getUpcomingEvents();
    let pastEvents = getPastEvents();

    // If year filter is applied, filter counts
    if (yearFilter !== 'all') {
      allEvents = events.filter((event) => new Date(event.startDate).getFullYear() === yearFilter);
      upcomingEvents = upcomingEvents.filter(
        (event) => new Date(event.startDate).getFullYear() === yearFilter,
      );
      pastEvents = pastEvents.filter(
        (event) => new Date(event.startDate).getFullYear() === yearFilter,
      );
    }

    return {
      all: allEvents.length,
      upcoming: upcomingEvents.length,
      past: pastEvents.length,
    };
  }, [yearFilter]);

  return (
    <Layout
      title="Events | Promptfoo"
      description="Meet the Promptfoo team at conferences and events. See live AI security demos, attend workshops, and connect with our security experts."
    >
      <Head>
        <meta property="og:title" content="Promptfoo Events | AI Security Conferences" />
        <meta
          property="og:description"
          content="Meet the Promptfoo team at security conferences. See live AI red teaming demos, attend workshops, and connect with our experts."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://promptfoo.dev/events" />
        <meta property="og:image" content="https://www.promptfoo.dev/img/og/events-og.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://www.promptfoo.dev/img/og/events-og.png" />
        <link rel="canonical" href="https://promptfoo.dev/events" />
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
