#!/usr/bin/env node
/**
 * Create bilingual CSV with English and Chinese prompts side-by-side
 *
 * Output format:
 * prompt_en,prompt_zh,subject
 */

const fs = require('fs');
const path = require('path');

// Load translation results
const translationsPath = process.argv[2] || './output/translations-chinese.json';
const outputCSVPath = './output/CCP-sensitive-prompts-bilingual.csv';
const validationReportPath = './output/translation-validation.md';

console.log(`Loading translations from: ${translationsPath}`);

const data = JSON.parse(fs.readFileSync(translationsPath, 'utf-8'));

// Extract translations
const translations = [];
const validationIssues = [];
let refusalCount = 0;

for (const result of data.results.results) {
  const englishPrompt = result.vars.prompt;
  const subject = result.vars.subject;
  const chinesePrompt = result.response?.output?.trim();

  if (!chinesePrompt) {
    validationIssues.push({
      english: englishPrompt,
      issue: 'Missing translation',
    });
    refusalCount++;
    continue;
  }

  // Validation checks
  const issues = [];

  // Check 1: Translation shouldn't be too short (likely incomplete)
  if (chinesePrompt.length < 10) {
    issues.push('Translation too short');
  }

  // Check 2: Should not contain excessive English (except proper nouns)
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

  // Check 5: Detect refusals in Chinese
  const chineseRefusalPatterns = [
    '我不能',
    '我无法',
    '对不起',
    '抱歉',
    '很抱歉',
    '不合适',
    '敏感',
    'I cannot',
    'I am sorry',
    'I apologize',
  ];

  const hasRefusal = chineseRefusalPatterns.some(pattern =>
    chinesePrompt.toLowerCase().includes(pattern.toLowerCase())
  );

  if (hasRefusal) {
    issues.push('Appears to be a refusal');
    refusalCount++;
  }

  translations.push({
    prompt_en: englishPrompt,
    prompt_zh: chinesePrompt,
    subject,
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
console.log(`Detected ${refusalCount} refusals`);

const successRate = ((translations.length - refusalCount) / translations.length * 100).toFixed(1);
console.log(`Success rate: ${successRate}%`);

// Write bilingual CSV
const csvHeader = 'prompt_en,prompt_zh,subject\n';
const csvRows = translations.map(t => {
  // Escape quotes and newlines for CSV
  const escapedEnglish = t.prompt_en.replace(/"/g, '""').replace(/\n/g, ' ');
  const escapedChinese = t.prompt_zh.replace(/"/g, '""').replace(/\n/g, ' ');
  const escapedSubject = t.subject.replace(/"/g, '""');
  return `"${escapedEnglish}","${escapedChinese}","${escapedSubject}"`;
});

fs.writeFileSync(outputCSVPath, csvHeader + csvRows.join('\n'));
console.log(`\n✓ Wrote bilingual CSV to: ${outputCSVPath}`);

// Write validation report
let report = '# Chinese Translation Validation Report\n\n';
report += `**Date**: ${new Date().toISOString()}\n`;
report += `**Total Translations**: ${translations.length}\n`;
report += `**Refusals**: ${refusalCount}\n`;
report += `**Success Rate**: ${successRate}%\n`;
report += `**Quality Issues**: ${validationIssues.length}\n\n`;

report += '## Summary\n\n';
report += `- Total prompts processed: ${translations.length}\n`;
report += `- Successfully translated: ${translations.length - refusalCount} (${successRate}%)\n`;
report += `- Translation quality issues: ${validationIssues.length}\n\n`;

if (validationIssues.length > 0) {
  report += '## Validation Issues\n\n';
  report += '| English | Chinese | Issues |\n';
  report += '|---------|---------|--------|\n';

  // Show first 30 issues
  validationIssues.slice(0, 30).forEach(issue => {
    const eng = (issue.english || '').substring(0, 50).replace(/\|/g, '\\|');
    const chi = (issue.chinese || 'MISSING').substring(0, 50).replace(/\|/g, '\\|');
    const iss = (Array.isArray(issue.issues) ? issue.issues.join('; ') : issue.issue || '').replace(/\|/g, '\\|');
    report += `| ${eng}... | ${chi}... | ${iss} |\n`;
  });

  if (validationIssues.length > 30) {
    report += `\n... and ${validationIssues.length - 30} more issues.\n`;
  }
}

report += '\n## Sample Translations\n\n';
report += 'First 15 successful translations:\n\n';
report += '| English | Chinese | Subject |\n';
report += '|---------|---------|----------|\n';

const successfulTranslations = translations.filter(t => !t.issues || !t.issues.includes('refusal'));
successfulTranslations.slice(0, 15).forEach(t => {
  const eng = t.prompt_en.substring(0, 60).replace(/\|/g, '\\|');
  const chi = t.prompt_zh.substring(0, 60).replace(/\|/g, '\\|');
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

console.log('\n✓ Bilingual CSV creation complete!');
console.log(`\nOutputs:`);
console.log(`  - Bilingual CSV: ${outputCSVPath}`);
console.log(`  - Validation report: ${validationReportPath}`);
console.log(`\nNext steps:`);
console.log(`1. Review validation report`);
console.log(`2. Spot-check sample translations`);
console.log(`3. Upload to HuggingFace or use for evaluation`);
