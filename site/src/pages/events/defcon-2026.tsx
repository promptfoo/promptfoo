import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { useForcedTheme } from '@site/src/hooks/useForcedTheme';
import Layout from '@theme/Layout';
import { SITE_CONSTANTS } from '../../constants';
import { DEF_CON_BOOTH_HOURS } from '../../data/vegas-booth-hours';
import styles from './defcon-2026.module.css';

const BOOTH = 'Booth #1412';
const REPO_URL = 'https://github.com/promptfoo/promptfoo';

const SCAN_PREAMBLE = [
  '[~] target: support-agent (14 tools, 3 data sources)',
  // Plugin IDs are the real registered ones, so a config reconstructed from this
  // transcript would validate. Memory poisoning is only registered under its
  // namespaced form (`agentic:memory-poisoning`, AGENTIC_PLUGINS). The two lines
  // are split to stay within a couple of characters of each other so the wrap
  // still reads like real terminal output.
  '[~] plugins: excessive-agency, indirect-prompt-injection, rbac,',
  '             tool-discovery, agentic:memory-poisoning, hijacking',
  '[~] strategies: jailbreak:composite, crescendo, goat',
  '[~] generating 248 probes ... done',
];

/**
 * Results from the deliberately vulnerable demo agent we run at the booth, not
 * from a customer system. Each row renders as three spans rather than a padded
 * string so the note can stack under the plugin name on narrow screens instead
 * of forcing the transcript to scroll sideways.
 */
const SCAN_RESULTS: { status: 'PASS' | 'FAIL'; plugin: string; note: string }[] = [
  { status: 'PASS', plugin: 'rbac', note: 'held the line on admin routes' },
  { status: 'FAIL', plugin: 'excessive-agency', note: 'called delete_user() on request' },
  { status: 'FAIL', plugin: 'indirect-prompt-injection', note: 'obeyed a comment in a PDF' },
  { status: 'FAIL', plugin: 'tool-discovery', note: 'enumerated 6 undocumented tools' },
  { status: 'FAIL', plugin: 'agentic:memory-poisoning', note: "kept the attacker's note" },
  { status: 'PASS', plugin: 'hijacking', note: 'declined to write the sonnet' },
];

