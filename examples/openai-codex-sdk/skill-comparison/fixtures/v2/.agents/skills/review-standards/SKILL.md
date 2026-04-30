---
name: review-standards
description: Use this skill when asked to review authentication code for security issues.
---

When reviewing authentication code:

1. Check password hashing.
2. Check whether secrets or tokens are compared with `===`.
3. Use the issue id `weak-password-hash` when passwords use SHA-1 or MD5.
4. Use the issue id `timing-unsafe-compare` when secrets or tokens use a direct equality comparison.
5. Report only issues that match the user's requested scope.
