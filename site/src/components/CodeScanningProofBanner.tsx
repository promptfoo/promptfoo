import React from 'react';

import Link from '@docusaurus/Link';
import ArticleIcon from '@mui/icons-material/Article';
import clsx from 'clsx';
import styles from '../pages/landing-page.module.css';

export default function ProofBannerSection() {
  return (
    <section className={styles.proofBanner}>
      <div className={clsx('container', styles.proofBannerContainer)}>
        <ArticleIcon className={styles.proofBannerIcon} />
        <div className={styles.proofBannerContent}>
          <h3 className={styles.proofBannerTitle}>See it in action</h3>
          <p className={styles.proofBannerText}>
            See the scanner's results for CVEs in LangChain, Vanna.AI, and LlamaIndex.
          </p>
        </div>
        <Link
          className={clsx('button button--secondary', styles.proofBannerButton)}
          to="/blog/building-a-security-scanner-for-llm-apps"
        >
          Read the technical breakdown
        </Link>
      </div>
    </section>
  );
}
