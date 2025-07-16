# 🚀 Quickstart Guide

Get up and running with Promptfoo's prompt management system in just 5 minutes! This guide will walk you through creating, testing, and deploying your first managed prompt.

:::tip Prerequisites

- Promptfoo installed (`npm install -g promptfoo`)
- A text editor
- 5 minutes of your time
  :::

<!-- ![Quickstart Overview](../assets/prompt-quickstart-overview.png) -->

## 📋 What You'll Learn

By the end of this guide, you'll know how to:

- ✅ Initialize prompt management
- ✅ Create and version prompts
- ✅ Deploy prompts to environments
- ✅ Use managed prompts in evaluations
- ✅ Track prompt performance
- ✅ Enable auto-tracking

## 🏃 10-Step Quick Start

### Step 1: Initialize Prompt Management

First, decide whether to use local or cloud mode:

### Option A: Local Mode (Recommended for getting started)

```bash
# Set environment variable to use local mode
export PROMPTFOO_PROMPT_LOCAL_MODE=true

# Prompts will be stored in ./prompts directory
```

### Option B: Cloud Mode

```bash
# Login to Promptfoo cloud
promptfoo auth login

# Follow the authentication flow
```

<!-- ![Authentication Flow](../assets/prompt-auth-flow.png) -->

### Step 2: Create Your First Prompt

Let's create a simple customer support prompt:

```bash
promptfoo prompt create customer-support \
  --description "Friendly customer support assistant" \
  --content "You are a helpful and friendly customer support agent for {{company}}.
Always be polite, empathetic, and solution-focused.
Current date: {{date}}"
```

<!-- ![Create Prompt Command](../assets/prompt-create-command.png) -->

You should see:

```
✅ Created prompt "customer-support"
   Description: Friendly customer support assistant
   Version: 1
```

### Step 3: List Your Prompts

List all managed prompts:

```bash
promptfoo prompt list
```

<!-- ![Prompt List View](../assets/prompt-list-cli.png) -->

View details of a specific prompt:

```bash
promptfoo prompt show customer-support
```

Output:

```
Prompt: customer-support
Description: Friendly customer support assistant
Current Version: v1
Created: 2024-01-15 10:30:00
Author: user@example.com

Content:
You are a helpful and friendly customer support agent for {{company}}.
Always be polite, empathetic, and solution-focused.
Current date: {{date}}
```

### Step 4: Create an Evaluation

Create a test file `customer-support-test.yaml`:

```yaml
# customer-support-test.yaml
prompts:
  - pf://customer-support # References your managed prompt

providers:
  - openai:gpt-4o-mini

tests:
  - vars:
      company: 'TechCorp'
      date: '2024-01-15'
      query: 'How do I reset my password?'
    assert:
      - type: icontains
        value: password
      - type: llm-rubric
        value: 'Response should be helpful and mention password reset steps'

  - vars:
      company: 'TechCorp'
      date: '2024-01-15'
      query: 'I want to cancel my subscription'
    assert:
      - type: llm-rubric
        value: 'Response should be empathetic and offer alternatives'
```

### Step 5: Run the Evaluation

```bash
promptfoo eval -c customer-support-test.yaml
```

<!-- ![Evaluation Results](../assets/prompt-eval-results.png) -->

### Step 6: Update the Prompt

Based on evaluation results, let's improve the prompt:

```bash
promptfoo prompt edit customer-support
```

This opens your default editor. Make your changes:

```
You are a helpful and friendly customer support agent for {{company}}.
Always be polite, empathetic, and solution-focused.

Guidelines:
- Acknowledge the customer's concern first
- Provide clear, step-by-step solutions
- Offer alternatives when appropriate
- End with asking if there's anything else you can help with

Current date: {{date}}
```

Save and exit. You'll see:

```
✅ Updated prompt "customer-support" to version 2
   Notes: Added detailed guidelines for better responses
```

