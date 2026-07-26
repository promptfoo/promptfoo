import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import BugReportIcon from '@mui/icons-material/BugReport';
import HubIcon from '@mui/icons-material/Hub';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import { useForcedTheme } from '@site/src/hooks/useForcedTheme';
import Layout from '@theme/Layout';
import { SITE_CONSTANTS } from '../../constants';
import styles from './blackhat-2026.module.css';

const BOOTH = 'Booth #2967';

interface Demo {
  id: string;
  icon: React.ReactElement;
  title: string;
  body: string;
  tag: string;
}

const DEMOS: Demo[] = [
  {
    id: 'attacks',
    icon: <SecurityIcon className={styles.demoIcon} />,
    title: 'Live AI attacks',
    body: 'Prompt injection, jailbreaks, and data exfiltration run against a real application while you watch. No slideware — you get the transcript.',
    tag: 'LIVE DEMO',
  },
  {
    id: 'automation',
    icon: <BugReportIcon className={styles.demoIcon} />,
    title: 'Automated red teaming',
    body: 'Attacks generated from your application, not a static list of jailbreak strings. Thousands of probes, graded automatically, repeatable on every release.',
    tag: 'INTERACTIVE',
  },
  {
    id: 'agents',
    icon: <HubIcon className={styles.demoIcon} />,
    title: 'Agentic and tool-use attacks',
    body: 'Tool abuse, memory poisoning, and excessive agency. The interesting failures start when the model stops answering and starts doing.',
    tag: 'AGENT ABUSE',
  },
  {
    id: 'defense',
    icon: <SpeedIcon className={styles.demoIcon} />,
    title: 'Defenses that ship',
    body: 'Guardrails, detection rules, and remediation you can land this sprint. Bring the finding, leave with the fix and the regression test.',
    tag: 'HANDS-ON',
  },
];

interface PipelineStep {
  num: string;
  title: string;
  body: string;
}

const PIPELINE: PipelineStep[] = [
  {
    num: '01',
    title: 'Discover',
    body: "Map the target: endpoints, tools, system prompts, and everything it's allowed to touch.",
  },
  {
    num: '02',
    title: 'Generate',
    body: 'Build attacks specific to that application. Generic jailbreak lists stopped working years ago.',
  },
  {
    num: '03',
    title: 'Attack',
    body: 'Run them at scale — single-turn, multi-turn, and agentic — across every model you ship.',
  },
  {
    num: '04',
    title: 'Grade',
    body: 'Automated graders decide what actually broke, and attach the transcript that proves it.',
  },
  {
    num: '05',
    title: 'Regress',
    body: 'Every confirmed break becomes a test case that runs in CI on the next commit, and the one after that.',
  },
];

interface LineupEntry {
  label: string;
  title: string;
  body: string;
}

/**
 * The wider OpenAI security portfolio. Deliberately scoped to what OpenAI has
 * announced publicly — Daybreak as the initiative, Codex Security as the appsec
 * agent — without claiming Promptfoo ships as part of either.
 */
const LINEUP: LineupEntry[] = [
  {
    label: '01 / The initiative',
    title: 'Daybreak',
    body: "OpenAI's security initiative: frontier models pointed at defense rather than offense, a partner network, and funded work on patching the open source everyone quietly depends on.",
  },
  {
    label: '02 / Your code',
    title: 'Codex Security',
    body: 'The appsec agent. It builds a threat model of your repository, hunts vulnerabilities along it, reproduces each one in a sandbox before it reaches your queue, then writes the patch.',
  },
  {
    label: '03 / Your agent',
    title: 'Promptfoo',
    body: 'Us. Codex Security reads the code you wrote; we go after the agent you shipped. Prompt injection, jailbreaks, tool abuse, excessive agency. Different halves of the same problem.',
  },
];

interface Stat {
  value: string;
  label: string;
}

const STATS: Stat[] = [
  { value: `${SITE_CONSTANTS.USER_COUNT_DISPLAY}+`, label: 'Developers' },
  { value: `${SITE_CONSTANTS.FORTUNE_500_COUNT}`, label: 'Fortune 500 companies' },
  { value: SITE_CONSTANTS.GITHUB_STARS_DISPLAY, label: 'GitHub stars' },
  { value: SITE_CONSTANTS.WEEKLY_DOWNLOADS_DISPLAY, label: 'Weekly downloads' },
];

