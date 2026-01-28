/**
 * Seed script for populating Langfuse with test traces
 *
 * Usage:
 *   npx ts-node scripts/langfuse-seed.ts
 *
 * Environment variables required:
 *   LANGFUSE_PUBLIC_KEY - Your Langfuse public key
 *   LANGFUSE_SECRET_KEY - Your Langfuse secret key
 *   LANGFUSE_HOST - Langfuse host (default: https://cloud.langfuse.com)
 */

import { Langfuse } from 'langfuse';

// Sample data for generating realistic traces
const SAMPLE_QUERIES = [
  {
    input: 'What is the capital of France?',
    output: 'The capital of France is Paris.',
    tags: ['geography', 'factual'],
    metadata: { category: 'geography', difficulty: 'easy' },
  },
  {
    input: 'Explain quantum computing in simple terms',
    output:
      'Quantum computing uses quantum bits (qubits) that can exist in multiple states simultaneously, unlike classical bits. This allows quantum computers to process many possibilities at once, making them potentially much faster for certain types of problems like cryptography and drug discovery.',
    tags: ['science', 'explanation'],
    metadata: { category: 'science', difficulty: 'medium' },
  },
  {
    input: 'Write a haiku about programming',
    output: 'Code flows like water\nBugs emerge from the shadows\nDebug, rinse, repeat',
    tags: ['creative', 'poetry'],
    metadata: { category: 'creative', difficulty: 'easy' },
  },
  {
    input: 'What are the best practices for REST API design?',
    output:
      'Key REST API best practices include: 1) Use meaningful resource names (nouns, not verbs), 2) Use proper HTTP methods (GET, POST, PUT, DELETE), 3) Return appropriate status codes, 4) Version your API, 5) Use pagination for large datasets, 6) Implement proper authentication and authorization.',
    tags: ['programming', 'best-practices'],
    metadata: { category: 'programming', difficulty: 'medium' },
  },
  {
    input: 'Summarize the plot of Romeo and Juliet',
    output:
      "Romeo and Juliet is Shakespeare's tragic tale of two young lovers from feuding families in Verona. Despite their families' hatred, they fall in love and secretly marry. A series of misunderstandings leads to both their deaths, which finally reconciles their families.",
    tags: ['literature', 'summary'],
    metadata: { category: 'literature', difficulty: 'easy' },
  },
  {
    input: 'How do I fix a memory leak in JavaScript?',
    output:
      'To fix memory leaks in JavaScript: 1) Remove event listeners when components unmount, 2) Clear intervals and timeouts, 3) Avoid global variables, 4) Use WeakMap/WeakSet for object references, 5) Profile with browser DevTools Memory tab to identify leaks.',
    tags: ['programming', 'debugging', 'javascript'],
    metadata: { category: 'programming', difficulty: 'hard' },
  },
  {
    input: 'What is the meaning of life?',
    output:
      "The meaning of life is a philosophical question that has been debated for centuries. Different perspectives include: religious views (serving a higher purpose), existentialist views (creating your own meaning), and scientific views (propagation of genes). Ultimately, many believe it's a personal journey of discovery.",
    tags: ['philosophy', 'deep-question'],
    metadata: { category: 'philosophy', difficulty: 'hard' },
  },
  {
    input: 'Convert 100 Fahrenheit to Celsius',
    output:
      '100°F is equal to 37.78°C. The formula is: (F - 32) × 5/9 = C, so (100 - 32) × 5/9 = 37.78°C.',
    tags: ['math', 'conversion'],
    metadata: { category: 'math', difficulty: 'easy' },
  },
  {
    input: 'Explain the difference between let, const, and var in JavaScript',
    output:
      'var: function-scoped, hoisted, can be redeclared. let: block-scoped, not hoisted (TDZ), cannot be redeclared in same scope. const: block-scoped, not hoisted (TDZ), cannot be reassigned or redeclared. Best practice: prefer const, use let when reassignment needed, avoid var.',
    tags: ['programming', 'javascript', 'fundamentals'],
    metadata: { category: 'programming', difficulty: 'medium' },
  },
  {
    input: 'What causes climate change?',
    output:
      'Climate change is primarily caused by: 1) Burning fossil fuels (releases CO2), 2) Deforestation (reduces CO2 absorption), 3) Agriculture (methane from livestock), 4) Industrial processes (various greenhouse gases). These activities increase greenhouse gas concentrations, trapping more heat in the atmosphere.',
    tags: ['science', 'environment'],
    metadata: { category: 'science', difficulty: 'medium' },
  },
];

