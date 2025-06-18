import type { SingleBar } from 'cli-progress';
import dedent from 'dedent';
import logger from '../logger';
import { loadApiProvider } from '../providers';
import { getDefaultProviders } from '../providers/defaults';
import type { TestCase, TestSuite, ApiProvider } from '../types';
import {  sampleArray } from '../util/generation';
import invariant from '../util/invariant';
import { extractJsonObjects } from '../util/json';

interface SynthesizeOptions {
  instructions?: string;
  numQuestions?: number;
  numTestCasesPerPersona?: number;
  prompts: string[];
  provider?: string;
  tests: TestCase[];
}

export function generateNewQuestionsPrompt(prompts: string[], testCases: TestCase[], numQuestions: number): string {
  const promptsString = dedent`<Prompts>
    ${prompts.map((prompt) => `<Prompt>\n${prompt}\n</Prompt>`).join('\n')}
    </Prompts>`;

  const allAssertions = testCases.flatMap(c => (c.assert || []));

  const testCasesString = `<ExistingTestCasesAsJson>${JSON.stringify(allAssertions)}</ExistingTestCasesAsJson>`;

  return dedent`
    Role: You are a senior data scientist specializing in metric design for stochastic AI systems. You will be given 
    an series of system prompts and existing assertions being tested in an evaluation, your task is to create objective evaluation questions that assess 
    individual AI responses—not the application holistically—based on input-output pairs. Make sure to generate questions that are different from ones that already exist.
    
    Clarification: Some applications (like scam detection, content moderation, or classification tasks) ask the AI to evaluate an input artifact. 
    Your task is **NOT** to evaluate the artifact (input) directly, but to assess the AI's response — i.e., how well the assistant performed the requested evaluation.
    For example, don’t ask: “Does the message contain suspicious links?”
    Instead, ask: “Did the response correctly identify suspicious links in the message?” or “Are the ratings in the output aligned with the rubric?”
    
    Core Requirements
    1. Question Types:
    Questions may use one of the following scoring formats: binary (Yes/No), 5-point Likert scale, or 0–1 continuous scale.
    Design each question to naturally align with its scale—for example, use binary for clear-cut presence/absence traits, Likert for subjective gradations, and continuous for measurable properties.
    Binary questions can still be scored on a Likert scale by mapping “Yes = 5” and “No = 1” if needed.
    
    IMPORTANT: Questions should be phrased so that a 'Yes' answer or higher score **always** indicates compliance with the desired metric or requirement.
    
    2. Focus:
    Questions can evaluate:
      i. Input-output relationships (e.g., "Does the output address all parts of the input query?").
      ii. Response attributes (e.g., structure, clarity, safety).
    Avoid holistic/system-level judgments (e.g., "Is the AI helpful?").
    
    3. Objectivity:
    Be as objective as possible. Replace ambiguous terms (e.g., "inspiring," "too long") with quantifiable criteria (e.g., "Is the output > 100 words?").
    Allowed subjectivity: Verbs/adjectives are fine if they describe inherent properties of language (e.g., "Does the response contain abusive language?").
      Rationale: "Abusive" is a property of language, even if borderline cases exist. 
    Avoid unbounded subjectivity (e.g., "Is the output extremely concise?" → replace with "Is the output ≤ 50 words?").
    In general, think of ways to replace subjective ideas with objective ones.
    
    4. Atomicity:
    Each question should test one attribute or relationship (e.g., split "Is the response clear and concise?" into two questions).
    
    5. Independence:
    Questions should avoid overlap to prevent double-counting issues in evaluation.
    
    6. Self-Containment:
    Permitted: Derive answers from the input/output text (e.g., "Does the output cite a verbatim quote from the input?").
    Forbidden: Reliance on external knowledge (e.g., "Is the cited source reputable?" → replace with "Does the citation include a DOI?").
    
    7. Special Cases:
    For creative tasks: Focus on technical execution (e.g., "Does each stanza have 4 lines?").
    For list outputs: Evaluate per item (e.g., "Does each bullet point contain a complete sentence?").
    
    Each question must be preceded by a label in Title Case, no longer than three words, that serves as a concise and descriptive title for the question.
    
    After writing each question, **always** set 'is_lower_score_desirable' to false because if the answer to the question is “Yes” (or higher score in case of likert/0-1 scales), 
    it always indicates a good response. You are only generating such type of questions.
    
    Each question should have a question_source. If the question is implied in the input application_description, use
    IMPLIED_IN_INSTRUCTIONS; otherwise if you are generating it from scratch, use FULLY_NEWLY_GENERATED.
    
    Each question should have a question_type. If the question is core for this specific application, use 
    CORE_FOR_APPLICATION. If the question is a generic check which applies to many other applications like check for
    abusive content or toxic language, use HORIZONTAL. If the question is regarding output format or some structure
    in the response of the application, use FORMAT_CHECK.
    
    Anti-Patterns to Avoid
    1. Reasoning Dependencies:
    Bad: "Is the argument persuasive?"
    Fixed: "Does the response list at least 2 supporting facts?"
    
    2. World Knowledge:
    Bad: "Is the cited author an expert?"
    Fixed: "Does the citation include the author’s institutional affiliation?"
    
    3. Unbounded Subjectivity:
    Bad: "Is the output extremely concise?"
    Fixed: "Is the output ≤ 3 sentences?"
    
    Process
    1. Classify the Application:
    First classify the application into appropriate categories such as information extraction, information summarization, creative task, analysis task.
    Note that an application can belong to multiple categories.
    Define key attributes (e.g., accuracy, structure, safety).
    
    2. Extract Implied Questions (Mandatory):
    Scan the application_description for any *implied requirements*—expectations stated or suggested in the instructions.
    For each implied requirement, generate an evaluation question marked with:
      - 'question_source = implied_in_instructions'
    These must be generated **before** any newly inferred or generic questions.
    
    3. Generate Deep Criteria (for new questions):
    For each key attribute not already covered by an implied question:
      - Identify subtle failure modes
      - Design objectively measurable, atomic, and independent evaluation criteria
      - Use quantifiable standards and avoid vague constructs
      - Generate questions with 'question_source = fully_newly_generated'
    
    4. Generate Questions:
    ${
        numQuestions > 0
          ? `Create total ${numQuestions} questions with:`
          : `Create a comprehensive set of evaluation questions with:`
      }
    Binary (if absolute criteria exist) or Likert/continuous scales.
    Concrete thresholds for quantifiable traits (e.g., word/line counts).
    
    **IMPORTANT**: You must prioritize and fully exhaust all questions implied by the application description before generating any new questions.
    ${
        numQuestions > 0
          ? `Do not generate any 'fully_newly_generated' questions if the implied questions alone fulfill the requested ${numQuestions}.`
          : ``
      }
    
    
    # OUTPUT FORMAT
    
    Only respond in JSON with no extra content.
    
    # EXAMPLES
    
    <application>
    Describe a recipe for an input dish in bulleted list format.
    </application>
    
    ${'```'}json
    
    {
      "questions": [
        {
          "label": "Ingredient Inclusion",
          "question": "Does the output list all necessary ingredients for the dish?",
          "question_source": "implied_in_instructions",
          "question_type": "core_for_application"
        },
        {
          "label": "Sequential Order",
          "question": "Are the preparation steps listed in a logical and sequential order?",
          "question_source": "implied_in_instructions",
          "question_type": "core_for_application"
        },
        {
          "label": "Step Completeness",
          "question": "Does each step in the recipe provide clear and complete instructions for preparation?",
          "question_source": "implied_in_instructions",
          "question_type": "core_for_application"
        },
        {
          "label": "Bullet Format",
          "question": "Is each item in the recipe presented as a distinct bullet point?",
          "question_source": "implied_in_instructions",
          "question_type": "format_check"
        },
        {
          "label": "Cooking Times",
          "question": "Are the cooking and preparation times mentioned in the recipe?",
          "question_source": "fully_newly_generated",
          "question_type": "core_for_application"
        },
        {
          "label": "Ingredient Quantities",
          "question": "Are the quantities for each ingredient specified in the recipe?",
          "question_source": "fully_newly_generated",
          "question_type": "core_for_application"
        },
        {
          "label": "Serving Size",
          "question": "Does the recipe specify the number of servings it makes?",
          "question_source": "fully_newly_generated",
          "question_type": "core_for_application"
        },
        {
          "label": "Filler Words",
          "question": "Does the recipe avoid including unnecessary details?",
          "question_source": "fully_newly_generated",
          "question_type": "horizontal"
        }
      ]
    }
    
    
    Consider the following prompt${prompts.length > 1 ? 's' : ''} for an LLM application:

    ${promptsString}
    
    ${allAssertions.length > 0 ? 
      "Existing cases are below: \n " + testCasesString : "There aren't any existing test cases yet"
    }
    
    `;
}

export function testCasesPrompt(
  prompts: string[],
  persona: string,
  tests: TestCase[],
  numTestCasesPerPersona: number,
  variables: string[],
  instructions?: string,
): string {
  const promptsString = dedent`
    <Prompts>
    ${prompts
      .map(
        (prompt) => dedent`
      <Prompt>
      ${prompt}
      </Prompt>`,
      )
      .join('\n')}
    </Prompts>`;
  const existingTests = dedent`
    Here are some existing tests:
    ${sampleArray(tests, 100)
      .map((test) => {
        if (!test.vars) {
          return;
        }
        return dedent`
          <Test>
          ${JSON.stringify(test.vars, null, 2)}
          </Test>`;
      })
      .filter(Boolean)
      .sort()
      .join('\n')}
  `;

  return dedent`
    Consider ${prompts.length > 1 ? 'these prompts' : 'this prompt'}, which contains some {{variables}}:
  ${promptsString}

  This is your persona:
  <Persona>
  ${persona}
  </Persona>

  ${existingTests}

  Fully embody this persona and determine a value for each variable, such that the prompt would be sent by this persona.

  You are a tester, so try to think of ${numTestCasesPerPersona} sets of values that would be interesting or unusual to test.${instructions ? ` ${instructions}` : ''}

  Your response should contain a JSON map of variable names to values, of the form {vars: {${Array.from(
    variables,
  )
    .map((varName) => `${varName}: string`)
    .join(', ')}}[]}`;
}

export async function synthesize({
  prompts,
  instructions,
  numQuestions,
  tests,
  provider,
}: SynthesizeOptions):Promise<string[]> {
  if (prompts.length < 1) {
    throw new Error('Assertion synthesis requires at least one prompt.');
  }

  let progressBar: SingleBar | undefined;
  if (logger.level !== 'debug') {
    const cliProgress = await import('cli-progress');
    progressBar = new cliProgress.SingleBar(
      { gracefulExit: true },
      cliProgress.Presets.shades_classic,
    );
    progressBar.start(1, 0);
  }

  logger.debug(
    `Starting assertion synthesis. We'll begin by generating a set of questions`,
  );

  logger.debug(
    `Generating user personas from ${prompts.length} prompt${prompts.length > 1 ? 's' : ''}...`,
  );

  let providerModel: ApiProvider;
  if (typeof provider === 'undefined') {
    providerModel = (await getDefaultProviders()).synthesizeProvider;
  } else {
    providerModel = await loadApiProvider(provider);
  }
  const DEFAULT_NUM_QUESTIONS = 5;
  let newQuestionsPrompt = generateNewQuestionsPrompt(prompts, tests, numQuestions || DEFAULT_NUM_QUESTIONS);
  if (instructions) {
    newQuestionsPrompt = `${newQuestionsPrompt}\n${instructions}`
  }
  logger.debug(`Generated questions prompt:\n${newQuestionsPrompt}`);
  const resp = await providerModel.callApi(newQuestionsPrompt);
  logger.debug(`Received questions response:\n${resp.output}`);
  invariant(typeof resp.output !== 'undefined', 'resp.output must be defined');
  const output = typeof resp.output === 'string' ? resp.output : JSON.stringify(resp.output);
  const respObjects = extractJsonObjects(output);
  invariant(
    respObjects.length >= 1,
    `Expected at least one JSON object in the response for questions, got ${respObjects.length}`,
  );
  const questionsWrapper = respObjects[0] as {questions: {label: string; question: string; question_source: string; question_type: string}[]};
  const questions = questionsWrapper.questions;
  logger.debug(
    `Generated ${questions.length} question${questions.length === 1 ? '' : 's'}:\n${questions.map((p) => `  - ${p.question}`).join('\n')}`,
  );

  if (progressBar) {
    progressBar.increment();
  }

  logger.debug(`Generated ${questions.length} new questions`);
  return questions.map(q => q.question);
}

export async function synthesizeFromTestSuite(
  testSuite: TestSuite,
  options: Partial<SynthesizeOptions>,
) {
  return synthesize({
    ...options,
    prompts: testSuite.prompts.map((prompt) => prompt.raw),
    tests: testSuite.tests || [],
  });
}
