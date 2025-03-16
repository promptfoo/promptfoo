module.exports = {
  customFunction: (output, context) => {
    console.log('Prompt:', context.prompt);
    console.log('Vars', context.vars.topic);

    // You can return a bool...
    // return output.toLowerCase().includes('bananas');

    // A score (where 0 = Fail)...
    // return 0.5;

    // Or an entire grading result, which can be simple...
    let result = {
      pass: output.toLowerCase().includes('bananas'),
      score: 0.5,
      reason: 'Contains banana',
    };

    // Or include nested assertions...
    result = {
      pass: true,
      score: 0.75,
      reason: 'Looks good to me',
      componentResults: [
        {
          pass: output.toLowerCase().includes('bananas'),
          score: 0.5,
          reason: 'Contains banana',
          namedScores: {
            'Uses banana': 1.0,
          },
        },
        {
          pass: output.toLowerCase().includes('yellow'),
          score: 0.5,
          reason: 'Contains yellow',
          namedScores: {
            Yellowish: 0.66,
          },
        },
      ],
    };

    return result;
  },
};