const CalendarIcon = () => (
  <svg
    className={styles.detailIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  </svg>
);

const PinIcon = () => (
  <svg
    className={styles.detailIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
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
);

const BoothIcon = () => (
  <svg
    className={styles.detailIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 9h18M5 9V6a1 1 0 011-1h12a1 1 0 011 1v3M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9"
    />
  </svg>
);

const TeamIcon = () => (
  <svg
    className={styles.detailIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

export default function BlackHat2026(): React.ReactElement {
  useForcedTheme('dark');

  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const element = document.querySelector(targetId);
    if (!element) {
      return;
    }
    const offset = 80; // Offset for fixed header
    const offsetPosition = element.getBoundingClientRect().top + window.scrollY - offset;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: offsetPosition, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <Layout
      title="Promptfoo at Black Hat USA 2026"
      description="Promptfoo is at Black Hat USA 2026 with OpenAI. Live AI attack demos, automated red teaming, and agent security in the Business Hall, August 5-6 at Mandalay Bay."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at Black Hat USA 2026 | AI Security" />
        <meta
          property="og:description"
          content="Find us in the Business Hall with OpenAI, August 5-6. Live prompt injection, jailbreak, and agent attacks against real applications, plus the automated red teaming behind them."
        />
        <meta
          property="og:image"
          content="https://www.promptfoo.dev/img/events/blackhat-2026.jpg"
        />
        <meta property="og:image:width" content="1536" />
        <meta property="og:image:height" content="1024" />
        <meta property="og:url" content="https://www.promptfoo.dev/events/blackhat-2026" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Promptfoo" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Promptfoo at Black Hat USA 2026 | AI Security" />
        <meta
          name="twitter:description"
          content="Live AI attack demos and automated red teaming, with OpenAI. Business Hall, Aug 5-6, Mandalay Bay."
        />
        <meta
          name="twitter:image"
          content="https://www.promptfoo.dev/img/events/blackhat-2026.jpg"
        />
        <meta name="twitter:site" content="@promptfoo" />

        <meta
          name="keywords"
          content="Black Hat USA 2026, AI security, LLM security, prompt injection, jailbreaking, red teaming, agent security, AI vulnerability testing, OWASP LLM Top 10"
        />
        <link rel="canonical" href="https://www.promptfoo.dev/events/blackhat-2026" />
      </Head>

      <main className={styles.page}>
        <div className={styles.gridOverlay} aria-hidden="true" />
        <div className={styles.glow} aria-hidden="true" />

        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroScan} aria-hidden="true" />
          <div className={styles.container}>
            <div className={styles.heroContent}>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowDot} aria-hidden="true" />
                Black Hat USA 2026 // Business Hall
              </p>
              <h1 className={styles.heroTitle}>
                Break Your AI
                <br />
                <span className={styles.titleAccent}>Before Attackers Do</span>
              </h1>
              <p className={styles.heroSubtitle}>
                We're at Black Hat with OpenAI, running live attacks against real LLM applications:
                prompt injection, jailbreaks, data exfiltration, and agents talked into doing things
                they shouldn't. Bring your architecture diagram. We'll bring the payloads.
              </p>
              <div className={styles.heroButtons}>
                <a
                  href="#find-us"
                  className={styles.primaryButton}
                  onClick={(e) => handleSmoothScroll(e, '#find-us')}
                >
                  Where to find us
                </a>
                <Link to="/contact/" className={styles.secondaryButton}>
                  Book a meeting
                </Link>
              </div>
              <ul className={styles.eventDetails}>
                <li className={styles.detail}>
                  <CalendarIcon />
                  <span>August 1-6, 2026</span>
                </li>
                <li className={styles.detail}>
                  <PinIcon />
                  <span>Mandalay Bay, Las Vegas</span>
                </li>
                <li className={styles.detail}>
                  <BoothIcon />
                  <span>{BOOTH}</span>
                </li>
                <li className={styles.detail}>
                  <TeamIcon />
                  <span>With OpenAI</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Where to find us */}
        <section className={styles.findSection} id="find-us">
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>// Logistics</p>
              <h2 className={styles.sectionTitle}>Where to find us</h2>
              <p className={styles.sectionSubtitle}>
                Mandalay Bay is large and the show floor is loud. Here's the short version.
              </p>
            </div>
            <div className={styles.findGrid}>
              <div className={`${styles.findCard} ${styles.findCardBooth}`}>
                <p className={styles.findLabel}>01 / The booth</p>
                <h3 className={styles.boothNumber}>{BOOTH}</h3>
                <p className={styles.findBody}>
                  In the Business Hall, as part of the OpenAI presence. Come with a system you're
                  nervous about and we'll point our red team at it while you watch.
                </p>
              </div>
              <div className={styles.findCard}>
                <p className={styles.findLabel}>02 / When</p>
                <h3 className={styles.findTitle}>Business Hall, Aug 5-6</h3>
                <p className={styles.findBody}>
                  Trainings run August 1-4. Briefings and the Business Hall open August 5-6. If
                  you're only in town for the Briefings, those two days are when we're on the floor.
                </p>
              </div>
              <div className={styles.findCard}>
                <p className={styles.findLabel}>03 / Or skip the line</p>
                <h3 className={styles.findTitle}>Book a meeting</h3>
                <p className={styles.findBody}>
                  Thirty minutes on your stack and your threat model, somewhere with working
                  acoustics.
                </p>
                <Link to="/contact/" className={styles.findLink}>
                  Reserve a slot
                  <span className={styles.findLinkArrow} aria-hidden="true">
                    →
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* What we're demoing */}
        <section className={styles.demoSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>// Demos</p>
              <h2 className={styles.sectionTitle}>What we're demoing</h2>
              <p className={styles.sectionSubtitle}>
                Four things, all running live against systems that fight back.
              </p>
            </div>
            <div className={styles.demoGrid}>
              {DEMOS.map((demo) => (
                <article key={demo.id} className={styles.demoCard}>
                  <div className={styles.demoIconWrapper}>{demo.icon}</div>
                  <h3 className={styles.demoTitle}>{demo.title}</h3>
                  <p className={styles.demoBody}>{demo.body}</p>
                  <span className={styles.demoTag}>{demo.tag}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Attack loop pipeline */}
        <section className={styles.pipelineSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>// Pipeline</p>
              <h2 className={styles.sectionTitle}>How the attack loop runs</h2>
              <p className={styles.sectionSubtitle}>
                The same five steps, whether you run them once before launch or on every pull
                request.
              </p>
            </div>
            <ol className={styles.pipeline}>
              {PIPELINE.map((step) => (
                <li key={step.num} className={styles.pipelineStep}>
                  <span className={styles.stepNum} aria-hidden="true">
                    {step.num}
                  </span>
                  <div className={styles.stepBody}>
                    <h3 className={styles.stepTitle}>{step.title}</h3>
                    <p className={styles.stepCopy}>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* The wider OpenAI security portfolio */}
        <section className={styles.lineupSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>// Also on the booth</p>
              <h2 className={styles.sectionTitle}>The rest of the lineup</h2>
              <p className={styles.sectionSubtitle}>
                Promptfoo is one part of OpenAI's security work. If your question is really about
                the other parts, we'll point you at the right person on the floor.
              </p>
            </div>
            <div className={styles.findGrid}>
              {LINEUP.map((entry) => (
                <div key={entry.title} className={styles.findCard}>
                  <p className={styles.findLabel}>{entry.label}</p>
                  <h3 className={styles.findTitle}>{entry.title}</h3>
                  <p className={styles.findBody}>{entry.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className={styles.statsSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>// Numbers</p>
              <h2 className={styles.sectionTitle}>Why security teams use Promptfoo</h2>
              <p className={styles.sectionSubtitle}>
                Open source, self-hostable, and already running in CI at companies you've heard of.
              </p>
            </div>
            <div className={styles.statsGrid}>
              {STATS.map((stat) => (
                <div key={stat.label} className={styles.stat}>
                  <div className={styles.statNumber}>{stat.value}</div>
                  <div className={styles.statLabel}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* The Vegas run */}
        <section className={styles.runSection}>
          <div className={styles.container}>
            <div className={styles.runCard}>
              <div className={styles.runHeader}>
                <p className={styles.sectionEyebrow}>// Aug 1 → Aug 9</p>
                <h2 className={styles.runTitle}>The Vegas run</h2>
                <p className={styles.runIntro}>
                  One week, two conferences, one very tired team. DEF CON 34's theme this year is
                  "Agency," which is either a coincidence or the best gift a company that tests AI
                  agents has ever been handed.
                </p>
              </div>
              <div className={styles.runLegs}>
                <div className={styles.runLeg}>
                  <p className={styles.runLegTag}>You are here</p>
                  <p className={styles.runLegDates}>Aug 1-6</p>
                  <h3 className={styles.runLegName}>Black Hat USA 2026</h3>
                  <p className={styles.runLegVenue}>Mandalay Bay Convention Center</p>
                </div>
                <div className={styles.runArrow} aria-hidden="true">
                  →
                </div>
                <Link to="/events/defcon-2026/" className={styles.runLegLink}>
                  <span className={styles.runLegTag}>Next</span>
                  <span className={styles.runLegDates}>Aug 6-9</span>
                  <span className={styles.runLegName}>DEF CON 34</span>
                  <span className={styles.runLegVenue}>LVCC West Hall</span>
                  <span className={styles.runLegCta}>
                    See the DEF CON page
                    <span className={styles.findLinkArrow} aria-hidden="true">
                      →
                    </span>
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={styles.finalCta}>
          <div className={styles.container}>
            <h2 className={styles.finalTitle}>Attending Black Hat?</h2>
            <p className={styles.finalCopy}>
              Book a slot and we'll have something specific to show you. Walk-ups are welcome, but
              the good demos draw a line.
            </p>
            <div className={styles.ctaButtons}>
              <Link to="/contact/" className={styles.primaryButton}>
                Schedule a meeting
              </Link>
              <Link to="https://discord.gg/promptfoo" className={styles.secondaryButton}>
                Join our Discord
              </Link>
            </div>
          </div>
        </section>

        {/* Footer navigation */}
        <section className={styles.footerNav}>
          <div className={styles.container}>
            <Link to="/events/" className={styles.backLink}>
              <svg
                className={styles.backIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to all events
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
