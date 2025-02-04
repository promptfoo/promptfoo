---
sidebar_label: Promptfoo Cloud
---

# Promptfoo Cloud

Promptfoo's Cloud offering is a hosted version of Promptfoo that lets you securely and privately share evals with your team.

Once you create an organization, you will be able to invite other team members. Team members can configure their `promptfoo` clients to share evals with your organization.

To learn more or request access contact us at [sales@promptfoo.dev](mailto:sales@promptfoo.dev).

## Getting Started

Once you have access, you can log in to Promptfoo Cloud and start sharing your evals.

1.  **Install the Promptfoo CLI**

    [&raquo; Read getting started for help installing the CLI](/docs/getting-started)

2.  **Log in to Promptfoo Cloud**

    ```bash
    promptfoo auth login
    ```

    :::tip
    If you're hosting an on-premise Promptfoo Cloud instance, you need to pass the `--host <host api url>` flag to the login command. By default, the cloud host is https://www.promptfoo.app.
    :::

3.  **Share your evals**

        ```bash
        promptfoo eval --share
        ```

            or

        ```bash
        promptfoo share
        ```

    :::tip
    All of your evals are stored locally until you share them.
    :::

4.  **View your evals**

    View your organization's evals at [https://www.promptfoo.app](https://www.promptfoo.app)

## Adding users

To add users to your organization, open the menu in the top right corner of the page and click your Organization name. Then invite the user using the form at the bottom of the page.

![Invite a user](/img/docs/cloud/invite-user.png)

## Domains and Whitelisting

Promptfoo requires access to [promptfoo.app](https://promptfoo.app), [api.promptfoo.app](https://api.promptfoo.app), and [api.promptfoo.dev](https://api.promptfoo.dev) to function.

If you are using a proxy or VPN, you may need to add these domains to your whitelist.
