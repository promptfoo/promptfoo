To get started, you need to set up authentication and project ID. You can choose between two authentication methods:

**Option 1: IAM Authentication**

```sh
export WATSONX_AI_AUTH_TYPE=iam
export WATSONX_AI_APIKEY=your-ibm-cloud-api-key
```

**Option 2: Bearer Token Authentication**

```sh
export WATSONX_AI_AUTH_TYPE=bearertoken
export WATSONX_AI_BEARER_TOKEN=your-ibm-cloud-bearer-token
```

Then set your project ID:

```sh
export WATSONX_AI_PROJECT_ID=your-ibm-project-id
```

Note: If `WATSONX_AI_AUTH_TYPE` is not set, the provider will automatically choose the authentication method based on which credentials are available, preferring IAM authentication if both are present.

Follow the instructions in [watsonx.md](../../site/docs/providers/watsonx.md) to retrieve your API keys, bearer token, and project ID.

Next, edit promptfooconfig.yaml.

Then run:

```sh
npm run local -- eval --config examples/watsonx/promptfooconfig.yaml
```

or

```sh
promptfoo eval
```

Afterwards, you can view the results by running `promptfoo view`
