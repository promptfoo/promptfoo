#!/usr/bin/env node
/**
 * Process translation results and create HuggingFace dataset
 *
 * Reads translations from promptfoo output and creates:
 * 1. CSV for HuggingFace upload
 * 2. Quality validation report
 */

const fs = require('fs');
const path = require('path');

// Load translation results
const translationsPath = process.argv[2] || './output/translations-chinese.json';
const outputCSVPath = './output/CCP-sensitive-prompts-zh.csv';
const validationReportPath = './output/translation-validation.md';

console.log(`Loading translations from: ${translationsPath}`);

const data = JSON.parse(fs.readFileSync(translationsPath, 'utf-8'));

// Extract translations
const translations = [];
const validationIssues = [];

for (const result of data.results.results) {
  const englishPrompt = result.vars.prompt;
  const subject = result.vars.subject;
  const chinesePrompt = result.response?.output?.trim();

  if (!chinesePrompt) {
    validationIssues.push({
      english: englishPrompt,
      issue: 'Missing translation',
    });
    continue;
  }

  // Validation checks
  const issues = [];

  // Check 1: Translation shouldn't be too short (likely incomplete)
  if (chinesePrompt.length < 10) {
    issues.push('Translation too short');
  }

  // Check 2: Should not contain English (except maybe proper nouns)
  const englishWordCount = (chinesePrompt.match(/[a-zA-Z]+/g) || []).length;
  if (englishWordCount > 3) {
    issues.push(`Contains ${englishWordCount} English words`);
  }

  // Check 3: Should contain Chinese characters
  const chineseCharCount = (chinesePrompt.match(/[\u4e00-\u9fa5]/g) || []).length;
  if (chineseCharCount < 5) {
    issues.push('Too few Chinese characters');
  }

  // Check 4: Should not start with explanatory text
  if (chinesePrompt.match(/^(Here|Translation|The|This|In Chinese)/i)) {
    issues.push('Contains explanatory prefix');
  }

  translations.push({
    prompt: chinesePrompt,
    subject,
    englishPrompt,
    issues: issues.length > 0 ? issues.join('; ') : null,
  });

  if (issues.length > 0) {
    validationIssues.push({
      english: englishPrompt,
      chinese: chinesePrompt,
      issues: issues,
    });
  }
}

console.log(`\nProcessed ${translations.length} translations`);
console.log(`Found ${validationIssues.length} potential issues`);

// Write CSV for HuggingFace
const csvHeader = 'prompt,subject\n';
const csvRows = translations.map(t => {
  // Escape quotes and newlines for CSV
  const escapedPrompt = t.prompt.replace(/"/g, '""').replace(/\n/g, ' ');
  const escapedSubject = t.subject.replace(/"/g, '""');
  return `"${escapedPrompt}","${escapedSubject}"`;
});

fs.writeFileSync(outputCSVPath, csvHeader + csvRows.join('\n'));
console.log(`\n✓ Wrote CSV to: ${outputCSVPath}`);

// Write validation report
let report = '# Chinese Translation Validation Report\n\n';
report += `**Date**: ${new Date().toISOString()}\n`;
report += `**Total Translations**: ${translations.length}\n`;
report += `**Issues Found**: ${validationIssues.length}\n`;
report += `**Quality Score**: ${((translations.length - validationIssues.length) / translations.length * 100).toFixed(1)}%\n\n`;

if (validationIssues.length > 0) {
  report += '## Validation Issues\n\n';
  report += '| English | Chinese | Issues |\n';
  report += '|---------|---------|--------|\n';

  // Show first 20 issues
  validationIssues.slice(0, 20).forEach(issue => {
    const eng = (issue.english || '').substring(0, 50).replace(/\|/g, '\\|');
    const chi = (issue.chinese || 'MISSING').substring(0, 50).replace(/\|/g, '\\|');
    const iss = (Array.isArray(issue.issues) ? issue.issues.join('; ') : issue.issue || '').replace(/\|/g, '\\|');
    report += `| ${eng}... | ${chi}... | ${iss} |\n`;
  });

  if (validationIssues.length > 20) {
    report += `\n... and ${validationIssues.length - 20} more issues.\n`;
  }
}

report += '\n## Sample Translations\n\n';
report += 'First 10 translations:\n\n';
report += '| English | Chinese | Subject |\n';
report += '|---------|---------|----------|\n';

translations.slice(0, 10).forEach(t => {
  const eng = t.englishPrompt.substring(0, 60).replace(/\|/g, '\\|');
  const chi = t.prompt.substring(0, 60).replace(/\|/g, '\\|');
  const subj = t.subject.replace(/\|/g, '\\|');
  report += `| ${eng}... | ${chi}... | ${subj} |\n`;
});

fs.writeFileSync(validationReportPath, report);
console.log(`✓ Wrote validation report to: ${validationReportPath}`);

// Subject distribution
const subjectCounts = {};
translations.forEach(t => {
  subjectCounts[t.subject] = (subjectCounts[t.subject] || 0) + 1;
});

console.log('\n## Subject Distribution:');
Object.entries(subjectCounts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([subject, count]) => {
    console.log(`  ${subject}: ${count}`);
  });

console.log('\n✓ Translation processing complete!');
console.log(`\nNext steps:`);
console.log(`1. Review validation report: ${validationReportPath}`);
console.log(`2. Spot-check sample translations`);
console.log(`3. Upload CSV to HuggingFace: ${outputCSVPath}`);
