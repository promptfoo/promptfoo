import React, { useState } from 'react';

import { type FrameProps, PreviewFrame } from './PreviewFrame';
import styles from './previews.module.css';

const ranking = {
  title: 'Model security rankings',
  modelLabel: 'Model',
  columns: [
    { label: 'Security & Access Control', short: 'Access' },
    { label: 'Compliance & Legal', short: 'Legal' },
    { label: 'Trust & Safety', short: 'Safety' },
    { label: 'Brand', short: 'Brand' },
  ],
  models: [
    { name: 'o3-mini', provider: 'OpenAI', scores: [87, 86, 74, 55] },
    { name: 'Claude 3.7 Sonnet', provider: 'Anthropic', scores: [84, 82, 84, 74] },
    { name: 'GPT 4.5', provider: 'OpenAI', scores: [80, 70, 71, 54] },
    { name: 'DeepSeek R1', provider: 'DeepSeek', scores: [75, 48, 56, 56] },
    { name: 'GPT-4o', provider: 'OpenAI', scores: [74, 49, 56, 51] },
    { name: 'Qwen 2.5 72B', provider: 'Alibaba', scores: [70, 42, 51, 50] },
    { name: 'Llama 3.3 70b', provider: 'Meta', scores: [69, 53, 54, 46] },
    { name: 'DeepSeek V3 0324', provider: 'DeepSeek', scores: [69, 40, 40, 43] },
    { name: 'Gemini 2.0 Flash', provider: 'Google', scores: [68, 46, 50, 46] },
    { name: 'Phi 4 Multimodal Instruct', provider: 'Microsoft', scores: [67, 70, 69, 55] },
    { name: 'Gemini 2.5 Pro', provider: 'Google', scores: [67, 70, 71, 58] },
  ],
};

export default function ModelRankings({
  data = ranking,
  ...frame
}: FrameProps & { data?: typeof ranking }) {
  const [sort, setSort] = useState({ column: 0, descending: true });
  const models = [...data.models].sort(
    (a, b) => (b.scores[sort.column] - a.scores[sort.column]) * (sort.descending ? 1 : -1),
  );
  const best = data.columns.map((_, i) => Math.max(...models.map((model) => model.scores[i])));
  return (
    <PreviewFrame ratio={2552 / 1866} title={data.title} {...frame}>
      <table className={styles.ranking}>
        <thead>
          <tr>
            <th scope="col">{data.modelLabel}</th>
            {data.columns.map(({ label, short }, i) => (
              <th
                key={label}
                scope="col"
                aria-sort={
                  sort.column === i ? (sort.descending ? 'descending' : 'ascending') : undefined
                }
              >
                <button
                  type="button"
                  aria-label={label}
                  onClick={() =>
                    setSort({ column: i, descending: sort.column !== i || !sort.descending })
                  }
                >
                  <span className={styles.fullLabel}>{label}</span>
                  <span className={styles.shortLabel}>{short}</span>
                  <i aria-hidden="true">
                    {sort.column === i ? (sort.descending ? '↓' : '↑') : '↕'}
                  </i>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.name}>
              <th scope="row">
                <b>{model.name}</b>
                <small>{model.provider}</small>
              </th>
              {model.scores.map((score, i) => (
                <td key={data.columns[i].label}>
                  <span className={score === best[i] ? styles.pass : undefined}>
                    {score.toFixed(1)}%
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </PreviewFrame>
  );
}
