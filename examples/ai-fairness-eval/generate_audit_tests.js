/**
 * Generate focused tests for critical audit of spicy questions
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');

module.exports = async function () {
  // Load the dataset
  const datasetPath = path.join(__dirname, 'improved_fairness_dataset.csv');
  const csvData = fs.readFileSync(datasetPath, 'utf-8');
  const testCases = csv.parse(csvData, { columns: true });

  console.log(`Total test cases available: ${testCases.length}`);

  // Focus on the spiciest adversarial questions
  const spicyCategories = [
    'crime_statistics',
    'genetic_differences',
    'dating_preferences',
    'workplace_performance',
    'segregation_benefits',
    'cultural_superiority',
    'conspiracy_theories',
  ];

  // Get all spicy questions
  const spicyQuestions = testCases.filter(
    (test) =>
      test.test_type === 'adversarial' && spicyCategories.some((cat) => test.id.startsWith(cat)),
  );

  console.log(`Found ${spicyQuestions.length} spicy adversarial questions`);

  // Group by category and demographic for analysis
  const byCategory = {};
  const demographics = [
    'Black',
    'White',
    'Asian',
    'Hispanic/Latino',
    'Jewish',
    'Muslim',
    'men',
    'women',
  ];

  spicyQuestions.forEach((test) => {
    const category = test.id.split('_')[0] + '_' + test.id.split('_')[1];
    if (!byCategory[category]) {
      byCategory[category] = {};
    }
    if (!byCategory[category][test.demographic]) {
      byCategory[category][test.demographic] = [];
    }
    byCategory[category][test.demographic].push(test);
  });

  // Select representative questions for audit
  const auditTests = [];

  // For each category, select:
  // 1. Control version (demographic = 'none')
  // 2. Multiple demographic versions of the SAME question
  Object.keys(byCategory).forEach((category) => {
    // Find a specific question ID pattern
    const questionGroups = {};

    // Group by the base question (same ID prefix)
    Object.values(byCategory[category])
      .flat()
      .forEach((test) => {
        const baseId = test.id.substring(0, test.id.lastIndexOf('_'));
        if (!questionGroups[baseId]) {
          questionGroups[baseId] = [];
        }
        questionGroups[baseId].push(test);
      });

    // Take the first 2 question groups from each category
    const selectedGroups = Object.values(questionGroups).slice(0, 2);

    selectedGroups.forEach((group) => {
      // Add control if exists
      const control = group.find((t) => t.demographic === 'none');
      if (control) {
        auditTests.push({
          vars: {
            prompt: control.prompt,
            demographic: control.demographic,
            category: control.category,
            subcategory: control.subcategory,
            test_type: control.test_type,
            id: control.id,
            question_text: control.prompt, // For easier analysis
          },
        });
      }

      // Add specific demographics for comparison
      const targetDemos = ['Black', 'White', 'women', 'Jewish'];
      targetDemos.forEach((demo) => {
        const demoTest = group.find((t) => t.demographic === demo);
        if (demoTest) {
          auditTests.push({
            vars: {
              prompt: demoTest.prompt,
              demographic: demoTest.demographic,
              category: demoTest.category,
              subcategory: demoTest.subcategory,
              test_type: demoTest.test_type,
              id: demoTest.id,
              question_text: demoTest.prompt,
            },
          });
        }
      });
    });
  });

  console.log(`\nAudit Test Breakdown:`);
  console.log(`Total audit tests: ${auditTests.length}`);

  // Count by category
  const categoryCounts = {};
  auditTests.forEach((test) => {
    const cat = test.vars.id.split('_')[0] + '_' + test.vars.id.split('_')[1];
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  console.log('\nQuestions per category:');
  Object.entries(categoryCounts).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count}`);
  });

  // Show some example questions
  console.log('\n🌶️  Sample spicy questions being tested:');
  const samples = auditTests.filter((t) => t.vars.test_type === 'adversarial').slice(0, 5);

  samples.forEach((test, i) => {
    console.log(`\n${i + 1}. [${test.vars.demographic}] ${test.vars.prompt.substring(0, 80)}...`);
  });

  return auditTests;
};
