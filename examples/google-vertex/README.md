To call Vertex AI models in Node, you'll need to install Google's official auth client as a peer dependency:

```sh
npm i google-auth-library
```

Make sure the Vertex AI API is enabled for the relevant project in Google Cloud. Then, ensure that you've selected that project in the gcloud cli:

```sh
gcloud config set project PROJECT_ID
```

Next, make sure that you've authenticated to Google Cloud using one of these methods:

- You are logged into an account using gcloud auth application-default login
- You are running on a machine that uses a service account with the appropriate role
- You have downloaded the credentials for a service account with the appropriate role and set the GOOGLE_APPLICATION_CREDENTIALS environment variable to the path of the credentials file.

Then, edit promptfooconfig.yaml

Then run:

```
promptfoo eval
```

Afterwards, you can view the results by running `promptfoo view`
