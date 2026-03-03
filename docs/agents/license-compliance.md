# License Compliance

This document summarizes the license tracking and compliance status for third-party dependencies in the promptfoo project.

## Overview

The project is licensed under **MIT**. There is currently no automated license compliance scanning in CI/CD.

## Current Mechanisms

| Mechanism        | Description                                                                      |
| ---------------- | -------------------------------------------------------------------------------- |
| **MIT License**  | Project is MIT licensed (`LICENSE` file, `package.json`)                         |
| **CITATION.cff** | Academic attribution file, auto-generated via `npm run citation:generate`        |
| **npm audit**    | Security vulnerability scanning (`npm run audit:fix`)                            |
| **Renovate**     | Automated dependency updates with 2-5 day delay for supply-chain risk mitigation |
| **CI checks**    | Dependency consistency, missing deps, circular deps, lockfile integrity          |

## What Does NOT Exist

- No automated license scanner (no license-checker, FOSSA, Snyk license, or similar)
- No THIRD_PARTY/NOTICE file documenting transitive dependency licenses
- No CI job for license compliance verification
- No SBOM (Software Bill of Materials) generation
- No license allowlist/blocklist configuration

## License Summary

Run `npx license-checker --summary` to generate this report.

_Last generated: February 2025_

| License           | Count | Notes                               |
| ----------------- | ----- | ----------------------------------- |
| MIT               | 1,936 | Permissive, no concerns             |
| Apache-2.0        | 217   | Permissive, requires attribution    |
| ISC               | 115   | Permissive (MIT-like)               |
| MIT-0             | 62    | MIT without attribution requirement |
| BSD-3-Clause      | 57    | Permissive                          |
| BSD-2-Clause      | 36    | Permissive                          |
| BlueOak-1.0.0     | 13    | Permissive                          |
| MPL-2.0           | 7     | Weak copyleft (file-level)          |
| Artistic-2.0      | 5     | Permissive                          |
| LGPL-3.0-or-later | 2     | Weak copyleft                       |
| Unlicense         | 2     | Public domain equivalent            |
| CC0-1.0           | 2     | Public domain                       |
| 0BSD              | 2     | Permissive                          |
| CC-BY-4.0         | 1     | Creative Commons Attribution        |
| Python-2.0        | 1     | Permissive                          |

**Overall:** ~98% permissive licenses (MIT, Apache, BSD, ISC).

## Packages Requiring Attention

### UNLICENSED: `app@0.0.0`

**Status:** No concern

This is the project's own frontend workspace (`src/app`), symlinked into `node_modules`. It is marked `private: true` and is not a third-party dependency.

### UNKNOWN: `@calcom/embed-snippet@1.3.3`

**Status:** Low risk — review recommended

- **Location:** Used only in `site/` (documentation site)
- **Files:**
  - `site/src/pages/contact.tsx`
  - `site/src/pages/events/blackhat-2025.tsx`
- **License:** Cal.com Commercial License (EE) with AGPLv3 for client-side JavaScript

The Cal.com license states that client-side JavaScript portions are under AGPLv3:

> "Any part of this Software...which is served client-side as an image, font, cascading stylesheet (CSS), file which produces or is compiled...into client-side JavaScript...is copyrighted under the AGPLv3 license."

Since this is a client-side embed on the documentation site only (not in the core library), AGPL is generally acceptable. If AGPL is a concern, the alternative would be to link to Cal.com externally rather than embedding.

## Copyleft Licenses

The following weak copyleft licenses are present:

| License           | Count | Implication                                                      |
| ----------------- | ----- | ---------------------------------------------------------------- |
| MPL-2.0           | 7     | File-level copyleft; modifications to MPL files must be shared   |
| LGPL-3.0-or-later | 2     | Can use as dependency; modifications to LGPL code must be shared |

These are acceptable for a Node.js project using them as dependencies without modification.

## Manual License Check Commands

```bash
# Summary of all licenses
npx license-checker --summary

# Full JSON report
npx license-checker --json > licenses.json

# Find problematic licenses
npx license-checker --json | jq 'to_entries | map(select(.value.licenses == "UNLICENSED" or .value.licenses == "UNKNOWN")) | from_entries'

# Fail on specific licenses (for CI)
npx license-checker --failOn "GPL;AGPL"

# Production dependencies only
npx license-checker --production --summary
```

## Recommendations

1. **Add CI license scanning:** Consider adding `license-checker` to CI to catch new problematic licenses
2. **Generate SBOM:** Consider generating a Software Bill of Materials for compliance
3. **Document exceptions:** Maintain a list of reviewed/approved exceptions (like the Cal.com embed)
4. **Production-only check:** Use `--production` flag to focus on runtime dependencies
