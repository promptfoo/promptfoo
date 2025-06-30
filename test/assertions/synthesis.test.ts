import dedent from 'dedent';
import {
  generateNewQuestionsPrompt,
  synthesize,
  convertQuestionToPythonPrompt,
} from '../../src/assertions/synthesis';
import { loadApiProvider } from '../../src/providers';
import type { TestCase } from '../../src/types';

jest.mock('../../src/providers', () => ({
  loadApiProvider: jest.fn(),
}));

describe('synthesize', () => {
  it('should generate assertions based on config prompts and existing assertions', async () => {
    let i = 0;
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: jest.fn(() => {
        if (i === 0) {
          i++;
          return Promise.resolve({
            output:
              '{"questions": [{"label": "metric1", "question" : "test question", "question_source": "IMPLIED_IN_INSTRUCTIONS", "question_type": "CORE_FOR_APPLICATION" }]}',
          });
        }
        return Promise.resolve({ output: 'None' });
      }),
    };
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);
    const result = await synthesize({
      provider: 'mock-provider',
      prompts: ['Test prompt'],
      tests: [],
      numQuestions: 1,
      type: 'pi',
    });

    expect(result).toHaveLength(1);
    expect(result).toEqual([{ metric: 'metric1', value: 'test question', type: 'pi' }]);
  });
});

describe('generateNewQuestionsPrompt', () => {
  it('should generate a prompt that uses multiple system prompts and all assertions', () => {
    const prompts = ['What is the capital of France?', 'What is the capital of Germany?'];
    const testCases: TestCase[] = [
      {
        assert: [
          {
            type: 'llm-rubric',
            value: 'test question',
          },
        ],
      },
    ];
    const result = generateNewQuestionsPrompt(prompts, testCases, 1);
    expect(result).toBe(dedent`
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
    Create total 1 questions with:
    Binary (if absolute criteria exist) or Likert/continuous scales.
    Concrete thresholds for quantifiable traits (e.g., word/line counts).
    
    **IMPORTANT**: You must prioritize and fully exhaust all questions implied by the application description before generating any new questions.
    Do not generate any 'fully_newly_generated' questions if the implied questions alone fulfill the requested 1.
    
    
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
    \`\`\`json
    
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
    
    
    Consider the following prompts and assertions for an LLM application:
    
    <Prompts>
      <Prompt>
        What is the capital of France?
      </Prompt>
      <Prompt>
        What is the capital of Germany?
      </Prompt>
    </Prompts>
    
    <existing_assertions>
      [
        {
          "type": "llm-rubric",
          "value": "test question"
        }
      ]
    </existing_assertions>
    `);
  });
});

describe('convertQuestionToPythonPrompt', () => {
  it('should generate a prompt that uses multiple system prompts and all assertions', () => {
    const result = convertQuestionToPythonPrompt(
      ['What is the capital of France?', 'What is the capital of Germany?'],
      'Is the response clear?',
    );
    expect(result).toBe(dedent`
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
        <Prompt>
          What is the capital of France?
        </Prompt>
        <Prompt>
          What is the capital of Germany?
        </Prompt>
      </Prompts>
    </application_description>
    <question>
    Is the response clear?
    </question>
    `);
  });
});
