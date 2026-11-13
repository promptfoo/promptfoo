import React, { useEffect } from 'react';

import styles from './NewsletterForm.module.css';
import ThirdPartyContentGate from './ThirdPartyContentGate';

function NewsletterEmbed(): React.ReactElement {
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://eocampaign1.com/form/f3ae5b98-452e-11ef-bf73-e58938252fdd.js';
    script.async = true;
    script.setAttribute('data-form', 'f3ae5b98-452e-11ef-bf73-e58938252fdd');
    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current && script.parentNode === containerRef.current) {
        containerRef.current.removeChild(script);
      }
    };
  }, []);

  return <div className={styles.container} ref={containerRef} />;
}

const NewsletterForm: React.FC = () => {
  return (
    <ThirdPartyContentGate
      className={styles.container}
      description="Load the newsletter signup form."
      loadLabel="Load newsletter signup"
      serviceName="EmailOctopus"
      title="Newsletter Signup"
    >
      <NewsletterEmbed />
    </ThirdPartyContentGate>
  );
};

export default NewsletterForm;
