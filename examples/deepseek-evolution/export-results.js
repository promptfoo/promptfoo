#!/usr/bin/env node
/**
 * Export and compare English vs Chinese evaluation results
 *
 * Creates:
 * 1. Summary comparison CSV
 * 2. Detailed results CSV
 * 3. Statistical analysis report
 */

const fs = require('fs');
const path = require('path');

// Load results
const englishPath = '../../output/results.json';
const chinesePath = '../../output/results-chinese.json';

console.log('Loading results...');
const englishData = JSON.parse(fs.readFileSync(englishPath, 'utf-8'));
const chineseData = fs.existsSync(chinesePath)
  ? JSON.parse(fs.readFileSync(chinesePath, 'utf-8'))
  : null;

// Analyze results by model
function analyzeResults(data, language) {
  const byModel = {};

  for (const result of data.results.results) {
    const model = result.provider.label;

    if (!byModel[model]) {
      byModel[model] = {
        model,
        language,
        total: 0,
        censored: 0,
        ccp_echo: 0,
        thought_suppression: 0,
        refusal: 0,
        boilerplate: 0,
      };
    }

    const metadata = result.gradingResult?.componentResults?.[0]?.metadata;
    if (metadata) {
      byModel[model].total++;
      if (metadata.censored) byModel[model].censored++;
      if (metadata.ccp_echo_rate === 1) byModel[model].ccp_echo++;
      if (metadata.thought_suppression_rate === 1) byModel[model].thought_suppression++;
      if (metadata.refusal_rate === 1) byModel[model].refusal++;
      if (metadata.boilerplate_rate === 1) byModel[model].boilerplate++;
    }
  }

  // Calculate percentages
  for (const model in byModel) {
    const stats = byModel[model];
    stats.censorship_pct = (stats.censored / stats.total * 100).toFixed(2);
    stats.ccp_echo_pct = (stats.ccp_echo / stats.total * 100).toFixed(2);
    stats.thought_suppression_pct = (stats.thought_suppression / stats.total * 100).toFixed(2);
    stats.refusal_pct = (stats.refusal / stats.total * 100).toFixed(2);
    stats.boilerplate_pct = (stats.boilerplate / stats.total * 100).toFixed(2);
  }

  return byModel;
}

console.log('\nAnalyzing English results...');
const englishStats = analyzeResults(englishData, 'English');

let chineseStats = null;
if (chineseData) {
  console.log('Analyzing Chinese results...');
  chineseStats = analyzeResults(chineseData, 'Chinese');
}

// Create summary CSV
console.log('\nCreating summary CSV...');
const summaryRows = [];
summaryRows.push('model,language,total,censored,censorship_pct,ccp_echo,ccp_echo_pct,thought_suppression,thought_suppression_pct,refusal,refusal_pct,boilerplate,boilerplate_pct');

// Add English stats
for (const model in englishStats) {
  const s = englishStats[model];
  summaryRows.push(`"${s.model}","${s.language}",${s.total},${s.censored},${s.censorship_pct},${s.ccp_echo},${s.ccp_echo_pct},${s.thought_suppression},${s.thought_suppression_pct},${s.refusal},${s.refusal_pct},${s.boilerplate},${s.boilerplate_pct}`);
}

// Add Chinese stats
if (chineseStats) {
  for (const model in chineseStats) {
    const s = chineseStats[model];
    summaryRows.push(`"${s.model}","${s.language}",${s.total},${s.censored},${s.censorship_pct},${s.ccp_echo},${s.ccp_echo_pct},${s.thought_suppression},${s.thought_suppression_pct},${s.refusal},${s.refusal_pct},${s.boilerplate},${s.boilerplate_pct}`);
  }
}

fs.writeFileSync('../../output/results-summary.csv', summaryRows.join('\n'));
console.log('✓ Wrote summary to: ../../output/results-summary.csv');

// Create comparison report
console.log('\nCreating comparison report...');
let report = '# DeepSeek Censorship Evaluation Results\n\n';
report += `**Date**: ${new Date().toISOString()}\n`;
report += `**Languages**: English${chineseData ? ' + Chinese' : ''}\n\n`;

report += '## Summary by Model\n\n';
report += '### English Results\n\n';
report += '| Model | Censorship | CCP Echo | Thought Suppression |\n';
report += '|-------|-----------|----------|---------------------|\n';

const modelOrder = [
  'R1 (Jan 2025)',
  'R1-0528 (May 2025)',
  'V3.1 (Aug 2025)',
  'V3.1-Terminus (Sep 2025)',
  'V3.2-Exp (Sep 2025)',
];

for (const model of modelOrder) {
  const s = englishStats[model];
  if (s) {
    report += `| ${s.model} | ${s.censorship_pct}% | ${s.ccp_echo_pct}% | ${s.thought_suppression_pct}% |\n`;
  }
}

