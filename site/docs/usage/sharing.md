---
sidebar_position: 40
---

# Sharing

The CLI provides a `share` command to share your most recent evaluation results from `promptfoo eval`.

The command creates a URL which can be used to view the results. The URL is valid for 2 weeks. This is useful, for example, if you're working on a team that is tuning a prompt together.

Here's how to use it:

```sh
promptfoo share
```

## Usage

When you run `promptfoo share`, it will ask for a confirmation to create a URL.

If you want to skip this confirmation, you can use the `-y` or `--yes` option like this:

```sh
promptfoo share -y
```

## Example

Here's an example of how the `share` command works:

```sh
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
