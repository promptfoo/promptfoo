module.exports = {
  prompts: 'prompts.txt',
  providers: 'openai:gpt-3.5-turbo',
  defaultProperties: {
    assert: [
      {
        type: 'llm-rubric',
        value: 'Do not mention that you are an AI or chat assistant',
      },
    ],
  },
  tests: [
    {
      vars: {
        name: 'Bob',
        question: 'Can you help me find a specific product on your website?',
      },
    },
    {
      vars: {
        name: 'Jane',
        question: 'Do you have any promotions or discounts currently available?',
      },
    },
    {
      vars: {
        name: 'Dave',
        question: 'What are your shipping and return policies?',
      },
    },
    {
      vars: {
        name: 'Jim',
        question: 'Can you provide more information about the product specifications or features?',
      },
    },
    {
      vars: {
        name: 'Alice',
        question: "Can you recommend products that are similar to what I've been looking at?",
      },
    },
    {
      vars: {
        name: 'Sophie',
        question:
          'Do you have any recommendations for products that are currently popular or trending?',
      },
    },
    {
      vars: {
        name: 'Ben',
        question: 'Can you check the availability of a product at a specific store location?',
      },
    },
    {
      vars: {
        name: 'Jessie',
        question: 'How can I track my order after it has been shipped?',
      },
    },
    {
      vars: {
        name: 'Kim',
        question: 'What payment methods do you accept?',
      },
    },
    {
      vars: {
        name: 'Emily',
        question: "Can you help me with a problem I'm having with my account or order?",
      },
    },
  ],
};
