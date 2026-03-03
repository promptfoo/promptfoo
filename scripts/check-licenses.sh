#!/usr/bin/env bash
#
# License compliance check for promptfoo
#
# Validates that all dependencies use licenses compatible with commercial use.
# Fails on strong copyleft licenses (GPL, AGPL) that would require source
# disclosure for the entire project.
#
# Acceptable licenses:
#   - Permissive: MIT, Apache-2.0, BSD-*, ISC, BlueOak, etc.
#   - Weak copyleft: LGPL, MPL (file-level only, acceptable for dependencies)
#   - Public domain: CC0, Unlicense, 0BSD
#   - Dual-licensed: Packages offering a permissive option (e.g., "MIT OR GPL-3.0")
#
# Blocked licenses:
#   - GPL-* (strong copyleft, viral)
#   - AGPL-* (strong copyleft + network provision)
#
# Usage: npm run license:check
#        ./scripts/check-licenses.sh

set -euo pipefail

# Directories to check (root + workspaces with node_modules)
DIRS_TO_CHECK=(
  "."
  "src/app"
  "site"
)

# Packages to exclude (internal workspaces, self-references)
EXCLUDE_PATTERNS=(
  "^app@"
  "^promptfoo@"
  "^site@"
)

ISSUES=()
CHECKED=0

check_directory() {
  local dir="$1"
  local display_name="${dir:-.}"

  if [[ ! -d "$dir/node_modules" ]]; then
    return 0
  fi

  echo "Checking $display_name..."

  local license_json
  license_json=$(cd "$dir" && npx --yes license-checker@25.0.1 --json --excludePrivatePackages 2>/dev/null) || {
    echo "  Warning: Could not check $display_name"
    return 0
  }

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue

    local package license
    package=$(echo "$line" | jq -r '.package')
    license=$(echo "$line" | jq -r '.license')
    ((CHECKED++))

    # Skip excluded packages
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
      if [[ "$package" =~ $pattern ]]; then
        continue 2
      fi
    done

    # Check for GPL/AGPL (but not LGPL)
    if [[ "$license" =~ ^GPL || "$license" =~ ^AGPL ]]; then
      # Allow dual-licensed packages (contain " OR ")
      if [[ "$license" == *" OR "* ]]; then
        continue
      fi
      ISSUES+=("[$display_name] $package: $license")
    fi

  done < <(echo "$license_json" | jq -c 'to_entries[] | {package: .key, license: .value.licenses}')
}

echo ""
echo "License Compliance Check"
echo "========================"
echo ""

for dir in "${DIRS_TO_CHECK[@]}"; do
  check_directory "$dir"
done

echo ""
echo "Checked $CHECKED packages"

if [[ ${#ISSUES[@]} -gt 0 ]]; then
  echo ""
  echo "FAILED: Found ${#ISSUES[@]} package(s) with blocked licenses"
  echo ""
  for issue in "${ISSUES[@]}"; do
    echo "  ✗ $issue"
  done
  echo ""
  echo "Strong copyleft licenses (GPL, AGPL) are not permitted."
  echo ""
  echo "To resolve:"
  echo "  1. Find an alternative package with a permissive license"
  echo "  2. If dual-licensed (e.g., 'MIT OR GPL'), it's allowed automatically"
  echo "  3. If this is a false positive, update this script's EXCLUDE_PATTERNS"
  echo ""
  exit 1
fi

echo ""
echo "PASSED: All licenses are compliant"
echo ""
