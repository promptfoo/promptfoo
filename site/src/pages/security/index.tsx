import React from 'react';
import Layout from '@theme/Layout';
import CallToAction from './components/CallToAction';
import FAQ from './components/FAQ';
import Features from './components/Features';
import Hero from './components/Hero';
import LogoSection from './components/LogoSection';
import Stats from './components/Stats';
import WhyPromptfoo from './components/WhyPromptfoo';
import styles from './styles.module.css';

export default function SecurityLandingPage(): JSX.Element {
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
