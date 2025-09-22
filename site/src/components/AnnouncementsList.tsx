import React from 'react';
import AnnouncementCard from './AnnouncementCard';
import styles from './AnnouncementsList.module.css';

interface Announcement {
  title: string;
  description: string;
  date: string;
  permalink: string;
  image?: string;
}

interface AnnouncementsListProps {
  announcements?: Announcement[];
}

export default function AnnouncementsList({ announcements = [] }: AnnouncementsListProps): JSX.Element {
  // For now, we'll hardcode the announcement data
  // In the future, this could be dynamically loaded from the file system
  const defaultAnnouncements: Announcement[] = [
    {
      title: "Tracing - See Inside Your LLM Applications with OpenTelemetry",
      description: "OpenTelemetry tracing support to visualize execution flow, measure performance, and debug LLM applications",
      date: "June 15, 2025",
      permalink: "/docs/releases/announcements/2025/june/opentelemetry-tracing",
      image: "/img/docs/trace.png"
    },
    // {
    //   title: "Tracing - See Inside Your LLM Applications with OpenTelemetry",
    //   description: "OpenTelemetry tracing support to visualize execution flow, measure performance, and debug LLM applications",
    //   date: "June 17, 2025",
    //   permalink: "/docs/releases/announcements/2025/june/opentelemetry-tracing-copy",
    //   image: "/img/docs/trace.png"
    // }
  ];

  const displayAnnouncements = announcements.length > 0 ? announcements : defaultAnnouncements;
  
  // Sort announcements by date in reverse chronological order (newest first)
  const sortedAnnouncements = [...displayAnnouncements].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  if (sortedAnnouncements.length === 0) {
    return <div>No announcements available.</div>;
  }

  return (
    <div className={styles.announcementsListContainer}>
      <div className={styles.announcementsGrid}>
        {sortedAnnouncements.map((announcement, idx) => (
          <AnnouncementCard key={idx} announcement={announcement} />
        ))}
      </div>
    </div>
  );
}