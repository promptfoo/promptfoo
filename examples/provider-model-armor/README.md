# provider-model-armor (Google Cloud Model Armor)

This directory contains examples for testing Google Cloud Model Armor with Promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example provider-model-armor
cd provider-model-armor
```

Model Armor is a managed service that can screen LLM prompts and responses for:

- **Responsible AI (RAI)**: Hate speech, harassment, sexually explicit, dangerous content
- **CSAM**: Child safety content detection (always enabled)
- **Prompt Injection & Jailbreak**: Detects manipulation attempts
- **Malicious URLs**: Phishing and threat detection
- **Sensitive Data Protection (SDP)**: Credit cards, SSNs, financial identifiers, and Google Cloud credentials

## Prerequisites

1. **Enable Model Armor API**:

   ```bash
   gcloud services enable modelarmor.googleapis.com --project=YOUR_PROJECT_ID
   ```

2. **Grant IAM Permissions** (for Vertex AI integration):

   ```bash
   PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-aiplatform.iam.gserviceaccount.com" \
     --role="roles/modelarmor.user"
   ```

3. **Set the regional API endpoint** (for direct API testing):

   ```bash
   gcloud config set api_endpoint_overrides/modelarmor \
     "https://modelarmor.us-central1.rep.googleapis.com/"
   ```

4. **Create a Model Armor template**:

   ```bash
   gcloud model-armor templates create basic-safety \
     --location=us-central1 \
     --rai-settings-filters='[{"filterType":"HATE_SPEECH","confidenceLevel":"MEDIUM_AND_ABOVE"},{"filterType":"HARASSMENT","confidenceLevel":"MEDIUM_AND_ABOVE"},{"filterType":"DANGEROUS","confidenceLevel":"MEDIUM_AND_ABOVE"},{"filterType":"SEXUALLY_EXPLICIT","confidenceLevel":"MEDIUM_AND_ABOVE"}]' \
     --pi-and-jailbreak-filter-settings-enforcement=enabled \
     --pi-and-jailbreak-filter-settings-confidence-level=medium-and-above \
     --malicious-uri-filter-settings-enforcement=enabled \
     --basic-config-filter-enforcement=enabled
   ```

5. **Set environment variables** (for direct API testing):

   ```bash
   export GOOGLE_PROJECT_ID=your-project-id
   export MODEL_ARMOR_LOCATION=us-central1
   export MODEL_ARMOR_TEMPLATE=basic-safety
   export GCLOUD_ACCESS_TOKEN=$(gcloud auth print-access-token)
   ```

   Note: Access tokens expire after 1 hour. For CI/CD, use service account keys or Workload Identity Federation.

## Examples

### 1. Direct Model Armor API Testing

Test Model Armor's sanitization API directly using the HTTP provider:

```bash
promptfoo eval -c promptfooconfig.yaml
```

The direct API configuration:

- Calls the `sanitizeUserPrompt` API directly
- Maps filter results to Promptfoo's guardrails format
- Tests both benign and adversarial input prompts
- Fails closed when Model Armor reports a partial, failed, skipped, or unknown filter result

### 2. Vertex AI with Model Armor Integration

Test Gemini models with Model Armor templates:

```bash
promptfoo eval -c promptfooconfig.vertex.yaml
```

The Vertex configuration:

- Uses Vertex AI's native Model Armor integration
- Compares models with and without Model Armor enabled
- Uses `not-guardrails` against the protected provider for known attacks

## Configuration Files

- `promptfooconfig.yaml` - Direct Model Armor API testing (recommended for detailed filter results)
- `promptfooconfig.vertex.yaml` - Vertex AI integration with Model Armor (recommended for production-like testing)
- `transforms/sanitize-response.mjs` - Response transformer for the sanitization API
- `datasets/model-armor-test.csv` - Test dataset with prompts for each filter type

### Using the Dataset

The included CSV covers benign prompts and each Model Armor filter type:

```yaml
tests: file://datasets/model-armor-test.csv
```

Every row carries two assertions. `__expected` applies `guardrails` to benign rows and
`not-guardrails` to expected findings, and `__expected2` is a per-row `javascript:` check
that the normalized output names the expected filter — for example, a prompt-injection row
must report `Prompt Injection`, not just any match. This keeps a disabled or overbroad
filter (one that matches everything) from silently satisfying an unrelated category.

The example uses Model Armor's basic SDP configuration, whose built-in coverage is limited to
credit cards, US SSNs, financial account numbers, US ITINs, Google Cloud credentials, and Google
Cloud API keys. Use an advanced Sensitive Data Protection inspect template when testing generic
passwords, non-Google API keys, or custom secret formats.

## Understanding Results

When Model Armor reports a policy match, you'll see:

- `guardrails.flagged: true` - Content was flagged
- `guardrails.flaggedInput: true` - The finding came from the input prompt
- `guardrails.reason` - Detailed explanation of which filters matched

The included configurations test prompt-side protection. Promptfoo currently handles Vertex `finishReason: MODEL_ARMOR` as a provider error, so regular `guardrails` assertions do not grade response-template blocks. For response-side regression tests, call the direct `sanitizeModelResponse` API and point at the response-side export of the transform:

```yaml
transformResponse: file://transforms/sanitize-response.mjs:transformModelArmorModelResponse
```

The default export attributes findings to `flaggedInput` (`sanitizeUserPrompt`); `transformModelArmorModelResponse` attributes them to `flaggedOutput` so response violations are not misreported as prompt findings.

For debugging, inspect the raw Model Armor response in `metadata.modelArmor`, which contains the full `sanitizationResult` including individual filter states and confidence levels.

Use `not-guardrails` when a dangerous prompt must produce a policy match. A match does not prove that an inspect-only deployment blocked the request, so verify the enforcement mode when hard blocking is required.

## Cleanup

After testing, you can delete the Model Armor template if no longer needed:

```bash
gcloud model-armor templates delete basic-safety --location=us-central1
```

## Learn More

- [Model Armor Overview](https://cloud.google.com/security-command-center/docs/model-armor-overview)
- [Promptfoo Guardrails Documentation](https://www.promptfoo.dev/docs/configuration/expected-outputs/guardrails/)
- [Testing Guardrails Guide](https://www.promptfoo.dev/docs/guides/testing-guardrails/)
