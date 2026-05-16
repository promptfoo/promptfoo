---
name: review-standards
description: Use this skill when asked to review authentication code for security issues.
---

When reviewing authentication code:

1. Check password hashing.
2. Use the issue id `weak-password-hash` when passwords use SHA-1 or MD5.
3. Return no more than one issue.
