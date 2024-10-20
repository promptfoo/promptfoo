import React from 'react';
import Layout from '@theme/Layout';
import CallToAction from './components/CallToAction';
import Features from './components/Features';
import Hero from './components/Hero';
import Testimonials from './components/Testimonials';
import WhyPromptfoo from './components/WhyPromptfoo';
import styles from './styles.module.css';

export default function SecurityLandingPage(): JSX.Element {
  return (
    <Layout
      title="LLM Vulnerability Management"
      description="Detect, mitigate, and monitor risks for LLM-based systems before deployment with Promptfoo's comprehensive security solution."
    >
      <main className={styles.securityLandingPage}>
        <Hero />
        <Features />
        <WhyPromptfoo />
        <Testimonials />
        <CallToAction />
      </main>
    </Layout>
  );
}
