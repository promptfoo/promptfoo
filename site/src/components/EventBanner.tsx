import React from 'react';
import Link from '@docusaurus/Link';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import styles from './EventBanner.module.css';

export default function EventBanner(): JSX.Element {
  // Get the nearest upcoming event
  const upcomingEvents = [
    {
      id: 2,
      name: 'BSides SF 2025',
      displayDate: 'April 26-27, 2025',
      startDate: '2025-04-26',
      endDate: '2025-04-27',
      location: 'San Francisco, CA',
    },
    {
      id: 4,
      name: 'RSA Conference USA 2025',
      displayDate: 'April 28-May 1, 2025',
      startDate: '2025-04-28',
      endDate: '2025-05-01',
      location: 'San Francisco, CA',
    },
    {
      id: 1,
      name: 'DEF CON 33',
      displayDate: 'August 7-10, 2025',
      startDate: '2025-08-07',
      endDate: '2025-08-10',
      location: 'Las Vegas, NV',
    },
  ];

  // Sort events by date (upcoming first)
  const sortedEvents = [...upcomingEvents].sort((a, b) => {
    const dateA = new Date(a.startDate);
    const dateB = new Date(b.startDate);

    return dateA.getTime() - dateB.getTime();
  });

  // Get nearest upcoming event
  const nextEvent = sortedEvents[0];

  return (
    <div className={styles.eventBanner}>
      <div className={styles.eventBannerContent}>
        <div className={styles.eventBannerInfo}>
          <CalendarTodayIcon className={styles.eventBannerIcon} />
          <span className={styles.eventBannerLabel}>Next Security Event:</span>
          <span className={styles.eventBannerName}>{nextEvent.name}</span>
          <span className={styles.eventBannerDate}>{nextEvent.displayDate}</span>
        </div>
        <Link to="/events/" className={styles.eventBannerLink}>
          Meet us at security conferences <ArrowForwardIcon fontSize="small" />
        </Link>
      </div>
    </div>
  );
}
