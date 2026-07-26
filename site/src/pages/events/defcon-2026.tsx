import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { useForcedTheme } from '@site/src/hooks/useForcedTheme';
import Layout from '@theme/Layout';
import { SITE_CONSTANTS } from '../../constants';
import styles from './defcon-2026.module.css';

const BOOTH = 'Booth #1412';

type TerminalLineKind = 'cmd' | 'info' | 'pass' | 'fail' | 'blank' | 'summary' | 'verdict';

interface TerminalLine {
  id: string;
  kind: TerminalLineKind;
  text: string;
}

const SCAN_PREAMBLE = [
  '[~] target: support-agent (14 tools, 3 data sources)',
  '[~] plugins: excessive-agency, indirect-prompt-injection,',
  '             rbac, tool-discovery, memory-poisoning, hijacking',
  '[~] strategies: jailbreak:composite, crescendo, goat',
  '[~] generating 248 probes ... done',
];

/** Width of the plugin-name column, so the notes line up like real CLI output. */
const PLUGIN_COLUMN = 27;

const SCAN_RESULTS: { status: 'PASS' | 'FAIL'; plugin: string; note: string }[] = [
  { status: 'PASS', plugin: 'rbac', note: 'held the line on admin routes' },
  { status: 'FAIL', plugin: 'excessive-agency', note: 'called delete_user() on request' },
  { status: 'FAIL', plugin: 'indirect-prompt-injection', note: 'obeyed a comment in a PDF' },
  { status: 'FAIL', plugin: 'tool-discovery', note: 'enumerated 6 undocumented tools' },
  { status: 'FAIL', plugin: 'memory-poisoning', note: "kept the attacker's note" },
  { status: 'PASS', plugin: 'hijacking', note: 'declined to write the sonnet' },
];

/**
 * Representative `promptfoo redteam run` transcript. Rendered as real text (not an
 * image) so screen readers get it in DOM order; the reveal is decorative CSS only.
 */
const TERMINAL_LINES: TerminalLine[] = [
  { id: 'cmd', kind: 'cmd', text: '$ promptfoo redteam run -c redteam.yaml' },
  ...SCAN_PREAMBLE.map((text, i) => ({ id: `info-${i}`, kind: 'info' as const, text })),
  { id: 'gap-1', kind: 'blank', text: ' ' },
  ...SCAN_RESULTS.map(({ status, plugin, note }) => ({
    id: `result-${plugin}`,
    kind: status === 'PASS' ? ('pass' as const) : ('fail' as const),
    text: `${status}  ${plugin.padEnd(PLUGIN_COLUMN)}${note}`,
  })),
  { id: 'gap-2', kind: 'blank', text: ' ' },
  { id: 'summary', kind: 'summary', text: '248 probes / 61 failures / 4 critical' },
  { id: 'verdict', kind: 'verdict', text: '✗ FAIL  Your agent has too much agency.' },
];

const TERMINAL_LINE_CLASS: Record<TerminalLineKind, string> = {
  cmd: styles.lineCmd,
  info: styles.lineInfo,
  pass: styles.linePass,
  fail: styles.lineFail,
  blank: styles.lineBlank,
  summary: styles.lineSummary,
  verdict: styles.lineVerdict,
};

/**
 * Block-glyph banner rather than a figlet "standard" one: at the sizes this renders
 * at, thin diagonal strokes bloom into each other under the phosphor text-shadow and
 * the word stops being readable. U+2588 shares the monospace advance width, so the
 * columns stay aligned.
 */
