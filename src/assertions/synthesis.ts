import type { SingleBar } from 'cli-progress';
import dedent from 'dedent';
import logger from '../logger';
import { loadApiProvider } from '../providers';
import { getDefaultProviders } from '../providers/defaults';
import type { TestCase, TestSuite, ApiProvider, Assertion } from '../types';
import { sampleArray } from '../util/generation';
import invariant from '../util/invariant';
import { extractJsonObjects } from '../util/json';

interface SynthesizeOptions {
  instructions?: string;
  numQuestions?: number;
  prompts: string[];
  provider?: string;
  tests: TestCase[];
  type?: 'pi' | 'g-eval' | 'llm-rubric';
}

export function generateNewQuestionsPrompt(
  prompts: string[],
  testCases: TestCase[],
  numQuestions: number,
): string {
  const allAssertions = testCases.flatMap((c) => c.assert || []);

  return dedent`
      Role: You are a senior data scientist specializing in metric design for stochastic AI systems. You will be given 
      an series of system prompts and existing assertions being tested in an evaluation, your task is to create objective evaluation questions that assess 
      individual AI responses—not the application holistically—based on input-output pairs. 
      
      Make sure to generate questions that are different from ones that already exist.
      
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
      Questions should avoid overlap to prevent double-counting issues in evaluation. They should not overlap with any assertions either.
      
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
      <existing_assertions>
      [
        {
          "type" : "llm-rubric",
          "value": "Does the output list all necessary ingredients for the dish?",
          "metric": "Ingredient Inclusion"
        },
        {
          "type" : "g-eval",
          "value": "Does each step in the recipe provide clear and complete instructions for preparation?"
        }
      ]
      </existing_assertions>
      ${'```'}json
      
      {
        "questions": [
          {
            "label": "Sequential Order",
            "question": "Are the preparation steps listed in a logical and sequential order?",
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
    
    
      Consider the following prompt${prompts.length > 1 ? 's' : ''} and assertions for an LLM application:
      
      <Prompts>
  ${prompts
    .map(
      (prompt, i) =>
        `      ${i > 0 ? '  ' : ''}<Prompt>
          ${prompt}
        </Prompt>`,
    )
    .join('\n')}
      </Prompts>
     
      <existing_assertions>
        ${JSON.stringify(allAssertions, null, 2)
          .split('\n')
          .map((line, i) => (i > 0 ? `        ${line}` : line))
          .join('\n')}
      </existing_assertions>`;
}

export function convertQuestionToPythonPrompt(prompts: string[], question: string) {
  return dedent`
    You are a specialized system that analyzes an LLM evaluation question and generates a Python function to automatically check LLM responses against the specific criterion. 
    Your task is to determine if the given evaluation question can be reliably answered using a deterministic Python function.
    
    ## Input Format
    You will be provided with:
    1. A description of the LLM application (string)
    2. A single evaluation question used to assess LLM responses (string)
    
    ## Output Format
    For the evaluation question, you must:
    
    - Determine if the question can be reliably answered with a deterministic Python function using ONLY the LLM response
    - If YES: Return only the Python function body (without the function signature) that:
      - Assumes the LLM's response text is available as a string variable named \`output\`
      - Returns a dictionary with two keys:
        - \`'pass'\`: boolean value (True if criterion is met, False if not)
        - \`'score'\`: float value (1.0 if criterion is met, 0.0 if not)
      - The Answer "Yes" to the question should correspond to \`{'pass': True, 'score': 1.0}\`
      - The answer "No" to the question should correspond to \`{'pass': False, 'score': 0.0}\`
      - Includes clear comments
      - Handles edge cases gracefully (e.g., empty responses, invalid formats)
      - Performs any necessary parsing of the response string (JSON parsing, text extraction, etc.)
    - If NO: Return the string "None" (when the question requires semantic understanding, subjective judgment, domain expertise, or requires examining the original prompt/input)
    
    ## Critical Requirements
    - The function must evaluate ONLY the LLM response itself, which will always be provided as a string
    - The evaluation question might refer to the LLM output by domain-specific terms (e.g., "story", "recipe", "code", "answer") based on the application description, rather than generic terms like "response" or "output"
    - Regardless of terminology used in the question, the variable name in your code must be "output".                                                               
    - If evaluation requires comparing the response to the original prompt/input, return "None"
    - If evaluation requires external knowledge, context, or resources, return "None"
    - When in doubt, return "None" rather than an unreliable function
    - Any required parsing (JSON, XML, etc.) must be handled within the function
                                          
    ## IMPORTANT
    - Return "None" for any evaluation that requires semantic understanding or could have multiple valid expressions
    - For questions about greetings, politeness, tone, style, or other subjective language features, return "None"
    - Avoid creating functions that rely on hardcoded lists of phrases, expressions, or patterns when the concept being evaluated could be expressed in many different ways
    - Only create functions for criteria that can be evaluated through standardized, unambiguous patterns or clear structural properties
                                                                          
    ## Guidelines for Domain-Specific References
    - When the question refers to the output by a domain-specific term (e.g., "Is the story less than 2 lines long?", "Does the recipe include four or more spices?"), understand that it's referring to the same content that will be available as the \`output\` variable
    - The application description often provides context for what type of output to expect (story, recipe, etc.)
    
    ## Guidelines for Function Generation
    
    ### Questions Suitable for Functions (return a function):
    - Counting elements (words, sentences, lines, items)
    - Checking for presence of specific strings, patterns, or structures within the response
    - Validating formats (JSON, dates, emails, etc.)
    - Measuring response length in characters/bytes etc
    - Checking for code syntax, structure, or presence of specific elements
    - Verifying mathematical properties or numerical ranges
    
    ### Questions NOT Suitable for Functions (return "None"):
    - Any evaluation requiring comparison to the original prompt
    - Evaluating relevance, accuracy, or helpfulness
    - Assessing tone, intent, style, sentiment or semantics
    - Checking factual correctness
    - Determining completeness of explanations
    - Evaluating creativity or originality
    - Assessing logical coherence or reasoning quality
    - Any judgment requiring domain expertise
    - Any evaluation that would require an exhaustive list of possible expressions (like apologies, call-to-action etc.)
                                          
    Please provide only the Python function body without markdown formatting or function signature. 
    The function body should assume the LLM's response is available as a variable named \`output\`.
    Also include the necessary import statements within the function body itself.
    
    ## Example Input/Output Pairs
                                          
    ### Example 1:
    **Application Description:** A JSON API documentation system
    **Evaluation Question:** "Does the response contain valid JSON?"
    
    **Output:**
    \`\`\`python
    import json
    import re
    
    # Try to find JSON blocks in the output
    # Look for content within code blocks with \`\`\`json
    json_block_pattern = r'\`\`\`(?:json)?\\s*([\\s\\S]*?)\\s*\`\`\`'
    json_blocks = re.findall(json_block_pattern, output)
    
    # Also look for content within curly braces that might be JSON
    potential_json = re.findall(r'(\\{[\\s\\S]*?\\})', output)
    
    # Combine all potential JSON content
    all_potential_json = json_blocks + potential_json
    
    # If we don't find any potential JSON patterns, return False
    if not all_potential_json:
        return {'pass': False, 'score': 0.0}
    
    # Try to parse each potential JSON block
    for json_str in all_potential_json:
        try:
            json.loads(json_str)
            return {'pass': True, 'score': 1.0}  # Valid JSON found
        except json.JSONDecodeError:
            continue
    
    return {'pass': False, 'score': 0.0}  # No valid JSON found
    \`\`\`
    
    ### Example 2:
    **Application Description:** A customer service chatbot
    **Evaluation Question:** "Does the response address the customer's initial query?"
    
    **Output:**
    None
                                          
    ### Example 3:
    **Application Description:** A code assistant that generates SQL queries.
    **Evaluation Question:** "Does the SQL query use a JOIN statement?"
    
    **Output:**
    \`\`\`python
    import re
    
    # Convert to lowercase for case-insensitive matching
    output_lower = output.lower()
    
    # Extract code blocks if present
    code_blocks = re.findall(r'\`\`\`(?:sql)?([^\`]+)\`\`\`', output_lower)
    
    # If code blocks are found, check them first
    if code_blocks:
        for block in code_blocks:
            # Check for JOIN keyword with word boundaries
            if re.search(r'\\b(join|inner\\s+join|left\\s+join|right\\s+join|full\\s+join|cross\\s+join)\\b', block):
                return {'pass': True, 'score': 1.0}
    
    # If no code blocks or no JOIN found in code blocks, check the entire output
    join_patterns = [
        r'\\b(join)\\b',
        r'\\b(inner\\s+join)\\b',
        r'\\b(left\\s+join)\\b',
        r'\\b(right\\s+join)\\b',
        r'\\b(full\\s+join)\\b',
        r'\\b(cross\\s+join)\\b'
    ]
    
    for pattern in join_patterns:
        if re.search(pattern, output_lower):
            return {'pass': True, 'score': 1.0}
    
    return {'pass': False, 'score': 0.0}
    \`\`\`
    
    ### Example 4:
    **Application Description:** An eval agent that can plan weekend trips.
    **Evaluation Question:** "Does the response exceed 1500 words?"
    
    **Output:**
    \`\`\`python
    # Split the output into words
    words = output.split()
    
    # Count the number of words
    word_count = len(words)
    
    # Check if the word count exceeds 1500
    if word_count > 1500:
        return {'pass': True, 'score': 1.0}
    return {'pass': False, 'score': 0.0}
    \`\`\`
    
    ### Example 5:
    **Application Description:** A customer service chatbot
    **Evaluation Question:** "Does the response start with a greeting?"
    
    **Output:**
    None
    
    Remember: When in doubt, return "None". It's better to use some other evaluation mechanism than to generate an unreliable function.
      
    <application_description>
      <Prompts>
  ${prompts
    .map(
      (prompt, i) =>
        `      ${i > 0 ? '  ' : ''}<Prompt>
          ${prompt}
        </Prompt>`,
    )
    .join('\n')}
      </Prompts>
    </application_description>
    <question>
    ${question}
    </question>
`;
}

interface GeneratedQuestion {
  label: string;
  question: string;
  question_source: string;
  question_type: string;
}

export async function synthesize({
  prompts,
  instructions,
  numQuestions = 5,
  tests,
  provider,
  type = 'pi',
}: SynthesizeOptions): Promise<Assertion[]> {
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
    progressBar.start(1 + numQuestions, 0);
  }

  logger.debug(`Starting assertion synthesis. We'll begin by generating a set of questions`);

  logger.debug(
    `Generating user personas from ${prompts.length} prompt${prompts.length > 1 ? 's' : ''}...`,
  );

  let providerModel: ApiProvider;
  if (typeof provider === 'undefined') {
    providerModel = (await getDefaultProviders()).synthesizeProvider;
  } else {
    providerModel = await loadApiProvider(provider);
  }
  let newQuestionsPrompt = generateNewQuestionsPrompt(prompts, tests, numQuestions);
  if (instructions) {
    newQuestionsPrompt = `${newQuestionsPrompt}\n${instructions}`;
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
  const questionsWrapper = respObjects[0] as { questions: GeneratedQuestion[] };
  const questions = sampleArray(questionsWrapper.questions, numQuestions);

  logger.debug(
    `Generated ${questions.length} question${questions.length === 1 ? '' : 's'}:\n${questions.map((p) => `  - ${p.question}`).join('\n')}`,
  );

  if (progressBar) {
    progressBar.increment();
  }
  // Determine which dimensions should be objectively answered with python. If so, generate the python.
  providerModel.config = {
    maxTokens: 3000,
  };
  const assertions = await Promise.all(
    questions.map(async (q) => {
      const pythonConvertPrompt = convertQuestionToPythonPrompt(prompts, q.question);
      const resp = await providerModel.callApi(pythonConvertPrompt);
      const output: string = resp.output;
      if (progressBar) {
        progressBar.increment();
      }

      if (output.toLowerCase().trim() == 'none') {
        return { type, metric: q.label, value: q.question };
      } else {
        return {
          type: 'python' as Assertion['type'],
          metric: q.label,
          value: output,
        };
      }
    }),
  );
  logger.debug(`Generated ${assertions.length} new assertions`);
  if (progressBar) {
    progressBar.stop();
  }
  return assertions;
}

export async function synthesizeFromTestSuite(
  testSuite: TestSuite,
  options: Partial<SynthesizeOptions>,
): Promise<Assertion[]> {
  return synthesize({
    ...options,
    prompts: testSuite.prompts.map((prompt) => prompt.raw),
    tests: testSuite.tests || [],
  });
}
