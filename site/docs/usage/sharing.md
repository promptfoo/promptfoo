---
sidebar_position: 40
description: Create a remote copy of your promptfoo evals and share them with your team.
keywords:
  [
    eval sharing,
    LLM testing,
    promptfoo sharing,
    collaboration,
    team collaboration,
    shareable URL,
    prompt engineering,
    AI evaluation,
  ]
---

# Sharing

The CLI provides a `share` command to share your evaluation results from `promptfoo eval`.

```sh
promptfoo share
```

## Basic Usage

When you run `promptfoo share`, it will ask for a confirmation to create a URL.

If you want to skip this confirmation, you can use the `-y` or `--yes` option like this:

```sh
promptfoo share -y
```

### Sharing Specific Evals

By default, `promptfoo share` shares your most recent eval. To share a specific eval, provide its ID:

```sh
promptfoo share my-eval-id
```

You can find eval IDs by running `promptfoo list` to see your eval history.

### Authentication in URLs

If your URLs contain authentication information, use the `--show-auth` flag to preserve it:

```sh
promptfoo share --show-auth
```

Without this flag, authentication information (username/password) is automatically stripped from URLs for security.

## Sharing Destinations

promptfoo supports multiple sharing destinations depending on your setup:

### Default Cloud Sharing (Public)

By default, evals are shared to the public promptfoo cloud service:

```sh
$ promptfoo share
View results: https://promptfoo.app/eval/abc123
```

The URL is valid for 2 weeks and is publicly accessible to anyone with the link.

### Team Cloud Sharing (Private)

If you're logged in with `promptfoo auth login`, evals are shared privately with your organization:

```sh
$ promptfoo auth login  # One-time setup
$ promptfoo share
View results: https://promptfoo.app/eval/abc123
```

These shared results are only visible to members of your organization.

### Self-Hosted Sharing

For complete control over your data, you can share to your own self-hosted instance:

#### Configuration Options

##### Using Config File

For persistent configuration, add to your `promptfooconfig.yaml`:

```yaml
sharing:
  apiBaseUrl: http://your-server:3000 # Where to send data
  appBaseUrl: http://your-server:3000 # Base for shared URLs
```

##### Using Environment Variables

For temporary configuration:

```sh
PROMPTFOO_REMOTE_API_BASE_URL=http://your-server:3000 PROMPTFOO_REMOTE_APP_BASE_URL=http://your-server:3000 promptfoo share
```

Additional environment variables for self-hosted setup:

| Variable                                | Description                                                               |
| --------------------------------------- | ------------------------------------------------------------------------- |
| `PROMPTFOO_SHARING_APP_BASE_URL`        | Alternative to `PROMPTFOO_REMOTE_APP_BASE_URL` with higher priority       |
| `PROMPTFOO_DISABLE_SHARE_EMAIL_REQUEST` | Set to `true` to skip email collection during sharing                     |
| `PROMPTFOO_SHARE_CHUNK_SIZE`            | Controls how many results are sent in each chunk when sharing large evals |

:::note Configuration Precedence

When multiple configuration methods are present, promptfoo uses this priority order:

1. Config file settings
2. Environment variables
3. Cloud settings (if logged in)
4. Default values

:::

For more detailed instructions on setting up a self-hosted instance, see [Self-hosting](./self-hosting.md).

## Disabling Sharing

The "share" button in the web UI can be explicitly disabled in `promptfooconfig.yaml`:

```yaml
sharing: false
```

## Privacy Considerations

Please consider the following privacy aspects of each sharing method:

- **Default Cloud Sharing**: Creates a publicly accessible URL visible to anyone with the link. Data is automatically deleted after 2 weeks.
- **Team Cloud Sharing**: Creates a private URL only visible to your organization members.
- **Self-Hosted Sharing**: Privacy and retention depend on your self-hosted configuration.

## See Also

- [Self-hosting](./self-hosting.md)
- [Command Line Usage](./command-line.md)
