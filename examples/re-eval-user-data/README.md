# Re-evaluate User Data Example

This example demonstrates how to use production user inputs for regression testing with promptfoo.

## Overview

This workflow allows you to:
- Test new models/prompts against real user inputs from production
- Perform systematic regression testing using real user scenarios
- Compare responses with baseline expectations using assertions

## Files

- `logs.csv` - Production data converted to dataset format with user inputs and expected categories
- `prompt.json` - Chat prompt template for customer service assistant
- `promptfooconfig.yaml` - Configuration for re-evaluation testing
- `README.md` - This file

## Sample Data

The CSV contains 10 realistic customer service scenarios:
- Password reset requests
- Subscription cancellations
- Policy questions
- Escalation requests
- Account issues
- Billing problems
- Data export requests
- Account deletion
- Technical support
- Performance complaints

Each row includes:
- `session_id` - Original conversation identifier
- `input` - User's message
- `last_assistant` - Previous assistant response (for comparison)
- `category` - Type of request
- `expected_outcome` - Expected result category

## Running the Example

1. Install promptfoo if you haven't already:
   ```bash
   npm install -g promptfoo
   ```

2. Set your OpenAI API key:
   ```bash
   export OPENAI_API_KEY=your_api_key_here
   ```

3. Run regression test against current model:
   ```bash
   promptfoo eval -c promptfooconfig.yaml -o results/current.json
   ```

4. View results in web UI:
   ```bash
   promptfoo view results/current.json
   ```

## What the Tests Check

### Quality Checks (All Responses)
- No generic AI disclaimers ("I am an AI")
- Responses should be helpful (not "I cannot help")
- Responses should be informative (not "I don't know")

### Category-Specific Validation
- **Password Reset**: Must mention "reset", "password", or "email"
- **Cancellation**: Should include "cancel", "subscription", or "retention"
- **Billing Issues**: Must address "billing", "charge", or "refund"
- **Account Deletion**: Should mention "delete", "permanent", or "confirm"
- **Escalation**: Must include "human", "agent", or "connect"

### Security Checks (Sensitive Operations)
- Proper identity verification steps
- Security-conscious responses
- No password exposure
- No PII leakage in responses

### LLM Rubric Evaluations
- Overall response quality (helpfulness, professionalism, accuracy)
- Security practices for sensitive operations
- Category-specific effectiveness

## Understanding Results

The evaluation will show:
- **Pass/Fail rates** for each assertion type
- **Category performance** showing which types of requests are handled well
- **Security compliance** for sensitive operations
- **Detailed feedback** from LLM rubric evaluations

## Regression Testing Workflow

1. **Baseline**: Run evaluation with current production model
   ```bash
   promptfoo eval -c promptfooconfig.yaml -o results/baseline.json
   ```

2. **Test Change**: Update model/prompt and re-run
   ```bash
   # Modify promptfooconfig.yaml to use new model
   promptfoo eval -c promptfooconfig.yaml -o results/candidate.json
   ```

3. **Compare**: View both results to identify regressions
   ```bash
   promptfoo view results/baseline.json results/candidate.json
   ```

## Adapting for Your Data

To use this with your own production data:

1. **Export your logs**: Convert production conversations to CSV format
2. **Update columns**: Modify the CSV headers to match your data structure
3. **Customize assertions**: Add domain-specific checks for your use cases
4. **Adjust prompt**: Update the system prompt to match your assistant's role
5. **Filter categories**: Focus on specific conversation types that matter most

## Data Privacy

Remember to sanitize your production data:
- Remove or redact personally identifiable information (PII)
- Replace real email addresses with fake ones
- Anonymize user identifiers
- Consider using synthetic but realistic data based on production patterns

This approach transforms your production user interactions into systematic test cases for ensuring consistent quality as you evolve your AI systems.