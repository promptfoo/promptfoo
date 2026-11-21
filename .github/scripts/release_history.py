"""Require a visible commit or PR reference for each change since its component tag."""

import json
import os
import re
import sys

from release_notes import COMPONENTS, extract, gh, run

RELEASE_TYPES = {"feat", "feature", "fix", "perf", "revert"}
CONVENTIONAL = re.compile(r"^([\w-]+)(?:\([^()\n]+\))?(!?):\s+\S", re.M)
REVERT = re.compile(r'^(?:revert(?:\([^()]+\))?!?: |(?:Revert|Reapply) ")')


def visible(message):
    # Release Please also finds conventional entries in nested commit blocks.
    return re.search(r"^BREAKING[ -]CHANGE:\s+\S", message, re.M) or any(
        breaking or kind in RELEASE_TYPES
        for kind, breaking in CONVENTIONAL.findall(message)
    )


def changes_since(tag, base, component):
    # Release Please includes every commit in the root package, and shared commits
    # also belong to each nested package whose files they touch.
    paths = [] if component == "." else [component]
    revision = f"{tag}..{base}" if tag else base
    fields = run(
        "git",
        "log",
        "--full-history",
        "--topo-order",
        "-z",
        "--format=%H%x00%B",
        revision,
        "--",
        *paths,
    ).split("\0")
    commits = dict(zip(fields[::2], fields[1::2]))
    reverted = set()
    for sha, message in commits.items():
        if sha in reverted:
            continue
        subject = message.partition("\n")[0]
        target = REVERT.match(subject) and re.search(
            r"^This reverts commit ([a-f\d]{40})\b", message, re.M
        )
        if target and target[1] in commits:
            # Newest first: a revert of a revert restores the original change.
            reverted.add(target[1])
        elif visible(message) or (target and visible(subject.partition('"')[2])):
            yield sha, subject


def references(notes, repo):
    # Count visible text and link destinations. A foreign PR with a local-looking
    # label or a SHA in a hidden comment must not satisfy the release inventory.
    notes = re.sub(r"<!--.*?(?:-->|\Z)|\[[^\]\n]*\](?=\()", "", notes, flags=re.S)
    local = re.compile(
        re.escape(f"https://github.com/{repo}/")
        + r"(?:commit/([a-f\d]{7,40})|(?:pull|issues)/(\d+))/?(?:[?#].*)?",
        re.I,
    )

    def local_reference(url):
        ref = local.fullmatch(url[0])
        if not ref:
            return " "
        return ref[1] or f"#{ref[2]}"

    notes = re.sub(r"https?://[^\s)>\]]+", local_reference, notes, flags=re.I)
    shas = tuple(re.findall(r"\b[a-f\d]{7,40}\b", notes.lower()))
    pulls = set(re.findall(r"(?<![\w/])#(\d+)\b", notes))
    return shas, pulls


def covered_by_pr(sha, subject, pulls, repo):
    squash = re.search(r"\(#(\d+)\)$", subject)
    if squash and squash[1] in pulls:
        return True
    if not pulls or not os.getenv("GH_TOKEN"):
        return False
    # For merge and rebase histories the PR number may be absent from the subject.
    return any(
        str(pr["number"]) in pulls
        and pr["merged_at"]
        and pr["base"]["repo"]["full_name"] == repo
        and pr["base"]["ref"] == os.getenv("GITHUB_BASE_REF", "main")
        for pr in gh(f"repos/{repo}/commits/{sha}/pulls?per_page=100")
    )


def manifest(ref):
    return json.loads(run("git", "show", f"{ref}:.release-please-manifest.json"))


def check(base, head):
    repo = os.getenv("GITHUB_REPOSITORY", "promptfoo/promptfoo")
    fork = run("git", "merge-base", base, head).strip()
    original, candidate = manifest(fork), manifest(head)
    current = original if fork == base else manifest(base)
    missing = []
    for component, path, prefix in COMPONENTS.values():
        version = candidate[component]
        if version == original[component]:
            continue
        if current[component] != original[component]:
            raise ValueError(
                f"{component} has already released {current[component]}. Refresh this release PR."
            )
        tag = f"refs/tags/{prefix}{current[component]}" if current[component] else None
        if tag:
            run("git", "merge-base", "--is-ancestor", tag, base)
        section = extract(run("git", "show", f"{head}:{path}"), version)
        shas, pulls = references(section, repo)
        for sha, subject in changes_since(tag, base, component):
            if not sha.startswith(shas) and not covered_by_pr(
                sha, subject, pulls, repo
            ):
                missing.append(f"{path} ({version}): {sha} {subject}")
    if missing:
        raise ValueError(
            "Add a commit or PR reference to the corresponding version section:\n"
            + "\n".join(missing)
        )


if __name__ == "__main__":
    try:
        check(*sys.argv[1:])
    except ValueError as error:
        sys.exit(str(error))