### Step 7: Deploy to Production

Deploy a specific version to production:

```bash
promptfoo prompt deploy customer-support production --version 2
```

<!-- ![Deployment Confirmation](../assets/prompt-deploy-confirm.png) -->

### Step 8: Use Production Version

Update your test configuration to use the production version:

```yaml
prompts:
  - pf://customer-support:production # Uses the production deployment
```

### Step 9: Compare Versions

View the differences between versions:

```bash
promptfoo prompt diff customer-support 1 2
```

<!-- ![Prompt Diff View](../assets/prompt-diff-cli.png) -->

### Step 10: Enable Auto-Tracking

Automatically track unmanaged prompts in your project:

```bash
# Enable auto-tracking
export PROMPTFOO_AUTO_TRACK_PROMPTS=true

# Run evaluation with unmanaged prompts
promptfoo eval -c my-existing-config.yaml

# View newly tracked prompts
promptfoo prompt list
```

<!-- ![Auto-Tracked Prompts](../assets/prompt-auto-tracked.png) -->

## 🎯 What's Next?

Now that you've mastered the basics, explore these advanced features:

<div className="row margin-top--lg">
  <div className="col col--6">
    <div className="card">
      <div className="card__header">
        <h3>📚 Learn More</h3>
      </div>
      <div className="card__body">
        <ul>
          <li><a href="concepts">Core Concepts</a> - Understand the fundamentals</li>
          <li><a href="configuration">Configuration</a> - Advanced options</li>
          <li><a href="auto-tracking">Auto-Tracking</a> - Automatic discovery</li>
        </ul>
      </div>
    </div>
  </div>
  <div className="col col--6">
    <div className="card">
      <div className="card__header">
        <h3>🔧 Advanced Features</h3>
      </div>
      <div className="card__body">
        <ul>
          <li><a href="api-reference">API Reference</a> - Programmatic access</li>
          <li><a href="best-practices">Best Practices</a> - Production patterns</li>
          <li><a href="management#smart-variable-suggestions">Smart Variables</a> - AI-powered suggestions</li>
        </ul>
      </div>
    </div>
  </div>
</div>

## 💡 Pro Tips

:::tip Best Practices

1. **Use semantic versioning** for your prompts (e.g., v1.0.0, v1.1.0)
2. **Test before deploying** - Always run evaluations on new versions
3. **Document changes** - Use meaningful commit messages
4. **Monitor performance** - Track metrics across versions
5. **Automate workflows** - Integrate with CI/CD pipelines
   :::

## 🆘 Common Issues

<details>
<summary>Can't find my prompts?</summary>

Make sure you're in the right directory and have initialized prompt management:

```bash
promptfoo prompts init
promptfoo prompts list
```

</details>

<details>
<summary>Evaluation not finding managed prompt?</summary>

Check that you're using the correct `pf://` prefix:

```yaml
prompts:
  - pf://prompt-name # Latest version
  - pf://prompt-name:v2 # Specific version
  - pf://prompt-name:prod # Environment
```

</details>

<details>
<summary>Want to use existing prompts?</summary>

Enable auto-tracking to discover and manage existing prompts:

```bash
promptfoo prompts auto-track enable
```

See the [Auto-Tracking Guide](auto-tracking) for details.

</details>

## 📝 Example Project Structure

After following this guide, your project might look like:

```
my-project/
├── promptfoo.yaml         # Main config with auto-tracking
├── prompts/              # Optional: file-based prompts
│   └── unmanaged.txt
├── examples/             # Test cases
│   └── customer-data.csv
└── .promptfoo/          # Managed prompts database
    └── prompts.db
```

---

<div className="alert alert--success margin-top--lg">
  <h4>🎉 Congratulations!</h4>
  <p>You've successfully set up prompt management! Continue exploring with our <a href="concepts">Core Concepts</a> guide or dive into <a href="configuration">advanced configuration</a>.</p>
</div>
