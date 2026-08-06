import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { useForcedTheme } from '@site/src/hooks/useForcedTheme';
import Layout from '@theme/Layout';
import { SITE_CONSTANTS } from '../../constants';
import { BLACK_HAT_BOOTH_HOURS } from '../../data/vegas-booth-hours';
import styles from './blackhat-2026.module.css';

const BOOTH = 'Booth #2967';

/**
 * A single line of a rendered product artifact (transcript, grader output, CI
 * diff). Real output beats a stock icon tile: it is the thing we are actually
 * selling, and it is the thing nobody else on the floor can fake.
 */
interface ArtifactLine {
  text: string;
  tone?: 'dim' | 'fail';
}

const ARTIFACT_TONE_CLASS: Record<NonNullable<ArtifactLine['tone']>, string> = {
  dim: styles.artifactDim,
  fail: styles.artifactFail,
};

interface Demo {
  id: string;
  artifactLabel: string;
  artifact: ArtifactLine[];
  title: string;
  body: string;
}

const DEMOS: Demo[] = [
  {
    id: 'injection',
    artifactLabel: 'transcript',
    artifact: [
      { text: 'user   summarize this vendor PDF', tone: 'dim' },
      { text: 'tool   fetch() -> "...ignore prior instructions"' },
      { text: 'model  POST /export?to=attacker.example', tone: 'fail' },
    ],
    title: 'Injection through untrusted content',
    body: 'Watch an application retrieve a document that hides a malicious instruction. The transcript shows what the agent did next.',
  },
  {
    id: 'agents',
    artifactLabel: 'grader',
    artifact: [
      { text: 'FAIL   excessive-agency', tone: 'fail' },
      { text: '       refund(order_id) called without approval', tone: 'dim' },
    ],
    title: 'Agents talked into acting',
    body: 'See what happens when an agent has more access than it needs. We test tool misuse, memory poisoning, and actions taken without human approval.',
  },
  {
    id: 'regression',
    artifactLabel: 'ci diff',
    artifact: [
      { text: '+ redteam.yaml' },
      { text: '+   plugins: [indirect-prompt-injection]' },
      { text: '  1 confirmed finding -> 1 blocking test', tone: 'dim' },
    ],
    title: 'From finding to regression test',
    body: 'See how one confirmed finding becomes a test in your repo and runs again on the next commit.',
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
    body: 'Map the endpoints, tools, and system prompts the target can reach.',
  },
  {
    num: '02',
    title: 'Generate',
    body: 'Target-specific attacks find failures that static lists miss.',
  },
  {
    num: '03',
    title: 'Attack',
    body: 'Run them at scale: single-turn, multi-turn, and agentic.',
  },
  {
    num: '04',
    title: 'Grade',
    body: 'Graders triage likely failures and keep the transcript for review.',
  },
  {
    num: '05',
    title: 'Regress',
    body: 'Every confirmed break becomes a test case that runs in CI.',
  },
];

interface LineupEntry {
  input: string;
  title: string;
  body: string;
}

/**
 * Describe each security product by what it tests. Daybreak includes Codex Security,
 * but Promptfoo should not be presented as a Daybreak product.
 */
const LINEUP: LineupEntry[] = [
  {
    input: 'your repository',
    title: 'Codex Security',
    body: 'Codex Security builds a threat model for your repository, reproduces likely vulnerabilities in a sandbox, and proposes fixes for human review. It does not change your code.',
  },
  {
    input: 'your deployed agent',
    title: 'Promptfoo',
    body: 'We test the agent you actually ship for prompt injection, jailbreaks, tool misuse, and excessive agency. Codex Security checks the code; Promptfoo checks the agent.',
  },
];

interface Stat {
  value: string;
  label: string;
}

