---
sidebar_label: Google Sheets
---

# Importing Test Cases from Google Sheets

promptfoo allows you to import eval test cases directly from Google Sheets. This can be done either unauthenticated (if the sheet is public) or authenticated using Google's Default Application Credentials, typically with a service account for programmatic access.

## Unauthenticated Access

If the Google Sheet is set to be accessible by "anyone with the link," you can directly specify the share URL in your YAML configuration. For example:

```yaml
prompts:
  - prompt1.txt
  - prompt2.txt
providers:
  - anthropic:messages:claude-3-opus-20240229
  - openai:chat:gpt-4-0125-preview
// highlight-start
tests: https://docs.google.com/spreadsheets/d/1eqFnv1vzkPvS7zG-mYsqNDwOzvSaiIAsKB3zKg9H18c/edit?usp=sharing
// highlight-end
```

Here's an [example sheet](https://docs.google.com/spreadsheets/d/1eqFnv1vzkPvS7zG-mYsqNDwOzvSaiIAsKB3zKg9H18c/edit#gid=0). For more information on how to set up the sheet itself, see [loading assertions from CSV](/docs/configuration/expected-outputs/#load-assertions-from-csv).

## Authenticated Access with Default Application Credentials

For sheets that are not publicly accessible, you can use authenticated access. This requires setting up Google [Default Application Credentials](https://cloud.google.com/docs/authentication/application-default-credentials). Here’s how you can configure it:

1. **Install peer dependencies**: `npm install googleapis`

1. **Service Account Setup**: Create a [service account](https://console.cloud.google.com/iam-admin/serviceaccounts) in your Google Cloud Platform project. Create a JSON key file and download it.

1. **Enable Google Sheets API**: Enable the [Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com) (`sheets.googleapis.com`).

1. **Share Sheet**: Share the Google Sheet with the email address of your service account (`your-service-account@project-name.iam.gserviceaccount.com`) with at least viewer permissions.

1. **Configure Environment**: Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the path of the JSON key file:

```sh
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-file.json"
```

1. **Update YAML Configuration**: Use the same URL format as in unauthenticated access, but the system will automatically use the authenticated method to access the sheet:

```yaml
tests: https://docs.google.com/spreadsheets/d/1eqFnv1vzkPvS7zG-mYsqNDwOzvSaiIAsKB3zKg9H18c/edit?usp=sharing
```

## Writing outputs to a Google Sheet

The `outputPath` parameter (`--output` or `-o` on the command line) supports Google Sheets URLs. In order to write, Default Application Credentials must be configured with a service account that has write access.

```yaml
prompts: [...]
providers: [...]
tests: [...]
// highlight-start
outputPath: https://docs.google.com/spreadsheets/d/1eqFnv1vzkPvS7zG-mYsqNDwOzvSaiIAsKB3zKg9H18c/edit?usp=sharing
// highlight-end
```
