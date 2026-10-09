# amazon-bedrock/native-api (Native Bedrock API Requests)

This example sends a complete AWS `InvokeModel` request, including model-specific
JSON and transport options, and checks the native response.

## Run the example

Initialize with `npx promptfoo@latest init --example amazon-bedrock/native-api`.
Configure AWS credentials (for example `AWS_PROFILE`) and access to the model in
`promptfooconfig.yaml`, then run from the example root:

```sh
npx promptfoo@latest eval --no-cache
```

For local development, run from the repository root:

```sh
npm run local -- eval -c examples/amazon-bedrock/native-api/promptfooconfig.yaml --no-cache -o output.json
```

Use `bedrock:api:<Operation>` with the operation's AWS SDK request JSON as the prompt.
The adapter returns native response JSON rather than extracting model text. It does
not cache calls or automatically execute returned tool actions, poll jobs, or fetch
S3 outputs. `StartAsyncInvoke` requires an existing output bucket; use
`GetAsyncInvoke` with the returned invocation ARN to inspect a job.

For SDK blob fields, use a single-key object such as `{"$base64":"aGVsbG8="}`.
Binary outputs use the same wrapper. Model-native JSON inside `InvokeModel.body`
is serialized unchanged, so its ordinary base64 fields remain strings.

See the [native API documentation](https://www.promptfoo.dev/docs/providers/aws-bedrock/#native-api-requests)
for supported operations and response shapes.