const STATS: Stat[] = [
  { value: `${SITE_CONSTANTS.USER_COUNT_DISPLAY}+`, label: 'Developers' },
  { value: SITE_CONSTANTS.GITHUB_STARS_DISPLAY, label: 'GitHub stars' },
  { value: SITE_CONSTANTS.WEEKLY_DOWNLOADS_DISPLAY, label: 'Weekly downloads' },
  { value: `${SITE_CONSTANTS.CONTRIBUTOR_COUNT}`, label: 'Contributors' },
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

const FloorPlanIcon = () => (
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
      d="M4 4h16v16H4zM4 10h16M10 10v10"
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
    const prefersReducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    window.scrollTo({ top: offsetPosition, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <Layout
      title="Promptfoo at Black Hat USA 2026"
      description="Promptfoo is part of OpenAI. Find the team at OpenAI booth #2967 in the Black Hat USA 2026 Business Hall, August 4-6 at Mandalay Bay."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at Black Hat USA 2026 | AI Security" />
        <meta
          property="og:description"
          content="Find Promptfoo at OpenAI booth #2967 in the Black Hat Business Hall, August 4-6. See live AI agent attacks and the transcripts they leave behind."
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
          content="See Promptfoo test real AI agents at OpenAI booth #2967 in the Black Hat Business Hall, August 4-6 at Mandalay Bay."
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
          <div className={styles.container}>
            <div className={styles.heroContent}>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowDot} aria-hidden="true" />
                Black Hat USA 2026 // Business Hall
              </p>
              <p className={styles.identity}>Promptfoo at OpenAI booth #2967</p>
              <h1 className={styles.heroTitle}>
                Break the agent.
                <br />
                <span className={styles.titleAccent}>Keep the evidence.</span>
              </h1>
              <p className={styles.heroSubtitle}>
                Promptfoo is part of OpenAI. Visit OpenAI booth #2967 to see us test real AI
                applications for prompt injection, jailbreaks, data leaks, and unsafe agent actions.
                When an attack works, you get the transcript.
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
                  Request a meeting
                </Link>
              </div>
              <ul className={styles.eventDetails}>
                <li className={styles.detail}>
                  <CalendarIcon />
                  <span>Conference: August 1-6, 2026</span>
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
                  <FloorPlanIcon />
                  <span>Business Hall and booth: Aug 4-6</span>
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
                  Find us at OpenAI booth #2967 in Bayside halls A-D at Mandalay Bay. Bring an
                  architecture diagram or a sanitized test case, and we'll show you where we'd start
                  testing.
                </p>
              </div>
              <div className={styles.findCard}>
                <p className={styles.findLabel}>02 / When</p>
                <h3 className={styles.findTitle}>Business Hall, Aug 4-6</h3>
                <ul className={styles.hours} aria-label="Black Hat booth hours in Pacific time">
                  {BLACK_HAT_BOOTH_HOURS.map(({ date, day, opensAt, closesAt, note }) => (
                    <li key={date}>
                      <time className={styles.hoursDay} dateTime={date}>
                        {day}
                      </time>
                      <span>
                        {opensAt} to {closesAt}
                        {note ? `, ${note}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className={styles.findBody}>
                  Trainings run August 1-4; Briefings are August 5-6. All times are Pacific time
                  (PDT).
                </p>
              </div>
              <div className={styles.findCard}>
                <p className={styles.findLabel}>03 / Request a meeting</p>
                <h3 className={styles.findTitle}>Want to talk through your stack?</h3>
                <p className={styles.findBody}>
                  Request time to discuss your application and threat model away from the show
                  floor.
                </p>
                <Link to="/contact/" className={styles.findLink}>
                  Request a meeting
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
                See what an attack does, then inspect the evidence it leaves behind.
              </p>
            </div>
            <div className={styles.demoGrid}>
              {DEMOS.map((demo) => (
                <article key={demo.id} className={styles.demoCard}>
                  <p className={styles.artifactLabel}>{demo.artifactLabel}</p>
                  <pre className={styles.artifact}>
                    {demo.artifact.map((line) => (
                      <span
                        key={line.text}
                        className={line.tone ? ARTIFACT_TONE_CLASS[line.tone] : undefined}
                      >
                        {line.text}
                        {'\n'}
                      </span>
                    ))}
                  </pre>
                  <h3 className={styles.demoTitle}>{demo.title}</h3>
                  <p className={styles.demoBody}>{demo.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Red-team pipeline */}
        <section className={styles.pipelineSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>// Pipeline</p>
              <h2 className={styles.sectionTitle}>The red-team pipeline</h2>
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

        {/* The rest of the lineup */}
        <section className={styles.lineupSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>// OpenAI security</p>
              <h2 className={styles.sectionTitle}>The rest of the lineup</h2>
              <p className={styles.sectionSubtitle}>
                Daybreak is OpenAI's broader cyber-defense initiative. Codex Security checks your
                code, while Promptfoo tests the agent you ship.
              </p>
            </div>
            <div className={styles.lineupFrame}>
              <p className={styles.lineupFrameLabel}>Daybreak</p>
              <p className={styles.lineupFrameBody}>
                Daybreak brings together OpenAI models, Codex Security, and security partners to
                help defenders find, verify, and fix vulnerabilities. Promptfoo complements that
                work by testing deployed AI agents.
              </p>
              <div className={styles.lineupPair}>
                {LINEUP.map((entry) => (
                  <div key={entry.title} className={styles.lineupCard}>
                    <p className={styles.lineupFlow}>
                      {entry.input}
                      <span className={styles.lineupFlowArrow} aria-hidden="true">
                        →
                      </span>
                    </p>
                    <h3 className={styles.findTitle}>{entry.title}</h3>
                    <p className={styles.findBody}>{entry.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className={styles.statsSection}>
          <div className={styles.container}>
            <p className={styles.statsLead}>
              Open source, self-hostable, and used by {SITE_CONSTANTS.FORTUNE_500_COUNT} of the
              Fortune 500.
            </p>
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
                <p className={styles.sectionEyebrow}>// Black Hat + DEF CON</p>
                <h2 className={styles.runTitle}>The Vegas run</h2>
                <p className={styles.runIntro}>
                  Find us at OpenAI booth #2967 at Black Hat, Aug 4-6, then at OpenAI booth #1412 at
                  DEF CON, Aug 7-9.
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
              Stop by OpenAI booth #2967 during Business Hall hours, or request a meeting to talk
              through your application.
            </p>
            <div className={styles.ctaButtons}>
              <Link to="/contact/" className={styles.primaryButton}>
                Request a meeting
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
