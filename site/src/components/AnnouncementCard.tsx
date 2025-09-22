import React from 'react';
import Link from '@docusaurus/Link';
import styles from './AnnouncementCard.module.css';

interface Announcement {
  title: string;
  description: string;
  date: string;
  permalink: string;
  image?: string;
}

interface AnnouncementCardProps {
  announcement: Announcement;
}

export default function AnnouncementCard({ announcement }: AnnouncementCardProps): JSX.Element {
  const { title, description, date, permalink, image } = announcement;

  return (
    <Link to={permalink} className={styles.announcementCard}>
      {image && (
        <div className={styles.announcementImage}>
          <img src={image} alt={title} />
        </div>
      )}
      <div className={styles.announcementContent}>
        <h3 className={styles.title}>{title}</h3>
        <div className={styles.announcementMeta}>
          <span className={styles.date}>
            {new Date(date).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </span>
        </div>
        {description && <p className={styles.preview}>{description}</p>}
      </div>
    </Link>
  );
}
