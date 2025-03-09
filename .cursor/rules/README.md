# Cursor Rules for Promptfoo

This directory contains Cursor AI rules that help guide the AI assistant when working with the promptfoo codebase. These rules provide context about code standards, development workflows, and best practices specific to this project.

## Available Rules

- **docs.mdc**: Guidelines for working with documentation
- **examples.mdc**: Guidelines for creating effective examples
- **webui.mdc**: Guidelines for working on the web UI and frontend components
- **vitest.mdc**: Guidelines for writing Vitest tests in the src/app directory
- **jest.mdc**: Guidelines for writing Jest tests for core functionality
- **python.mdc**: Guidelines for Python development

## Rule Structure

Each rule file (except README.md) follows the MDC format that includes:

```
---
description: Brief description of the rule's purpose
globs: "File patterns that this rule applies to"
alwaysApply: false
---
```

This YAML frontmatter helps Cursor understand when to apply each rule automatically based on the files you're working with.

## How to Use These Rules

When working with Cursor AI on the promptfoo codebase, you can reference these rules to provide context to the AI:

1. Use the `@` symbol to reference a rule directly:

   ```
   @docs
   Help me improve this documentation section
   ```

2. When focusing on a specific part of the codebase, the relevant rules will be automatically applied based on the file patterns.

3. You can combine multiple rules:

   ```
   @docs @examples
   Help me create an example that demonstrates this feature
   ```

   ```
   @webui
   Help me implement this React component
   ```

   ```
   @webui @vitest
   Help me create a new component with tests
   ```

   ```
   @jest
   Help me write a test for this provider
   ```

## Documentation and Examples

Documentation and examples are critical parts of the promptfoo project:

- **@docs**: Use when working on markdown documentation files in `site/docs/` or elsewhere
- **@examples**: Use when creating or modifying examples in the `examples/` directory

These rules help ensure that documentation is clear and that examples follow consistent patterns, helping users understand how to use promptfoo effectively.

## Adding New Rules

To add a new rule:

1. Create a new MDC file in this directory
2. Include the YAML frontmatter with description, globs, and alwaysApply fields
3. Include a clear title and description of when the rule applies
4. Specify file patterns in both the frontmatter and the content
5. For general project rules, link to them using `@file` references

For more information on Cursor rules, see the [Cursor documentation](https://cursor.sh/docs/context/rules-for-ai).
