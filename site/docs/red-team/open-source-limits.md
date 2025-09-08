---
sidebar_position: 15
title: Open Source Limits
description: Understanding probe limits in the open source version of Promptfoo
---

# Open Source Limits

The open source version of Promptfoo has usage limits on red teaming features. Red teaming requires inference for dynamic test generation and grading. We need to set limits to keep providing them at no charge.

## What is a Probe?

A **probe** is a single request made to your target system during red team testing. This includes:

- Each attack attempt against your LLM or application
- Each turn in a multi-turn conversation during adversarial testing
- Any individual test case execution that sends data to your target

For example, if you run a red team scan with 50 test cases against a single target, that would consume 50 probes. If some of those tests involve multi-turn conversations with 3 exchanges each, those specific tests would consume additional probes per test case. The number of probes is listed on each individual test case in the UI.

## Monthly Probe Limit

The open source version has a limit of **10,000 probes per month**. This limit:

- Resets on the 1st of every month at 00:00 UTC
- Applies to all red team evaluations run using the open source version
- Is tracked across all your red team scans

## Monitoring Your Usage

Promptfoo automatically tracks your probe usage and displays your current status when running red team evaluations.

Use the command `promptfoo redteam usage` to see your current usage.

## What Happens When You Reach the Limit?

When you exceed the monthly probe limit:

- New red team scans will be blocked from starting
- You'll receive clear messaging about the limit and upgrade options
- The limit will automatically reset at the beginning of the next month

## Upgrading

For more probes and additional enterprise features, consider upgrading to our enterprise plan:

- **Contact**: sales@promptfoo.dev
- **Learn more**: [Pricing page](https://www.promptfoo.dev/pricing)
