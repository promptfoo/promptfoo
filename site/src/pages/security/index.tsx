import React from 'react';

import Layout from '@theme/Layout';
import CallToAction from './components/_CallToAction';
import FAQ from './components/_FAQ';
import Features from './components/_Features';
import Hero from './components/_Hero';
import LogoSection from './components/_LogoSection';
import Stats from './components/_Stats';
import WhyPromptfoo from './components/_WhyPromptfoo';
import styles from './styles.module.css';

export default function SecurityLandingPage(): React.ReactElement {
  return (
    <Layout
      title="Generative AI Security"
      description="Detect, mitigate, and monitor risks for LLM-based systems before deployment with Promptfoo's comprehensive security solution."
    >
      <main className={styles.securityLandingPage}>
        <Hero />
        <LogoSection />
        <Stats />
        <Features />
        <WhyPromptfoo />
        {/* <Testimonials /> */}
        <FAQ />
        <CallToAction />
      </main>
    </Layout>
  );
}