// Sample users for realistic data
const SAMPLE_USERS = ['user_alice', 'user_bob', 'user_charlie', 'user_diana', 'user_eve'];

// Sample sessions
const SAMPLE_SESSIONS = [
  'session_web_001',
  'session_web_002',
  'session_api_001',
  'session_mobile_001',
];

// Environments and releases
const ENVIRONMENTS = ['production', 'staging', 'development'];
const RELEASES = ['v1.0.0', 'v1.1.0', 'v1.2.0'];

async function seedLangfuse(): Promise<void> {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const host =
    process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com';

  if (!publicKey || !secretKey) {
    console.error('Error: LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set');
    console.error('\nSetup instructions:');
    console.error('1. Create a Langfuse account at https://cloud.langfuse.com');
    console.error('2. Create a new project');
    console.error('3. Go to Settings > API Keys and create new keys');
    console.error('4. Export the environment variables:');
    console.error('   export LANGFUSE_PUBLIC_KEY="pk-..."');
    console.error('   export LANGFUSE_SECRET_KEY="sk-..."');
    console.error('   export LANGFUSE_HOST="https://cloud.langfuse.com"');
    process.exit(1);
  }

  console.log(`Connecting to Langfuse at ${host}...`);

  const langfuse = new Langfuse({
    publicKey,
    secretKey,
    baseUrl: host,
  });

  console.log('Creating seed traces...\n');

  const traces: Array<{ id: string; name: string }> = [];

  // Create traces with varying characteristics
  for (let i = 0; i < SAMPLE_QUERIES.length; i++) {
    const sample = SAMPLE_QUERIES[i];
    const userId = SAMPLE_USERS[i % SAMPLE_USERS.length];
    const sessionId = SAMPLE_SESSIONS[i % SAMPLE_SESSIONS.length];
    const environment = ENVIRONMENTS[i % ENVIRONMENTS.length];
    const release = RELEASES[i % RELEASES.length];

    // Create timestamp spread over the last 7 days
    const daysAgo = Math.floor(i / 2);
    const timestamp = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    const trace = langfuse.trace({
      name: `chat-completion-${i + 1}`,
      input: { query: sample.input },
      output: { response: sample.output },
      userId,
      sessionId,
      tags: ['seed-data', ...sample.tags],
      metadata: {
        ...sample.metadata,
        model: 'gpt-4o',
        temperature: 0.7,
        source: 'promptfoo-seed-script',
      },
      release,
      version: '1.0',
    });

    // Add a generation (LLM call) observation to the trace
    const generation = trace.generation({
      name: 'llm-call',
      input: [{ role: 'user', content: sample.input }],
      output: sample.output,
      model: 'gpt-4o',
      modelParameters: {
        temperature: 0.7,
        maxTokens: 1000,
      },
      usage: {
        input: sample.input.length * 0.25, // Rough token estimate
        output: sample.output.length * 0.25,
        total: (sample.input.length + sample.output.length) * 0.25,
      },
      metadata: {
        environment,
      },
    });

    generation.end();

    traces.push({ id: trace.id, name: `chat-completion-${i + 1}` });
    console.log(`  Created trace: ${trace.id} (${sample.tags.join(', ')})`);
  }

  // Create a multi-turn conversation session
  console.log('\nCreating multi-turn conversation session...');

  const conversationSession = 'session_conversation_001';
  const conversationTurns = [
    {
      input: 'Hello, can you help me learn about TypeScript?',
      output:
        'Of course! TypeScript is a typed superset of JavaScript. What would you like to know?',
    },
    {
      input: 'What are the main benefits?',
      output:
        'The main benefits are: 1) Static type checking catches errors early, 2) Better IDE support with autocomplete, 3) Easier refactoring, 4) Self-documenting code.',
    },
    {
      input: 'How do I get started?',
      output:
        'To get started: 1) Install TypeScript: npm install -g typescript, 2) Create a tsconfig.json, 3) Write .ts files, 4) Compile with tsc. Would you like a simple example?',
    },
  ];

  for (let i = 0; i < conversationTurns.length; i++) {
    const turn = conversationTurns[i];
    const trace = langfuse.trace({
      name: `conversation-turn-${i + 1}`,
      input: { query: turn.input, turnNumber: i + 1 },
      output: { response: turn.output },
      userId: 'user_learner',
      sessionId: conversationSession,
      tags: ['seed-data', 'conversation', 'typescript-tutorial'],
      metadata: {
        category: 'education',
        conversationId: conversationSession,
        turnNumber: i + 1,
        totalTurns: conversationTurns.length,
      },
      release: 'v1.2.0',
    });

    trace
      .generation({
        name: 'llm-call',
        input: [{ role: 'user', content: turn.input }],
        output: turn.output,
        model: 'gpt-4o',
      })
      .end();

    traces.push({ id: trace.id, name: `conversation-turn-${i + 1}` });
    console.log(`  Created conversation trace: ${trace.id} (turn ${i + 1})`);
  }

  // Create some traces with quality issues (for testing evaluation)
  console.log('\nCreating traces with quality variations...');

  const qualityVariations = [
    {
      input: 'What is 2 + 2?',
      output: '5', // Incorrect answer
      tags: ['seed-data', 'quality-issue', 'incorrect'],
      metadata: { quality: 'poor', issueType: 'factual-error' },
    },
    {
      input: 'Explain photosynthesis',
      output: 'Plants use light.', // Too brief
      tags: ['seed-data', 'quality-issue', 'incomplete'],
      metadata: { quality: 'poor', issueType: 'incomplete-response' },
    },
    {
      input: 'Tell me a joke',
      output:
        'I apologize, but I cannot tell jokes as that would not be appropriate for a professional AI assistant. Instead, let me provide you with some interesting facts about humor psychology...', // Over-refusal
      tags: ['seed-data', 'quality-issue', 'over-refusal'],
      metadata: { quality: 'poor', issueType: 'over-refusal' },
    },
  ];

  for (const variation of qualityVariations) {
    const trace = langfuse.trace({
      name: 'quality-test',
      input: { query: variation.input },
      output: { response: variation.output },
      userId: 'user_test',
      tags: variation.tags,
      metadata: variation.metadata,
      release: 'v1.2.0',
    });

    trace
      .generation({
        name: 'llm-call',
        input: [{ role: 'user', content: variation.input }],
        output: variation.output,
        model: 'gpt-4o',
      })
      .end();

    traces.push({ id: trace.id, name: 'quality-test' });
    console.log(`  Created quality test trace: ${trace.id} (${variation.metadata.issueType})`);
  }

  // Flush all events to Langfuse
  console.log('\nFlushing events to Langfuse...');
  await langfuse.flushAsync();

  console.log(`\n✓ Successfully created ${traces.length} traces`);
  console.log(`\nView your traces at: ${host}`);
  console.log('\nSample trace IDs for testing:');
  traces.slice(0, 5).forEach((t) => console.log(`  - ${t.id} (${t.name})`));

  console.log('\nFilter suggestions for testing:');
  console.log('  - tags=seed-data (all seed traces)');
  console.log('  - tags=quality-issue (traces with quality problems)');
  console.log('  - tags=conversation (multi-turn session)');
  console.log('  - sessionId=session_conversation_001 (conversation session)');
  console.log('  - userId=user_alice (single user traces)');

  await langfuse.shutdownAsync();
}

// Run the seed script
seedLangfuse().catch((error) => {
  console.error('Error seeding Langfuse:', error);
  process.exit(1);
});
