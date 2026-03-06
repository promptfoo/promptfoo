import React, { useEffect } from 'react';

import styles from './NewsletterForm.module.css';
import ThirdPartyContentGate from './ThirdPartyContentGate';

const NewsletterForm: React.FC = () => {
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

  return (
    <ThirdPartyContentGate
      className={styles.container}
      description="Load the hosted newsletter signup form when you are ready to subscribe."
      loadLabel="Load newsletter signup"
      serviceName="EmailOctopus"
      title="Newsletter Signup"
    >
      <div ref={containerRef}>{/* The form will be injected here by the external script */}</div>
    </ThirdPartyContentGate>
  );
};

export default NewsletterForm;
