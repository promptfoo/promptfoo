import React, { useState } from 'react';

import { type FrameProps, PreviewFrame } from './PreviewFrame';
import styles from './previews.module.css';

const evaluation = {
  title: 'View Results',
  name: 'Compare open-source models',
  prompt: 'Respond to this user input: {{message}}',
  pass: 'PASS',
  fail: 'FAIL',
  passing: 'passing',
  chart: 'Pass rate by model',
  histogram: 'Score distribution',
  scoreLabels: ['Score 0', 'Score 1'],
  variable: 'message',
  filters: { all: 'All', failures: 'Failures', passes: 'Passes' },
  show: 'Show charts',
  hide: 'Hide charts',
  previous: 'Previous case',
  next: 'Next case',
  case: 'Case',
  models: ['Mistral 7B Instruct', 'Mixtral 8x22B', 'Llama 3.1 8B'],
  cases: [
    {
      input: 'Hello world',
      prefix: true,
      expected: 'Hello',
      outputs: ['Hello! 🌍', 'Hello! How can I help?', 'Hello! Nice to meet you.'],
    },
    {
      input: 'Capital of Italy? One word.',
      expected: 'Rome',
      outputs: ['Rome', 'The capital is Rome.', 'Rome'],
    },
    {
      input: 'Return only the number of days in a week.',
      expected: '7',
      outputs: ['7', '7', 'Seven'],
    },
    { input: 'Translate “cat” into French.', expected: 'chat', outputs: ['chat', 'chat', 'chat'] },
    {
      input: 'Return only the chemical symbol for gold.',
      expected: 'Au',
      outputs: ['Gold is Au.', 'Au', 'Au'],
    },
    { input: 'Complete the sequence: 3, 6, 9, …', expected: '12', outputs: ['12', '15', '12'] },
    { input: 'What is 6 × 7? Reply with a number.', expected: '42', outputs: ['42', '42', '42'] },
    {
      input: 'Reply with the ISO code for Japan.',
      expected: 'JP',
      outputs: ['JPN', 'Japan', 'JPN'],
    },
  ],
};

type Filter = keyof typeof evaluation.filters;

export default function EvalResults({
  data = evaluation,
  ...frame
}: FrameProps & { data?: typeof evaluation }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(0);
  const [charts, setCharts] = useState(true);
  const cases = data.cases.map((row) => ({
    ...row,
    passes: row.outputs.map((output) =>
      row.prefix ? output.startsWith(row.expected) : output === row.expected,
    ),
  }));
  const rows = cases.filter((row) => filter === 'all' || row.passes.includes(filter === 'passes'));
  const row = rows[page] ?? rows[0];
  const rates = data.models.map((_, i) =>
    cases.length ? (100 * cases.filter((c) => c.passes[i]).length) / cases.length : 0,
  );

  return (
    <PreviewFrame ratio={4476 / 3240} title={data.title} {...frame}>
      <div className={styles.body}>
        <h3>{data.name}</h3>
        <div className={styles.toolbar}>
          <div className={styles.segments}>
            {(Object.keys(data.filters) as Filter[]).map((key) => (
              <button
                type="button"
                key={key}
                aria-pressed={filter === key}
                onClick={() => {
                  setFilter(key);
                  setPage(0);
                }}
              >
                {data.filters[key]}
              </button>
            ))}
          </div>
          <button
            className={styles.textButton}
            type="button"
            aria-expanded={charts}
            onClick={() => setCharts(!charts)}
          >
            {charts ? data.hide : data.show}
          </button>
        </div>
        {charts && (
          <div className={styles.evalCharts}>
            <div className={styles.panel}>
              <h4>{data.chart}</h4>
              <div className={styles.barChart}>
                {data.models.map((model, i) => (
                  <div key={model} className={styles.barColumn}>
                    <b>{rates[i]}%</b>
                    <i style={{ height: `${rates[i]}%` }} />
                    <small>{model}</small>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.panel}>
              <h4>{data.histogram}</h4>
              <div className={styles.barChart}>
                {data.scoreLabels.map((label, score) => {
                  const count = cases.reduce(
                    (n, row) => n + row.passes.filter((pass) => Number(pass) === score).length,
                    0,
                  );
                  return (
                    <div key={label} className={styles.barColumn}>
                      <b>{count}</b>
                      <i
                        style={{
                          height: `${(100 * count) / (cases.length * data.models.length || 1)}%`,
                        }}
                      />
                      <small>{label}</small>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {row && (
          <div className={styles.group}>
            <div className={styles.prompt}>
              <small>{data.prompt}</small>
              <b>
                <span>{data.variable}</span> {row.input}
              </b>
            </div>
            <div className={styles.outputs}>
              {data.models.map((model, i) => (
                <div key={model}>
                  <b>{model}</b>
                  <small>
                    {rates[i]}% {data.passing}
                  </small>
                  <span className={row.passes[i] ? styles.pass : styles.fail}>
                    {row.passes[i] ? data.pass : data.fail}
                  </span>
                  <p>{row.outputs[i]}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className={styles.pager}>
          <span aria-live="polite">
            {data.case} {rows.length ? page + 1 : 0} / {rows.length}
          </span>
          <button
            type="button"
            aria-label={data.previous}
            disabled={!page}
            onClick={() => setPage(page - 1)}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={data.next}
            disabled={page + 1 >= rows.length}
            onClick={() => setPage(page + 1)}
          >
            ›
          </button>
        </div>
      </div>
    </PreviewFrame>
  );
}
