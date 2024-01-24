---
sidebar_position: 40
---

# Sharing

The CLI provides a `share` command to share your most recent evaluation results from `promptfoo eval`.

The command creates a URL which can be used to view the results. The URL is valid for 2 weeks. This is useful, for example, if you're working on a team that is tuning a prompt together.

Here's how to use it:

```bash
promptfoo share
```

## Usage

When you run `promptfoo share`, it will ask for a confirmation to create a URL.

If you want to skip this confirmation, you can use the `-y` or `--yes` option like this:

```bash
promptfoo share -y
```

## Example

Here's an example of how the `share` command works:

```bash
$ promptfoo share
Are you sure you want to create a shareable URL? [y/N] y
View results: https://app.promptfoo.dev/f:abc123
```

## Config

The "share" button in the web UI can be explicitly disabled in `promptfooconfig.yaml`:

```yaml
sharing: false
```

## Privacy

Please be aware that the `share` command creates a publicly accessible URL, which means anyone who knows the URL can view your results. If you don't want anyone to see your results, you should keep your URL secret.

After 2 weeks, all data associated with the URL is permanently deleted.

## Self-hosting

To set up self-hosting for the sharing feature, you need to host the Next.js application and configure the key-value (KV) store that will manage the shared evaluation results.

### Hosting the web app

You can use the provided [Dockerfile](https://github.com/promptfoo/promptfoo/blob/main/Dockerfile) to containerize and host the Next.js app. Here's an example Docker command to build and run the container:

```bash
docker build --build-arg NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL=http://localhost:3000/api -t promptfoo-ui .
docker run -p 3000:3000 promptfoo-ui
```

The `NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL` tells the web app where to send the API request when the user clicks the 'Share' button.  This should be configured to match the URL of your self-hosted instance.

### Configuring the KV Store

By default, the application uses an in-memory store. However, you can configure it to use Redis or the filesystem by setting the appropriate environment variables. Below is a table of environment variables you can set to configure the KV store:

| Environment Variable             | Description                                                    | Default Value       |
| -------------------------------- | -------------------------------------------------------------- | ------------------- |
| `PROMPTFOO_SHARE_STORE_TYPE`     | The type of store to use (`memory`, `redis`, or `filesystem`). | `memory`            |
| `PROMPTFOO_SHARE_TTL`            | The time-to-live (TTL) for shared URLs in seconds.             | `1209600` (2 weeks) |
| `PROMPTFOO_SHARE_REDIS_HOST`     | The Redis host.                                                | -                   |
| `PROMPTFOO_SHARE_REDIS_PORT`     | The Redis port.                                                | -                   |
| `PROMPTFOO_SHARE_REDIS_PASSWORD` | The Redis password.                                            | -                   |
| `PROMPTFOO_SHARE_REDIS_DB`       | The Redis database number.                                     | `0`                 |
| `PROMPTFOO_SHARE_STORE_PATH`     | The filesystem path for storing shared results.                | `share-store`       |

### Using `promptfoo share` with self-hosting

When self-hosting, you need to set the environment variables for the `promptfoo share` command to point to your hosted application. Here's an example:

```bash
PROMPTFOO_REMOTE_API_BASE_URL=http://localhost:3000/api PROMPTFOO_REMOTE_APP_BASE_URL=http://localhost:3000 promptfoo share -y
```

This will create a shareable URL using your self-hosted service.

The `PROMPTFOO_REMOTE_API_BASE_URL` environment variable specifies the base URL for the API endpoints of your self-hosted service. This is where the `promptfoo share` command sends data to create a shareable URL.

Similarly, the `PROMPTFOO_REMOTE_APP_BASE_URL` environment variable sets the base URL for the UI of your self-hosted service. This will be a visible part of the shareable URL.

These configuration options can also be set under the `sharing` property of your promptfoo config:

```yaml
sharing:
  apiBaseUrl: http://localhost:3000/api
  appBaseUrl: http://localhost:3000
```