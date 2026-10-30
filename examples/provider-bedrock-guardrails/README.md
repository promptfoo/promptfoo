# provider-bedrock-guardrails (Amazon Bedrock Guardrails)

Evaluate Amazon Bedrock Guardrails directly with `ApplyGuardrail`, a Bedrock API key,
and Promptfoo's HTTP provider. No foundation model is invoked and no model access
is required. Guardrail assessments incur AWS charges.

## Get started

```bash
npx promptfoo@latest init --example provider-bedrock-guardrails
cd provider-bedrock-guardrails
```

You need an AWS account and a region that supports both Bedrock API keys and the
guardrail policies in this example. The commands below use `us-east-1`.

## 1. Create the DRAFT guardrail

The included `cloudformation.yaml` creates one `AWS::Bedrock::Guardrail` with:

- High-strength hate, insult, sexual, and violence filters for inputs and outputs.
- A custom word filter for `forbidden-example-token`.
- An email PII filter with the `BLOCK` action.

It creates only the editable `DRAFT`, without publishing a numbered version.

**Deployment uses AWS CLI credentials, separately from the API key used for evaluation.**
Log in using your usual method, for example IAM Identity Center:

```bash
aws sso login --profile your-profile
export AWS_PROFILE=your-profile
export AWS_REGION=us-east-1

aws cloudformation deploy \
  --template-file cloudformation.yaml \
  --stack-name promptfoo-bedrock-guardrails \
  --region "$AWS_REGION"
```

Alternatively, use `aws login --profile your-profile` with a supported AWS CLI.
Your deployment identity needs CloudFormation stack permissions and permissions
to create, inspect, update, and delete Bedrock guardrails. The template creates no
IAM users, roles, policies, or API keys.

Read the stack outputs and configure the evaluation:

```bash
aws cloudformation describe-stacks \
  --stack-name promptfoo-bedrock-guardrails \
  --region "$AWS_REGION" \
  --query 'Stacks[0].Outputs' \
  --output table

export BEDROCK_GUARDRAIL_ID=$(aws cloudformation describe-stacks \
  --stack-name promptfoo-bedrock-guardrails \
  --region "$AWS_REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`GuardrailId`].OutputValue | [0]' \
  --output text)
export BEDROCK_GUARDRAIL_VERSION=DRAFT
```

You can also use an existing guardrail. Set its ID, version, and region, and adapt
the test expectations to its policies.

## 2. Configure the Bedrock API key

Generate a **short-term Amazon Bedrock API key** in the AWS console and set it in
your shell locally:

```bash
export AWS_BEARER_TOKEN_BEDROCK='your-short-term-bedrock-api-key'
```

This is a Bedrock bearer token, not an AWS access key ID or secret access key.
Do not commit it. Short-term keys expire with their session (at most 12 hours);
generate a new key when it expires.

The identity represented by the key must have `bedrock:ApplyGuardrail` permission
on the stack's `GuardrailArn`. An administrator can use the following policy,
replacing the example ARN with the actual stack output:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "bedrock:ApplyGuardrail",
      "Resource": "arn:aws:bedrock:us-east-1:123456789012:guardrail/your-guardrail-id"
    }
  ]
}
```

The template does not grant this permission automatically. A key alone does not
grant access to the guardrail.

| Variable                    | Purpose                         | Default     |
| --------------------------- | ------------------------------- | ----------- |
| `AWS_BEARER_TOKEN_BEDROCK`  | Bedrock API key                 | Required    |
| `BEDROCK_GUARDRAIL_ID`      | Guardrail ID                    | Required    |
| `BEDROCK_GUARDRAIL_VERSION` | Draft or published version      | `DRAFT`     |
| `AWS_REGION`                | Region containing the guardrail | `us-east-1` |

## 3. Run the evaluation

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache -o results.json
```

For development in the Promptfoo repository, run from the repository root using
the local build:

```bash
npm run local -- eval \
  -c examples/provider-bedrock-guardrails/promptfooconfig.yaml \
  --no-cache -o results.json
```

The example sends `source: INPUT` and evaluates greetings, a factual question, a
custom blocked word, a fictional email address, and a harmful request.
`guardrails` expects content to pass; `not-guardrails` expects an intervention.
Content and PII detection depend on AWS classifiers; unexpected results are useful
findings to inspect rather than guaranteed matches. The custom word case provides
a straightforward check of the configured word policy.

The response transform maps `GUARDRAIL_INTERVENED` to `guardrails.flagged` and
`guardrails.flaggedInput`. It retains the complete assessment, usage, and output
in `metadata.bedrockGuardrails`. Unexpected response actions raise an error rather
than being classified as allowed content. Inspect the exported results for
per-test success, score, errors, and policy assessments.

This configuration assesses inputs only. To assess model responses instead, change
`source` to `OUTPUT` and update the transform to set `flaggedOutput` instead of
`flaggedInput`. No LLM is called in either mode.

## Cleanup

Delete the example resources when finished, using your AWS CLI credentials:

```bash
aws cloudformation delete-stack \
  --stack-name promptfoo-bedrock-guardrails \
  --region "$AWS_REGION"
aws cloudformation wait stack-delete-complete \
  --stack-name promptfoo-bedrock-guardrails \
  --region "$AWS_REGION"
unset AWS_BEARER_TOKEN_BEDROCK
```

## References

- [ApplyGuardrail API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ApplyGuardrail.html)
- [Bedrock API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html)
- [Guardrail permissions](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-permissions.html)
- [CloudFormation guardrail resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-bedrock-guardrail.html)
- [Promptfoo guardrails assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/guardrails/)
