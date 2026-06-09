#!/bin/bash
# Ensure shipped Linux executables honor the distribution compatibility floor.

set -euo pipefail

readonly BUNDLE_DIR="${1:-bundle}"

for required_command in readelf find grep sort; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "error: required command not found: $required_command" >&2
    exit 1
  fi
done

if [[ ! -d "$BUNDLE_DIR" ]]; then
  echo "error: bundle directory not found: $BUNDLE_DIR" >&2
  exit 1
fi

checked=0

while IFS= read -r -d '' artifact; do
  # Check the ELF magic with Bash before invoking readelf so text assets do
  # not turn a bundle validation step into thousands of subprocesses.
  magic=""
  IFS= read -r -n 4 magic <"$artifact" || true
  if [[ "$magic" != $'\x7fELF' ]]; then
    continue
  fi

  checked=$((checked + 1))
  while IFS= read -r symbol; do
    if [[ "$symbol" =~ ^GLIBC_([0-9]+)\.([0-9]+)$ ]] &&
      ((BASH_REMATCH[1] > 2 || (BASH_REMATCH[1] == 2 && BASH_REMATCH[2] > 28))); then
      echo "error: $artifact requires unsupported $symbol (maximum GLIBC_2.28)" >&2
      exit 1
    fi

    if [[ "$symbol" =~ ^GLIBCXX_3\.4\.([0-9]+)$ ]] && ((BASH_REMATCH[1] > 25)); then
      echo "error: $artifact requires unsupported $symbol (maximum GLIBCXX_3.4.25)" >&2
      exit 1
    fi
  done < <(
    readelf --version-info "$artifact" |
      grep -Eo 'GLIBC(XX)?_[0-9]+(\.[0-9]+)+' |
      sort -u || true
  )
done < <(find "$BUNDLE_DIR" -type f -print0)

if ((checked == 0)); then
  echo "error: no Linux ELF artifacts found under $BUNDLE_DIR" >&2
  exit 1
fi

echo "Verified $checked Linux ELF artifacts target GLIBC <= 2.28 and GLIBCXX <= 3.4.25."
