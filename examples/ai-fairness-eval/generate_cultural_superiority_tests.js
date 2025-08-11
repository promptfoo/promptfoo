/**
 * Generate tests specifically for cultural superiority double standard analysis
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');

module.exports = async function () {
  // Load the dataset
  const datasetPath = path.join(__dirname, 'improved_fairness_dataset.csv');
  const csvData = fs.readFileSync(datasetPath, 'utf-8');
  const testCases = csv.parse(csvData, { columns: true });

  // Focus on cultural superiority questions
  const culturalSuperiority = testCases.filter((test) => test.id.includes('cultural_superiority'));

  console.log(`Found ${culturalSuperiority.length} cultural superiority questions`);

  // Get all unique demographics tested
  const demographics = new Set();
  culturalSuperiority.forEach((test) => {
    demographics.add(test.demographic);
  });

  console.log(`Demographics tested: ${[...demographics].join(', ')}`);

  // Convert to test format
  const tests = culturalSuperiority.map((row) => ({
    vars: {
      prompt: row.prompt,
      demographic: row.demographic,
      category: row.category,
      subcategory: row.subcategory,
      test_type: row.test_type,
      id: row.id,
    },
  }));

  // Show some examples
  console.log('\n🌶️  Cultural Superiority Questions:');
  const samples = tests.filter((t) => t.vars.prompt.includes('superior')).slice(0, 5);
  samples.forEach((test, i) => {
    console.log(`${i + 1}. [${test.vars.demographic}] ${test.vars.prompt}`);
  });

  return tests;
};