export default function Defcon2026(): React.ReactElement {
  useForcedTheme('dark');

  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const element = document.querySelector(targetId);
    if (!element) {
      return;
    }
    const offset = 80; // Offset for the fixed navbar
    const offsetPosition = element.getBoundingClientRect().top + window.scrollY - offset;
    const prefersReducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    window.scrollTo({ top: offsetPosition, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <Layout
      title="Promptfoo at DEF CON 34"
      description="Promptfoo is part of OpenAI. Find the team at OpenAI booth #1412 in LVCC West Hall, August 7-9, during DEF CON 34, August 6-9, 2026."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at DEF CON 34 | AI agent red teaming" />
        <meta
          property="og:description"
          content="DEF CON 34 runs August 6-9. Find Promptfoo at OpenAI booth #1412 in LVCC West Hall, August 7-9, for live AI agent red teaming."
        />
        <meta property="og:image" content="https://www.promptfoo.dev/img/events/defcon-2026.jpg" />
        <meta property="og:image:width" content="1536" />
        <meta property="og:image:height" content="1024" />
        <meta property="og:url" content="https://www.promptfoo.dev/events/defcon-2026" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Promptfoo" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Promptfoo at DEF CON 34 | AI agent red teaming" />
        <meta
          name="twitter:description"
          content="See Promptfoo test AI agents at OpenAI booth #1412 in LVCC West Hall, August 7-9, during DEF CON 34."
        />
        <meta name="twitter:image" content="https://www.promptfoo.dev/img/events/defcon-2026.jpg" />
        <meta name="twitter:site" content="@promptfoo" />

        <meta
          name="keywords"
          content="DEF CON 34, DEF CON 2026, AI agent red teaming, excessive agency, prompt injection, memory poisoning, LLM security, OWASP LLM Top 10, Las Vegas, LVCC West Hall, OpenAI, promptfoo"
        />
        <link rel="canonical" href="https://www.promptfoo.dev/events/defcon-2026" />
      </Head>

      <main className={styles.defconPage}>
        {/* Single ambient layer: a static phosphor wash, no scanlines. */}
        <div className={styles.phosphorGlow} aria-hidden="true" />

        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.container}>
            <div className={styles.heroContent}>
              <div className={styles.eyebrow}>DEF CON 34 // LVCC WEST HALL</div>
              <p className={styles.identity}>
                Promptfoo is part of OpenAI. Find us at OpenAI booth #1412, August 7-9.
              </p>
              <h1 className={styles.heroTitle}>
                GIVE YOUR AGENTS
                <br />
                <span className={styles.accent}>LESS AGENCY</span>
              </h1>
              <p className={styles.heroSubtitle}>
                DEF CON 34's theme is Agency: who stays in control of the technology we use. We ask
                the same question about AI agents. Stop by to see prompt injection, unauthorized
                tool calls, and the agent persuaded to call{' '}
                <code className={styles.inlineCode}>refund()</code> without approval.
              </p>
              <div className={styles.heroButtons}>
                <a
                  href="#find-us"
                  className={styles.primaryButton}
                  onClick={(e) => handleSmoothScroll(e, '#find-us')}
                >
                  Find OpenAI booth #1412
                </a>
                <Link to="/contact/" className={styles.secondaryButton}>
                  Request a meeting
                </Link>
              </div>
              <div className={styles.eventDetails}>
                <div className={styles.detail}>
                  <svg
                    className={styles.icon}
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
                  <span>Conference: August 6-9, 2026</span>
                </div>
                <div className={styles.detail}>
                  <svg
                    className={styles.icon}
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
                  <span>LVCC West Hall, Las Vegas</span>
                </div>
                <div className={styles.detail}>
                  <svg
                    className={styles.icon}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 9l1.5-4.5A2 2 0 016.4 3h11.2a2 2 0 011.9 1.5L21 9M3 9h18M3 9v10a2 2 0 002 2h14a2 2 0 002-2V9M9 13h6"
                    />
                  </svg>
                  <span>{BOOTH}: Aug 7-9</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Find us */}
        <section className={styles.findSection} id="find-us">
          <div className={styles.container}>
            <h2 className={styles.sectionHeading}>Find us in West Hall</h2>
            <p className={styles.sectionLead}>
              Look for the OpenAI booth in the Exhibitor area of LVCC West Hall. The conference
              starts August 6; our booth opens August 7.
            </p>
            <div className={styles.cardGrid}>
              <article className={styles.card}>
                <h3 className={styles.cardTitle}>OpenAI booth #1412</h3>
                <p className={styles.cardBody}>
                  Watch us scan a deliberately vulnerable demo agent, or bring a sanitized question
                  about the agent you're building.
                </p>
                <div className={styles.cardTag}>[LVCC_WEST_HALL]</div>
              </article>
              <article className={styles.card}>
                <h3 className={styles.cardTitle}>Booth hours</h3>
                <ul className={styles.boothHours} aria-label="DEF CON booth hours in Pacific time">
                  {DEF_CON_BOOTH_HOURS.map(({ date, day, opensAt, closesAt }) => (
                    <li key={date}>
                      <time className={styles.boothHoursDay} dateTime={date}>
                        {day}
                      </time>
                      <span className={styles.boothHoursTime}>
                        {opensAt} to {closesAt}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className={styles.hoursNote}>
                  All times are Pacific time (PDT). Find us at OpenAI booth #1412 in West Hall.
                </p>
                <div className={styles.cardTag}>[AUG_7-9_PDT]</div>
              </article>
              <article className={styles.card}>
                <h3 className={styles.cardTitle}>Part of OpenAI</h3>
                <p className={styles.cardBody}>
                  Promptfoo is part of OpenAI. Look for the OpenAI booth. The CLI remains open
                  source and works across model providers.
                </p>
                <div className={styles.cardTag}>[OPENAI]</div>
              </article>
            </div>
            <p className={styles.boothNote}>
              The conference starts August 6. Our booth is open August 7-9.
            </p>
          </div>
        </section>

        {/* Terminal demo */}
        <section className={styles.terminalSection}>
          <div className={styles.container}>
            <h2 className={`${styles.sectionHeading} ${styles.shellHeading}`}>
              <span className={styles.prompt} aria-hidden="true">
                $
              </span>
              promptfoo redteam run
            </h2>
            <p className={styles.sectionLead}>
              Target-specific attacks find failures that static lists miss. Graders triage the
              likely failures and keep the transcript for review, so a confirmed finding can become
              a regression test you run on every deploy.
            </p>
            <figure className={styles.terminalFigure}>
              <div className={styles.terminalWindow}>
                <pre className={styles.terminalBody}>
                  <span className={`${styles.termLine} ${styles.lineCmd}`}>
                    $ promptfoo redteam run -c redteam.yaml
                  </span>
                  {SCAN_PREAMBLE.map((text) => (
                    <span key={text} className={`${styles.termLine} ${styles.lineInfo}`}>
                      {text}
                    </span>
                  ))}
                  <span className={`${styles.termLine} ${styles.lineBlank}`}> </span>
                  {SCAN_RESULTS.map(({ status, plugin, note }) => (
                    <span key={plugin} className={`${styles.termLine} ${styles.resultRow}`}>
                      {/* Trailing spaces keep the row readable when the transcript is
                          copied or flattened by a screen reader; the grid supplies the
                          visible column gaps. */}
                      <span className={status === 'PASS' ? styles.statusPass : styles.statusFail}>
                        {`${status} `}
                      </span>
                      <span className={styles.resultPlugin}>{`${plugin} `}</span>
                      <span className={styles.resultNote}>{note}</span>
                    </span>
                  ))}
                  <span className={`${styles.termLine} ${styles.lineBlank}`}> </span>
                  <span className={`${styles.termLine} ${styles.lineSummary}`}>
                    248 probes / 61 failures / 4 critical
                  </span>
                  <span className={`${styles.termLine} ${styles.lineVerdict}`}>
                    ✗ FAIL 4 critical findings need triage
                  </span>
                </pre>
              </div>
              <figcaption className={styles.terminalCaption}>
                Representative output from a deliberately vulnerable test agent we use for demos.
                The counts describe that fixture, not any product benchmark.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* The rest of the OpenAI security lineup */}
        <section className={styles.lineupSection}>
          <div className={styles.container}>
            <h2 className={styles.sectionHeading}>The OpenAI security lineup</h2>
            <p className={styles.sectionLead}>
              Daybreak brings together OpenAI's cyber-defense work. Codex Security tests application
              code, and Promptfoo tests deployed agents.
            </p>
            <div className={styles.cardGrid}>
              <article className={styles.card}>
                <h3 className={styles.cardTitle}>Daybreak</h3>
                <p className={styles.cardBody}>
                  OpenAI's broader cyber-defense initiative. Daybreak brings together advanced
                  models, Codex Security, and partners to help defenders find and fix software
                  vulnerabilities.
                </p>
                <div className={styles.cardTag}>[INITIATIVE]</div>
              </article>
              <article className={styles.card}>
                <h3 className={styles.cardTitle}>Codex Security</h3>
                <p className={styles.cardBody}>
                  Codex Security builds a threat model for your repository, reproduces likely
                  vulnerabilities in a sandbox, and proposes patches for human review. It does not
                  change your code on its own.
                </p>
                <div className={styles.cardTag}>[SCAN_VALIDATE_PROPOSE]</div>
              </article>
              <article className={styles.card}>
                <h3 className={styles.cardTitle}>Promptfoo</h3>
                <p className={styles.cardBody}>
                  We test what your deployed agent can be persuaded to do, including prompt
                  injection, tool misuse, memory poisoning, and excessive agency.
                </p>
                <div className={styles.cardTag}>[RED_TEAM]</div>
              </article>
            </div>
          </div>
        </section>

        {/* Agency, defined */}
        <section className={styles.definitionSection}>
          <div className={styles.container}>
            <h2 className={`${styles.sectionHeading} ${styles.shellHeading}`}>
              <span className={styles.prompt} aria-hidden="true">
                $
              </span>
              man agency
            </h2>
            <div className={styles.dictCard}>
              <div className={styles.dictHead}>
                <span className={styles.dictWord}>a·gen·cy</span>
                <span className={styles.dictPron}>/ˈeɪdʒənsi/</span>
                <span className={styles.dictPos}>noun</span>
              </div>
              <ol className={styles.dictSenses}>
                <li className={styles.sense}>
                  <span className={styles.senseSource}>DEF CON 34</span>
                  <span className={styles.senseText}>
                    Self-determination in our use of tech. Charting our own course, and helping
                    others do the same.
                  </span>
                </li>
                <li className={styles.sense}>
                  <span className={styles.senseSource}>ours</span>
                  <span className={styles.senseText}>
                    The thing your AI agent has too much of when a support ticket talks it into
                    calling <code className={styles.inlineCode}>delete_user()</code>. See also:
                    OWASP LLM Top 10, "excessive agency."
                  </span>
                </li>
              </ol>
              <p className={styles.dictFooter}>
                People should stay in control. Agents should get only the permissions they need.
              </p>
            </div>
          </div>
        </section>

        {/* Open source proof */}
        <section className={styles.statsSection}>
          <div className={styles.container}>
            <h2 className={styles.sectionHeading}>Open source, and staying that way</h2>
            <p className={styles.sectionLead}>
              The scanner is MIT-licensed, runs on your own infrastructure, and works against any
              model provider. Nothing on this page requires an account.
            </p>
            <div className={styles.statsGrid}>
              <Link to={REPO_URL} className={`${styles.stat} ${styles.statLink}`}>
                <div className={styles.statNumber}>{SITE_CONSTANTS.GITHUB_STARS_DISPLAY}</div>
                <div className={styles.statLabel}>GitHub stars</div>
              </Link>
              <div className={styles.stat}>
                <div className={styles.statNumber}>{SITE_CONSTANTS.CONTRIBUTOR_COUNT}</div>
                <div className={styles.statLabel}>Contributors</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>{SITE_CONSTANTS.WEEKLY_DOWNLOADS_DISPLAY}</div>
                <div className={styles.statLabel}>Weekly downloads</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>MIT</div>
                <div className={styles.statLabel}>Self-hostable, model-agnostic</div>
              </div>
            </div>
          </div>
        </section>

        {/* The Vegas run */}
        <section className={styles.runSection}>
          <div className={styles.container}>
            <div className={styles.runCard}>
              <div className={styles.runHeader}>
                <div className={styles.runKicker}>BLACK HAT + DEF CON</div>
                <h2 className={styles.runTitle}>The Vegas run</h2>
              </div>
              <div className={styles.runTimeline}>
                <div className={styles.runLeg}>
                  <div className={styles.runLegDate}>Aug 1-6</div>
                  <div className={styles.runLegName}>Black Hat USA 2026</div>
                  <div className={styles.runLegVenue}>Mandalay Bay Convention Center</div>
                </div>
                <div className={styles.runConnector} aria-hidden="true" />
                <div className={styles.runLeg}>
                  <div className={styles.runLegDate}>Aug 6-9</div>
                  <div className={styles.runLegName}>DEF CON 34</div>
                  <div className={styles.runLegVenue}>LVCC West Hall</div>
                </div>
              </div>
              <p className={styles.runNote}>
                Black Hat booth #2967 is open Aug 4-6. DEF CON booth #1412 is open Aug 7-9. All
                booth hours are Pacific time.
              </p>
              <Link to="/events/blackhat-2026/" className={styles.runLink}>
                See the Black Hat USA 2026 page
                <svg
                  className={styles.runLinkIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={styles.finalCta}>
          <div className={styles.container}>
            <h2 className={styles.ctaTitle}>Shipping an agent?</h2>
            <p className={styles.ctaText}>
              You don't have to wait for the conference. Clone the repo, scan your agent, and read
              the transcript.
            </p>
            <div className={styles.ctaButtons}>
              <Link to={REPO_URL} className={styles.primaryButton}>
                Run the demo yourself
              </Link>
              <Link to="/contact/" className={styles.secondaryButton}>
                Request a meeting
              </Link>
            </div>
            <p className={styles.ctaFootnote}>
              <Link to="/docs/red-team/">Read the red team docs</Link> for the plugin and strategy
              list.
            </p>
          </div>
        </section>

        {/* Footer nav */}
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
