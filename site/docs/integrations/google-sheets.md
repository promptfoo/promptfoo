# Importing Test Cases from Google Sheets

promptfoo allows you to import eval test cases directly from Google Sheets. This can be done either unauthenticated (if the sheet is public) or authenticated using Google's Default Application Credentials, typically with a service account for programmatic access.

## Unauthenticated Access

If the Google Sheet is set to be accessible by "anyone with the link," you can directly specify the share URL in your YAML configuration.

```yaml
tests: https://docs.google.com/spreadsheets/d/1eqFnv1vzkPvS7zG-mYsqNDwOzvSaiIAsKB3zKg9H18c/edit?usp=sharing
```

## Authenticated Access with Default Application Credentials

For sheets that are not publicly accessible, you can use authenticated access. This requires setting up Google [Default Application Credentials](https://cloud.google.com/docs/authentication/application-default-credentials). Here’s how you can configure it:

1. **Install peer dependencies**: `npm install googleapis`

1. **Service Account Setup**: Create a [service account](https://console.cloud.google.com/iam-admin/serviceaccounts) in your Google Cloud Platform project. Create a JSON key file and download it.

1. **Enable Google Sheets API**: Enable the [Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com) (`sheets.googleapis.com`).

1. **Share Sheet**: Share the Google Sheet with the email address of your service account (`your-service-account@project-name.iam.gserviceaccount.com`) with at least viewer permissions.

1. **Configure Environment**: Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the path of the JSON key file:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-file.json"
```

1. **Update YAML Configuration**: Use the same URL format as in unauthenticated access, but the system will automatically use the authenticated method to access the sheet:

```yaml
tests: https://docs.google.com/spreadsheets/d/1eqFnv1vzkPvS7zG-mYsqNDwOzvSaiIAsKB3zKg9H18c/edit?usp=sharing
```