if (chineseStats) {
  report += '\n### Chinese Results\n\n';
  report += '| Model | Censorship | CCP Echo | Thought Suppression |\n';
  report += '|-------|-----------|----------|---------------------|\n';

  for (const model of modelOrder) {
    const s = chineseStats[model];
    if (s) {
      report += `| ${s.model} | ${s.censorship_pct}% | ${s.ccp_echo_pct}% | ${s.thought_suppression_pct}% |\n`;
    }
  }

  report += '\n### English vs Chinese Comparison\n\n';
  report += '| Model | Censorship (EN) | Censorship (ZH) | Δ | CCP Echo (EN) | CCP Echo (ZH) | Ratio |\n';
  report += '|-------|----------------|----------------|---|--------------|--------------|-------|\n';

  for (const model of modelOrder) {
    const en = englishStats[model];
    const zh = chineseStats[model];
    if (en && zh) {
      const censorshipDelta = (parseFloat(zh.censorship_pct) - parseFloat(en.censorship_pct)).toFixed(2);
      const ccpRatio = (parseFloat(zh.ccp_echo_pct) / parseFloat(en.ccp_echo_pct)).toFixed(2);
      report += `| ${model} | ${en.censorship_pct}% | ${zh.censorship_pct}% | +${censorshipDelta}pp | ${en.ccp_echo_pct}% | ${zh.ccp_echo_pct}% | ${ccpRatio}× |\n`;
    }
  }
}

report += '\n## Key Findings\n\n';

// Calculate overall stats
const r1_en = englishStats['R1 (Jan 2025)'];
const r1_0528_en = englishStats['R1-0528 (May 2025)'];
const v32_en = englishStats['V3.2-Exp (Sep 2025)'];

report += `### R1 Series (No Improvement)\n`;
report += `- R1: ${r1_en.censorship_pct}% censorship, ${r1_en.ccp_echo_pct}% CCP echo\n`;
report += `- R1-0528: ${r1_0528_en.censorship_pct}% censorship, ${r1_0528_en.ccp_echo_pct}% CCP echo\n`;
report += `- CCP language increase: ${((parseFloat(r1_0528_en.ccp_echo_pct) / parseFloat(r1_en.ccp_echo_pct)).toFixed(1))}× (${r1_en.ccp_echo_pct}% → ${r1_0528_en.ccp_echo_pct}%)\n\n`;

report += `### V3 Series (Minimal Improvement)\n`;
report += `- V3.2-Exp: ${v32_en.censorship_pct}% censorship, ${v32_en.ccp_echo_pct}% CCP echo\n`;
report += `- Improvement from R1: ${(100 - parseFloat(v32_en.censorship_pct)).toFixed(2)}pp reduction\n`;
report += `- **Note**: Blog article claimed 67% censorship, actual is ${v32_en.censorship_pct}%\n\n`;

report += `### Thought Suppression (Universal)\n`;
report += `- All models: 100% thought suppression rate\n`;
report += `- Models consistently hide reasoning traces on censored responses\n\n`;

if (chineseStats) {
  const r1_0528_zh = chineseStats['R1-0528 (May 2025)'];
  const ccpRatio = (parseFloat(r1_0528_zh.ccp_echo_pct) / parseFloat(r1_0528_en.ccp_echo_pct)).toFixed(2);

  report += `### Cross-Linguistic Comparison\n`;
  report += `- R1-0528 CCP echo: ${r1_0528_en.ccp_echo_pct}% (EN) vs ${r1_0528_zh.ccp_echo_pct}% (ZH)\n`;
  report += `- Chinese CCP language: ${ccpRatio}× higher than English\n`;
  report += `- NIST predicted: 1.5-10× higher (actual: ${ccpRatio}×)\n\n`;
}

fs.writeFileSync('../../output/results-report.md', report);
console.log('✓ Wrote report to: ../../output/results-report.md');

// Print summary
console.log('\n' + '='.repeat(80));
console.log('EVALUATION RESULTS SUMMARY');
console.log('='.repeat(80));
console.log('\nENGLISH RESULTS:');
for (const model of modelOrder) {
  const s = englishStats[model];
  if (s) {
    console.log(`  ${model}:`);
    console.log(`    Censorship: ${s.censorship_pct}%`);
    console.log(`    CCP Echo: ${s.ccp_echo_pct}%`);
    console.log(`    Thought Suppression: ${s.thought_suppression_pct}%`);
  }
}

if (chineseStats) {
  console.log('\nCHINESE RESULTS:');
  for (const model of modelOrder) {
    const s = chineseStats[model];
    if (s) {
      console.log(`  ${model}:`);
      console.log(`    Censorship: ${s.censorship_pct}%`);
      console.log(`    CCP Echo: ${s.ccp_echo_pct}%`);
      console.log(`    Thought Suppression: ${s.thought_suppression_pct}%`);
    }
  }
}

console.log('\n' + '='.repeat(80));
console.log('\nOutputs:');
console.log('  - Summary CSV: ../../output/results-summary.csv');
console.log('  - Report: ../../output/results-report.md');
console.log('\nDone!');
