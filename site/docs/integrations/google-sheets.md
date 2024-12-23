---
sidebar_label: Google Sheets
---

# Google Sheets Integration

promptfoo allows you to import eval test cases directly from Google Sheets. This can be done either unauthenticated (if the sheet is public) or authenticated using Google's Default Application Credentials, typically with a service account for programmatic access.

## Importing Test Cases from Google Sheets

### Public Sheets (Unauthenticated)

For sheets that are accessible via "anyone with the link", simply specify the share URL in your configuration:

```yaml
prompts:
  - prompt1.txt
  - prompt2.txt
providers:
  - anthropic:messages:claude-3-5-sonnet-20241022
  - openai:chat:gpt-4o
// highlight-start
tests: https://docs.google.com/spreadsheets/d/1eqFnv1vzkPvS7zG-mYsqNDwOzvSaiIAsKB3zKg9H18c/edit?usp=sharing
// highlight-end
```

> 💡 See our [example sheet](https://docs.google.com/spreadsheets/d/1eqFnv1vzkPvS7zG-mYsqNDwOzvSaiIAsKB3zKg9H18c/edit#gid=0) for the expected format. For details on sheet structure, refer to [loading assertions from CSV](/docs/configuration/expected-outputs/#load-assertions-from-csv).

### Private Sheets (Authenticated)

For private sheets, you'll need to set up Google's Default Application Credentials:

1. **Install Peer Dependencies**

   ```bash
   npm install googleapis
   ```

2. **Set Up Authentication**

   - Create a [service account](https://console.cloud.google.com/iam-admin/serviceaccounts) in Google Cloud
   - Download the JSON key file
   - Enable the [Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com) (`sheets.googleapis.com`)
   - Share your sheet with the service account email (`your-service-account@project-name.iam.gserviceaccount.com`) with at least viewer permissions

3. **Configure Credentials**

   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-file.json"
   ```

4. **Use the Same URL Format**
   ```yaml
   tests: https://docs.google.com/spreadsheets/d/1eqFnv1vzkPvS7zG-mYsqNDwOzvSaiIAsKB3zKg9H18c/edit?usp=sharing
   ```
   The system will automatically use authenticated access when the sheet is not public.

## Writing Evaluation Results to Google Sheets

The `outputPath` parameter (`--output` or `-o` on the command line) supports writing evaluation results directly to Google Sheets. This requires Default Application Credentials with write access configured.

### Basic Usage

```yaml
prompts:
  - ...
providers:
  - ...
tests:
  - ...
// highlight-start
outputPath: https://docs.google.com/spreadsheets/d/1eqFnv1vzkPvS7zG-mYsqNDwOzvSaiIAsKB3zKg9H18c/edit?usp=sharing
// highlight-end
```

### Targeting Specific Sheets

You have two options when writing results to a Google Sheet:

1. **Write to an existing sheet** by including the sheet's `gid` parameter in the URL:

   ```yaml
   outputPath: https://docs.google.com/spreadsheets/d/1eqFnv1vzkPvS7zG-mYsqNDwOzvSaiIAsKB3zKg9H18c/edit#gid=123456789
   ```

   > 💡 To find a sheet's `gid`, open the sheet in your browser and look at the URL - the `gid` appears after the `#gid=` portion.

2. **Create a new sheet automatically** by omitting the `gid` parameter. The system will:
   - Create a new sheet with a timestamp-based name (e.g., "Sheet1234567890")
   - Write results to this new sheet
   - Preserve existing sheets and their data

This behavior helps prevent accidental data overwrites while keeping your evaluation results organized within the same Google Sheets document.

## Using Custom Providers for Model-Graded Metrics

When using Google Sheets for test cases, you can still use custom providers for model-graded metrics
like `llm-rubric` or `similar`. To do this, override the default LLM grader by adding a `defaultTest` property to your configuration:

```yaml
prompts:
  - prompt1.txt
  - prompt2.txt
providers:
  - anthropic:messages:claude-3-5-sonnet-20241022
  - openai:chat:gpt-4-mini
tests: https://docs.google.com/spreadsheets/d/1eqFnv1vzkPvS7zG-mYsqNDwOzvSaiIAsKB3zKg9H18c/edit?usp=sharing
defaultTest:
  options:
    provider:
      text:
        id: ollama:llama3.1:70b
      embedding:
        id: ollama:embeddings:mxbai-embed-large
```

For more details on customizing the LLM grader, see the [model-graded metrics documentation](/docs/configuration/expected-outputs/model-graded/#overriding-the-llm-grader).
