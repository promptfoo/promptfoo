# loom-document-search (Loom Document Search)

Check that a document search cites the requested namespace when the same note is indexed in two namespaces. Promptfoo sends HTTP requests to Loom and makes JavaScript assertions over the response. Neither case calls an LLM.

https://github.com/ClickHouse/loom

## Prepare the fixture

Use an authenticated test deployment of Loom v1.3.0 with local embeddings. Set these variables from the deployment:

- `LOOM_BASE_URL` to the Loom origin without a trailing slash
- `LOOM_ORG` to the org used for the test
- `LOOM_WRITER_TOKEN` to a writer token covering `team-handbook` and `second-handbook`
- `LOOM_VIEWER_TOKEN` to a viewer token covering both test namespaces

Save the same synthetic note to each namespace with a distinct source URL. This uses `curl` and `jq`.

```sh
for namespace in team-handbook second-handbook; do
  jq -n --arg org "$LOOM_ORG" --arg namespace "$namespace" \
    '{
      org: $org,
      namespace: $namespace,
      source_uri: ("https://example.com/" + $namespace + "/emberglass"),
      title: "Emberglass release freeze",
      content: "The Emberglass release freeze starts Tuesday at 18:00 UTC."
    }' |
    curl -fsS "$LOOM_BASE_URL/v1/knowledge.upsert" \
      -H "Authorization: Bearer $LOOM_WRITER_TOKEN" \
      -H "Content-Type: application/json" \
      --data-binary @- > /dev/null || exit 1
done
unset LOOM_WRITER_TOKEN
```

## Run the eval

From this example directory, run:

```sh
npx promptfoo@0.126.0 eval --no-cache
```

To copy the example from the Promptfoo repository, use `npx promptfoo@latest init --example loom-document-search`.

Expect two passes. Each case asks the same question with a different namespace. With `namespace_scope: this`, only the source URL in the requested namespace should be returned. This checks retrieval behavior directly. It does not grade a model's answer.
