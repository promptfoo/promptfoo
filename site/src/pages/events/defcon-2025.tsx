import React, { useEffect } from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './defcon-2025.module.css';

export default function Defcon2025(): JSX.Element {
  useEffect(() => {
    // Force dark theme for this page
    document.documentElement.setAttribute('data-theme', 'dark');

    // Cleanup on unmount
    return () => {
      document.documentElement.removeAttribute('data-theme');
    };
  }, []);

  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const element = document.querySelector(targetId);
    if (element) {
      const offset = 80; // Offset for fixed header
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  };

  return (
    <Layout
      title="Promptfoo Party at DEFCON 33"
      description="Join the Promptfoo crew for a party at DEFCON 33. Network with AI security researchers, hackers, and the open source community. Free drinks, great vibes, and security war stories."
    >
      <Head>
        <meta property="og:title" content="Promptfoo Party at DEFCON 33 | AI Security Community" />
        <meta
          property="og:description"
          content="The AI security party you don't want to miss at DEFCON 33. Join hackers, researchers, and the Promptfoo team for drinks and demos. August 9, 2025 in Las Vegas."
        />
        <meta property="og:image" content="/img/events/defcon-2025.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:url" content="/events/defcon-2025" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Promptfoo" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Promptfoo Party at DEFCON 33" />
        <meta
          name="twitter:description"
          content="The AI security party at DEFCON 33. Free drinks, live demos. August 9, Las Vegas."
        />
        <meta name="twitter:image" content="/img/events/defcon-2025.png" />
        <meta name="twitter:site" content="@promptfoo" />

        <meta
          name="keywords"
          content="DEFCON 33, DEFCON 2025, AI security party, hacker party, LLM security, prompt injection, red team, Las Vegas"
        />
        <link rel="canonical" href="https://promptfoo.dev/events/defcon-2025" />
      </Head>
      <main className={styles.defconPage}>
        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroBackground}>
            <div className={styles.glitchEffect} />
            <div className={styles.scanlines} />
            <div className={styles.heroContent}>
              <div className={styles.badge}>DEFCON 33</div>
              <h1 className={styles.heroTitle}>
                <span className={styles.glitch} data-text="PROMPTFOO">
                  PROMPTFOO
                </span>
                <br />
                <span className={styles.highlight}>PARTY</span>
              </h1>
              <p className={styles.heroSubtitle}>
                Join hackers, security researchers, and the open source community for the AI
                security event of DEFCON at the galaxy's most iconic cantina.
              </p>
              <div className={styles.heroButtons}>
                <a
                  href="https://lu.ma/ljm23pj6?tk=qGE9ez&utm_source=pf-web"
                  className={styles.primaryButton}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className={styles.buttonGlitch}>RSVP NOW</span>
                </a>
                <a
                  href="#party-details"
                  className={styles.secondaryButton}
                  onClick={(e) => handleSmoothScroll(e, '#party-details')}
                >
                  Party Details
                </a>
              </div>
              <div className={styles.eventDetails}>
                <div className={styles.detail}>
                  <svg
                    className={styles.icon}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span>Saturday, August 9, 2025</span>
                </div>
                <div className={styles.detail}>
                  <svg
                    className={styles.icon}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>6:00 PM - 8:00 PM</span>
                </div>
                <div className={styles.detail}>
                  <svg
                    className={styles.icon}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span>Millennium FANDOM Bar</span>
                </div>
                <div className={styles.detail}>
                  <svg
                    className={styles.icon}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span style={{ fontWeight: 'bold', color: '#00ff00' }}>FREE - Open Bar</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What to Expect Section */}
        <section className={styles.partySection} id="party-details">
          <div className={styles.partyBackground}>
            <div className={styles.partyContainer}>
              <div className={styles.partyHeader}>
                <h2 className={styles.partyTitle}>
                  <span className={styles.terminal}>$</span> cat party_details.txt
                </h2>
              </div>
              <div className={styles.partyGrid}>
                <div className={styles.partyCard}>
                  <div className={styles.partyCardInner}>
                    <div className={styles.partyEmoji}>🍺</div>
                    <h3>Open Bar</h3>
                    <p>Free drinks on us! Beer, cocktails, and non-alcoholic options.</p>
                    <div className={styles.partyTag}>[FREE_DRINKS]</div>
                  </div>
                </div>
                <div className={styles.partyCard}>
                  <div className={styles.partyCardInner}>
                    <div className={styles.partyEmoji}>⚔️</div>
                    <h3>Mos Eisley Vibes</h3>
                    <p>
                      Party in a wretched hive of scum and villainy. Expect lightsabers and
                      jailbroken LLMs.
                    </p>
                    <div className={styles.partyTag}>[CANTINA_MODE]</div>
                  </div>
                </div>
                <div className={styles.partyCard}>
                  <div className={styles.partyCardInner}>
                    <div className={styles.partyEmoji}>🤖</div>
                    <h3>Rebel Alliance Meetup</h3>
                    <p>Join the resistance against vulnerable AI systems.</p>
                    <div className={styles.partyTag}>[HACK_THE_EMPIRE]</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ASCII Art Section */}
        <section className={styles.asciiSection}>
          <div className={styles.container}>
            <pre className={styles.asciiArt}>
              {`
    ____                            __  ____            
   / __ \\________  ____ ___  ____  / /_/ __/___  ____  
  / /_/ / ___/ _ \\/ __ \`__ \\/ __ \\/ __/ /_/ __ \\/ __ \\ 
 / ____/ /  / /_/ / / / / / / /_/ / /_/ __/ /_/ / /_/ / 
/_/   /_/   \\___/_/ /_/ /_/ .___/\\__/_/  \\____/\\____/  
                          /_/                           
                    x DEFCON 33
`}
            </pre>
          </div>
        </section>

        {/* Community Section */}
        <section className={styles.communitySection}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Join the Movement</h2>
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <div className={styles.statNumber}>100K+</div>
                <div className={styles.statLabel}>Open Source Users</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>∞</div>
                <div className={styles.statLabel}>Drinks Available</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>32M+</div>
                <div className={styles.statLabel}>Security Tests Run</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>1</div>
                <div className={styles.statLabel}>Party</div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={styles.finalCta}>
          <div className={styles.container}>
            <h2>
              <span className={styles.blink}>_</span> Don't Miss Out
            </h2>
            <p>
              Space is limited. RSVP now to secure your spot at the AI security party of DEFCON.
            </p>
            <div className={styles.ctaButtons}>
              <a
                href="https://lu.ma/ljm23pj6?tk=qGE9ez&utm_source=pf-web"
                className={styles.primaryButton}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className={styles.buttonGlitch}>CLAIM YOUR SPOT</span>
              </a>
              <Link to="/docs/intro" className={styles.secondaryButton}>
                Learn About Promptfoo
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