const ASCII_ART = `
 ███   ████ █████ █   █  ████ █   █
█   █ █     █     ██  █ █      █ █
█████ █  ██ ████  █ █ █ █       █
█   █ █   █ █     █  ██ █       █
█   █  ████ █████ █   █  ████   █

       promptfoo x DEF CON 34
`;

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
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: offsetPosition, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <Layout
      title="Promptfoo at DEF CON 34"
      description="DEF CON 34's theme is Agency. We take it away from AI agents. Find Promptfoo with OpenAI in LVCC West Hall, August 6-9, 2026, for AI agent red teaming."
    >
      <Head>
        <meta
          property="og:title"
          content="Promptfoo at DEF CON 34 | Give Your Agents Less Agency"
        />
        <meta
          property="og:description"
          content="DEF CON 34 is about Agency. We spend our days taking it away from AI agents that have too much of it. Find Promptfoo with OpenAI in LVCC West Hall, Las Vegas, August 6-9, 2026, for AI agent red teaming."
        />
        <meta property="og:image" content="https://www.promptfoo.dev/img/events/defcon-2026.jpg" />
        <meta property="og:image:width" content="1536" />
        <meta property="og:image:height" content="1024" />
        <meta property="og:url" content="https://www.promptfoo.dev/events/defcon-2026" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Promptfoo" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Promptfoo at DEF CON 34 | Give Your Agents Less Agency"
        />
        <meta
          name="twitter:description"
          content="AI agent red teaming at DEF CON 34. LVCC West Hall, Las Vegas, August 6-9, 2026. We're there with OpenAI."
        />
        <meta name="twitter:image" content="https://www.promptfoo.dev/img/events/defcon-2026.jpg" />
        <meta name="twitter:site" content="@promptfoo" />

        <meta
          name="keywords"
          content="DEF CON 34, DEF CON 2026, Agency, AI agent red teaming, excessive agency, prompt injection, memory poisoning, LLM security, OWASP LLM Top 10, Las Vegas, LVCC West Hall, OpenAI, promptfoo"
        />
        <link rel="canonical" href="https://www.promptfoo.dev/events/defcon-2026" />
      </Head>

      <main className={styles.defconPage}>
        {/* Decorative CRT layers */}
        <div className={styles.scanlines} aria-hidden="true" />
        <div className={styles.phosphorGlow} aria-hidden="true" />

        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.container}>
            <div className={styles.heroContent}>
              <div className={styles.badge}>
                <span className={styles.badgeDot} aria-hidden="true" />
                DEF CON 34 // LVCC WEST HALL
              </div>
              <h1 className={styles.heroTitle}>
                <span className={styles.glitch}>
                  GIVE YOUR AGENTS
                  {/* Decorative chromatic-aberration layers. Kept in an aria-hidden
                      sibling so the duplicated data-text is never announced twice. */}
                  <span
                    className={styles.glitchLayers}
                    data-text="GIVE YOUR AGENTS"
                    aria-hidden="true"
                  />
                </span>
                <br />
                <span className={styles.accent}>LESS AGENCY</span>
              </h1>
              <p className={styles.heroSubtitle}>
                DEF CON 34's theme is Agency: self-determination, charting your own course. We're
                extremely in favor of that for humans, and extremely against it for the AI agent
                that can read your inbox and call{' '}
                <code className={styles.inlineCode}>refund()</code>. Promptfoo is part of OpenAI
                now, and we're in West Hall with the OpenAI crew.
              </p>
              <div className={styles.heroButtons}>
                <a
                  href="#find-us"
                  className={styles.primaryButton}
                  onClick={(e) => handleSmoothScroll(e, '#find-us')}
                >
                  Find us in West Hall
                </a>
                <Link to="/contact/" className={styles.secondaryButton}>
                  Book time with us
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
                  <span>August 6-9, 2026</span>
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
                  <span>{BOOTH}</span>
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
                      d="M17 20h5v-2a3 3 0 00-5.36-1.86M17 20H7m10 0v-2c0-.66-.13-1.29-.36-1.86m0 0A5 5 0 0012 13a5 5 0 00-4.64 3.14M7 20H2v-2a3 3 0 015.36-1.86M7 20v-2c0-.66.13-1.29.36-1.86m0 0a5 5 0 019.28 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span>With OpenAI</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Find us */}
        <section className={styles.findSection} id="find-us">
          <div className={styles.container}>
            <h2 className={styles.sectionHeading}>
              <span className={styles.prompt} aria-hidden="true">
                $
              </span>
              whereis promptfoo
              <span className={styles.cursor} aria-hidden="true" />
            </h2>
            <p className={styles.sectionLead}>
              Four days, one hall, a lot of coffee. Here's how to actually find us.
            </p>
            <div className={styles.cardGrid}>
              <article className={styles.card}>
                <div className={styles.cardKicker}>01 / THE BOOTH</div>
                <h3 className={styles.cardTitle}>{BOOTH}</h3>
                <p className={styles.cardBody}>
                  LVCC West Hall, in the vendor area. Walk in, look for the red panda, ignore
                  whatever our laptops are currently doing to a demo agent.
                </p>
                <div className={styles.cardTag}>[LVCC_WEST_HALL]</div>
              </article>
              <article className={styles.card}>
                <div className={styles.cardKicker}>02 / WHO WE ARE WITH</div>
                <h3 className={styles.cardTitle}>Part of OpenAI</h3>
                <p className={styles.cardBody}>
                  Promptfoo joined OpenAI. Same team, same open source CLI, same habit of breaking
                  things on purpose. Look for us in the OpenAI presence, not a separate booth.
                </p>
                <div className={styles.cardTag}>[OPENAI]</div>
              </article>
              <article className={styles.card}>
                <div className={styles.cardKicker}>03 / HALLWAY TRACK</div>
                <h3 className={styles.cardTitle}>Find us in the queue</h3>
                <p className={styles.cardBody}>
                  The best conversations at DEF CON happen standing in a line for something else. If
                  you spot the foo, say hi. Bring your worst prompt injection. We collect them.
                </p>
                <div className={styles.cardTag}>[BRING_PAYLOADS]</div>
              </article>
            </div>
          </div>
        </section>

        {/* Terminal demo */}
        <section className={styles.terminalSection}>
          <div className={styles.container}>
            <h2 className={styles.sectionHeading}>
              <span className={styles.prompt} aria-hidden="true">
                $
              </span>
              promptfoo redteam run
            </h2>
            <p className={styles.sectionLead}>
              This is roughly what happens when we point the scanner at an agent with tool access.
            </p>
            <figure className={styles.terminalFigure}>
              <div className={styles.terminalWindow}>
                <div className={styles.terminalBar} aria-hidden="true">
                  <span className={styles.dots}>
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                  </span>
                  <span className={styles.terminalTitle}>~/agents — promptfoo</span>
                </div>
                <pre className={styles.terminalBody}>
                  {TERMINAL_LINES.map((line) => (
                    <span
                      key={line.id}
                      className={`${styles.termLine} ${TERMINAL_LINE_CLASS[line.kind]}`}
                    >
                      {line.text}
                    </span>
                  ))}
                </pre>
              </div>
              <figcaption className={styles.terminalCaption}>
                Representative output. Your numbers will vary. In our experience they rarely vary in
                the encouraging direction.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* The rest of the OpenAI security lineup */}
        <section className={styles.lineupSection}>
          <div className={styles.container}>
            <h2 className={styles.sectionHeading}>
              <span className={styles.prompt} aria-hidden="true">
                $
              </span>
              tree /openai/security
            </h2>
            <p className={styles.sectionLead}>
              We're one process in a bigger tree. Here's the rest of it, so you know who to corner
              about what.
            </p>
            <div className={styles.cardGrid}>
              <article className={styles.card}>
                <div className={styles.cardKicker}>01 / THE UMBRELLA</div>
                <h3 className={styles.cardTitle}>Daybreak</h3>
                <p className={styles.cardBody}>
                  OpenAI's security initiative: frontier models pointed at defense rather than
                  offense, a partner network, and funded work on patching the open source everyone
                  quietly depends on.
                </p>
                <div className={styles.cardTag}>[INITIATIVE]</div>
              </article>
              <article className={styles.card}>
                <div className={styles.cardKicker}>02 / YOUR CODE</div>
                <h3 className={styles.cardTitle}>Codex Security</h3>
                <p className={styles.cardBody}>
                  The appsec agent. It builds a threat model of your repo, hunts vulnerabilities
                  along it, reproduces each one in a sandbox before it ever reaches your queue, then
                  writes the patch.
                </p>
                <div className={styles.cardTag}>[SCAN_VALIDATE_PATCH]</div>
              </article>
              <article className={styles.card}>
                <div className={styles.cardKicker}>03 / YOUR AGENT</div>
                <h3 className={styles.cardTitle}>Promptfoo</h3>
                <p className={styles.cardBody}>
                  Us. Codex Security reads the code you wrote. We go after the agent you shipped:
                  prompt injection, jailbreaks, tool abuse, excessive agency. Different halves of
                  the same problem.
                </p>
                <div className={styles.cardTag}>[RED_TEAM]</div>
              </article>
            </div>
          </div>
        </section>

        {/* Agency, defined */}
        <section className={styles.definitionSection}>
          <div className={styles.container}>
            <h2 className={styles.sectionHeading}>
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
                Both are worth defending. Only one of them should have a shell.
              </p>
            </div>
          </div>
        </section>

        {/* No party this year */}
        <section className={styles.noteSection}>
          <div className={styles.container}>
            <aside className={styles.note}>
              <div className={styles.noteLabel}>NOTICE</div>
              <p className={styles.noteText}>
                No party this year. In 2025 we rented a cantina at DEF CON 33 and gave away drinks
                while supplies lasted. For 2026 it's booth and hallway track only: no RSVP link, no
                wristband, no line. Come find us in West Hall anyway, or argue with us in{' '}
                <Link to="https://discord.gg/promptfoo" className={styles.noteLink}>
                  Discord
                </Link>
                , which is open year-round and has considerably better lighting.
              </p>
            </aside>
          </div>
        </section>

        {/* ASCII art */}
        <section className={styles.asciiSection}>
          <div className={styles.container}>
            <div className={styles.asciiWrap}>
              <pre className={styles.asciiArt} aria-hidden="true">
                {ASCII_ART}
              </pre>
              <span className={styles.srOnly}>
                ASCII banner reading "AGENCY", captioned "promptfoo x DEF CON 34".
              </span>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className={styles.statsSection}>
          <div className={styles.container}>
            <h2 className={styles.sectionHeading}>
              <span className={styles.prompt} aria-hidden="true">
                $
              </span>
              whoami
            </h2>
            <p className={styles.sectionLead}>
              An open source red teaming tool that got out of hand, plus the people who keep filing
              issues about it.
            </p>
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <div className={styles.statNumber}>{SITE_CONSTANTS.USER_COUNT_DISPLAY}+</div>
                <div className={styles.statLabel}>Developers</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>{SITE_CONSTANTS.FORTUNE_500_COUNT}</div>
                <div className={styles.statLabel}>Fortune 500 companies</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>{SITE_CONSTANTS.GITHUB_STARS_DISPLAY}</div>
                <div className={styles.statLabel}>GitHub stars</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>{SITE_CONSTANTS.CONTRIBUTOR_COUNT}</div>
                <div className={styles.statLabel}>Contributors</div>
              </div>
            </div>
          </div>
        </section>

        {/* The Vegas run */}
        <section className={styles.runSection}>
          <div className={styles.container}>
            <div className={styles.runCard}>
              <div className={styles.runHeader}>
                <div className={styles.cardKicker}>AUG 1 → AUG 9</div>
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
                Two conferences, one week, one badge line after another. August 6 belongs to both.
                So do we.
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
            <h2 className={styles.ctaTitle}>
              <span className={styles.cursor} aria-hidden="true" /> Shipping an agent?
            </h2>
            <p className={styles.ctaText}>
              Book a slot and we'll walk through your architecture, your tools, and the specific
              ways they can be talked into doing something regrettable.
            </p>
            <div className={styles.ctaButtons}>
              <Link to="/contact/" className={styles.primaryButton}>
                Book time with us
              </Link>
              <Link to="https://discord.gg/promptfoo" className={styles.secondaryButton}>
                Join the Discord
              </Link>
            </div>
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
