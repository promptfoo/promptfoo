---
title: Reusable Custom Policies
sidebar_label: Reusable Custom Policies
description: Create and manage custom security policy libraries with CSV bulk upload
date: September 15, 2025
---

# Reusable Custom Policies

Custom policies can now be saved to a library and reused across red team evaluations.

## Features

### Policy Library

Reference saved policies in red team configurations:

```yaml
redteam:
  plugins:
    - id: policy
      config:
        policy: 'internal-customer-data-protection'
```

### CSV Upload

Bulk import policies via CSV through the web UI.

### Severity Levels

Assign severity levels (low, medium, high, critical) to policies for report filtering and prioritization.

### Test Case Generation

Generate sample test cases from policy definitions using the "magic wand" button in the plugins view.

## Usage

1. Navigate to red team setup → Plugins
2. Select "Custom Policy"
3. Upload CSV or create policies individually
4. Assign severity levels and generate test cases
5. Reference policies by ID in evaluations

[Documentation →](/docs/red-team/plugins/policy/)
