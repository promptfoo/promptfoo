"""Prepare a release PR from protected tooling and publish its tagged changelog section."""

import argparse
import base64
import html
import json
import os
import re
import subprocess
import textwrap
from pathlib import Path

from release_note_links import LINK, check_links

COMPONENTS = {
    "promptfoo": (".", "CHANGELOG.md", ""),
    "code-scan-action": (
        "code-scan-action",
        "code-scan-action/CHANGELOG.md",
        "code-scan-action-",
    ),
}
BRANCH_PREFIX = "release-please--branches--main--components--"
HEADER = re.compile(r"^## \[(\d+\.\d+\.\d+)\](?:\([^\n]+\))?[^\n]*$", re.M)
DISCLOSURE = "<details>\n<summary>All changes</summary>"
OVERRIDE = "<!-- reviewed-release-notes -->"
FOOTER = "This PR was generated with [Release Please](https://github.com/googleapis/release-please)."


def run(*args, data=None):
    return subprocess.run(
        args,
        input=data,
        encoding="utf-8",
        capture_output=False,
        stdout=subprocess.PIPE,
        check=True,
        timeout=120,
    ).stdout


def gh(path, *args, data=None):
    command = ["gh", "api", path, *args]
    if data is not None:
        command.extend(["--input", "-"])
    return json.loads(
        run(*command, data=json.dumps(data) if data is not None else None)
    )


def section_bounds(text, version):
    headings = list(HEADER.finditer(text))
    matches = [i for i, heading in enumerate(headings) if heading[1] == version]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one changelog section for {version}")
    i = matches[0]
    return headings[i].start(), headings[i + 1].start() if i + 1 < len(
        headings
    ) else len(text)


def extract(text, version):
    start, end = section_bounds(text, version)
    section = text[start:end].strip()
    if not section.partition("\n")[2].strip():
        raise ValueError(f"Empty changelog section for {version}")
    return section


def prepare_section(section, overview, component, scanner_version=None):
    title, _, content = section.partition("\n")
    if DISCLOSURE in content:
        _, _, content = content.partition(DISCLOSURE)
        if not content.rstrip().endswith("</details>"):
            raise ValueError("Incomplete All changes disclosure")
        content = content.rstrip().removesuffix("</details>")
    inventory = content.strip()
    if not inventory:
        raise ValueError("Empty release inventory")
    if overview:
        # A second version heading or disclosure would break consumers' section boundaries.
        if re.search(
            r"^#{1,2}(?:\s|$)|^---+$|</?(?:details|summary)\b", overview, re.M | re.I
        ):
            raise ValueError(
                "Use prose, lists and level-three headings in reviewed release notes"
            )
        breaking = re.search(
            r"^### [^\n]*BREAKING[^\n]*\n(.*?)(?=^### |\Z)", inventory, re.M | re.S
        )
        if breaking and not re.search(
            r"^### (Before upgrading|Upgrade notes|Breaking changes)$",
            overview,
            re.M | re.I,
        ):
            overview = (
                "### Before upgrading\n\n" + breaking[1].strip() + "\n\n" + overview
            )
    else:
        groups = re.split(r"^### (.+)$", inventory, flags=re.M)
        breaking, features, fixes = [], [], []
        for name, body in zip(groups[1::2], groups[2::2]):
            bullets = [s for s in body.splitlines() if s.startswith(("- ", "* "))]
            if "BREAKING" in name.upper():
                breaking.extend(bullets)
            elif name in {"Features", "Bug Fixes", "Performance Improvements"}:
                (features if name == "Features" else fixes).extend(bullets)
        priority = features + [s for s in fixes if "**deps:**" not in s] + fixes
        if not priority and not breaking:
            priority = [
                line for line in inventory.splitlines() if line.startswith(("- ", "* "))
            ]
        bullets = list(dict.fromkeys(priority))[:4]
        chunks = []
        if breaking:
            chunks.append("### Before upgrading\n\n" + "\n".join(breaking))
        if bullets:
            chunks.append("### Highlights\n\n" + "\n".join(bullets))
        overview = "\n\n".join(chunks)
    if (
        component == "code-scan-action"
        and f"promptfoo@{scanner_version}" not in overview
    ):
        overview += (
            f"\n\nThis action installs `promptfoo@{scanner_version}` to run scans."
        )
    return f"{title}\n\n{overview.strip()}\n\n{DISCLOSURE}\n\n{inventory}\n\n</details>"


def writer_overview(repo, number):
    comments = []
    for page in range(1, 11):
        batch = gh(f"repos/{repo}/issues/{number}/comments?per_page=100&page={page}")
        comments.extend(c for c in batch if c["body"].splitlines()[:1] == [OVERRIDE])
        if len(batch) < 100:
            break
    else:
        raise ValueError("Too many comments to establish the latest reviewed wording")
    for comment in sorted(
        comments, key=lambda c: (c["updated_at"], c["id"]), reverse=True
    ):
        login = comment["user"]["login"]
        access = gh(f"repos/{repo}/collaborators/{login}/permission")["permission"]
        if access in {"admin", "write", "maintain"}:
            return comment["body"].partition("\n")[2].strip()
    return ""


def version_at(head, path):
    version = json.loads(run("git", "show", f"{head}:{path}"))["version"]
    if not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError(f"Unexpected version in {path}")
    return version


def component_for(pr, repo):
    branch = pr["head"]["ref"]
    component = branch.removeprefix(BRANCH_PREFIX)
    if (
        pr["state"] == "open"
        and pr["base"]["ref"] == "main"
        and pr["head"]["repo"]["full_name"] == repo
        and pr["user"]["login"] == "promptfoobot[bot]"
        and branch == BRANCH_PREFIX + component
        and component in COMPONENTS
    ):
        return component
    return None


def prepare(repo, number, output):
    pr = gh(f"repos/{repo}/pulls/{number}")
    component = component_for(pr, repo)
    if not component:
        return
    branch = pr["head"]["ref"]
    head = pr["head"]["sha"]
    # Fetch as an object only. No files, hooks or tools from the candidate are executed.
    run("git", "fetch", "--no-tags", "origin", f"refs/pull/{number}/head")
    if run("git", "rev-parse", "FETCH_HEAD").strip() != head:
        raise ValueError("Release branch advanced; rerun on its latest commit")
    package, path, prefix = COMPONENTS[component]
    package_json = "package.json" if package == "." else f"{package}/package.json"
    version = version_at(head, package_json)
    base = run("git", "merge-base", head, pr["base"]["sha"]).strip()
    previous = version_at(base, package_json)
    manifest = json.loads(run("git", "show", f"{head}:.release-please-manifest.json"))
    if manifest.get(package) != version:
        raise ValueError(
            f"The release manifest and {package_json} disagree for {component}"
        )
    if previous == version:
        raise ValueError("Release PR must advance the component version")
    tag, previous_tag = prefix + version, prefix + previous
    source = run("git", "show", f"{head}:{path}")
    section = prepare_section(
        extract(source, version),
        writer_overview(repo, number),
        component,
        version_at(head, "package.json"),
    )
    section = check_links(section, repo, previous_tag, tag, head)
    output.write_text(
        json.dumps(
            {
                "repo": repo,
                "number": number,
                "branch": branch,
                "head": head,
                "path": path,
                "source": source,
                "version": version,
                "section": section,
                "original_body": pr["body"],
            }
        )
    )


def pr_preview(section, intro, changelog_url, footer=""):
    def compose(preview):
        return f"{intro}\n\n---\n\n{preview}" + (
            f"\n\n---\n\n{footer}" if footer else ""
        )

    # GitHub caps PR bodies at 65,536 characters. The changelog always retains
    # the complete section; the common case previews it byte-for-byte.
    if len(compose(section).encode()) <= 65000:
        return compose(section)
    overview = section.partition(DISCLOSURE)[0].strip()
    more = f"[Read the complete reviewed notes and change inventory]({changelog_url})."
    if len(compose(overview + "\n\n" + more).encode()) <= 65000:
        return compose(overview + "\n\n" + more)

    # Extremely long overviews still have a readable, bounded preview. Convert
    # excerpts to text (including link labels) so no truncated Markdown can leak
    # into the next heading, code block, or link.
    heading, _, body = overview.partition("\n")
    groups = re.split(r"^### ([^\n]+)$", body, flags=re.M)
    excerpts = [heading]
    sections = [("", groups[0]), *zip(groups[1::2], groups[2::2])]
    for title, paragraph in sections:
        line = next(
            (
                line.strip("-* ")
                for line in paragraph.splitlines()
                if line.strip() and not line.startswith(("```", "~~~"))
            ),
            "",
        )
        if line:
            value = LINK.sub(lambda m: m[1], line).replace("**", "").replace("`", "")
            value = textwrap.shorten(value, width=600, placeholder="…")
            if title:
                excerpts.append("### " + html.escape(title[:80]))
            excerpts.append("<p>" + html.escape(value) + "</p>")
        if len(excerpts) >= 10:
            break
    return compose("\n\n".join([*excerpts, more]))


def format_plan(prepared, output, prettier):
    data = json.loads(prepared.read_text())
    source = data.pop("source")
    version = data.pop("version")
    section = data.pop("section")
    original_body = data.pop("original_body")
    # Use the pinned, isolated formatter, matching the project's markdown formatting.
    section = run(
        prettier,
        "--no-config",
        "--no-editorconfig",
        "--parser",
        "markdown",
        data=section,
    ).strip()
    start, end = section_bounds(source, version)
    tail = source[end:]
    updated = source[:start] + section + ("\n\n" if tail else "\n") + tail
    intro = (
        f"Review the release notes below. To revise the summary, start a PR comment with "
        f"`{OVERRIDE}` on its own line and put the replacement Markdown below it."
    )
    body = pr_preview(
        section,
        intro,
        f"https://github.com/{data['repo']}/pull/{data['number']}/files",
        FOOTER,
    )
    if updated == source and body == original_body:
        return
    output.write_text(
        json.dumps(
            {
                **data,
                "changes": None if updated == source else updated,
                "body": None if body == original_body else body,
            }
        )
    )


def apply(plan, repo, number):
    data = json.loads(plan.read_text())
    candidate = gh(f"repos/{repo}/pulls/{number}")
    component = component_for(candidate, repo)
    branch, head = candidate["head"]["ref"], candidate["head"]["sha"]
    # Re-establish the write scope from the authenticated PR, independently of
    # the formatter output. The App can update only this component's changelog.
    if (
        not component
        or data["repo"] != repo
        or data["number"] != number
        or data["branch"] != branch
        or head != data["head"]
        or data["path"] != COMPONENTS[component][1]
    ):
        raise ValueError(
            "Release candidate changed before publication; rerun on its latest commit"
        )
    if data["changes"] is not None:
        # The expected head makes a bot refresh or concurrent maintainer edit safe.
        mutation = """mutation($input: CreateCommitOnBranchInput!) {
          createCommitOnBranch(input: $input) { commit { oid } }
        }"""
        payload = {
            "branch": {"repositoryNameWithOwner": repo, "branchName": branch},
            "expectedHeadOid": head,
            "message": {"headline": "chore: prepare reviewed release notes"},
            "fileChanges": {
                "additions": [
                    {
                        "path": data["path"],
                        "contents": base64.b64encode(data["changes"].encode()).decode(),
                    }
                ]
            },
        }
        gh("graphql", data={"query": mutation, "variables": {"input": payload}})
    if data["body"] is not None:
        gh(
            f"repos/{repo}/pulls/{number}",
            "--method",
            "PATCH",
            data={"body": data["body"]},
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_subparsers(dest="mode", required=True)
    pre = modes.add_parser("prepare")
    pre.add_argument("pr", type=int)
    pre.add_argument("prepared", type=Path)
    fmt = modes.add_parser("format")
    fmt.add_argument("prepared", type=Path)
    fmt.add_argument("plan", type=Path)
    fmt.add_argument("prettier")
    commit = modes.add_parser("apply")
    commit.add_argument("pr", type=int)
    commit.add_argument("plan", type=Path)
    tagged = modes.add_parser("extract")
    tagged.add_argument("tag")
    mirror = modes.add_parser("mirror-preview")
    mirror.add_argument("changelog", type=Path)
    mirror.add_argument("version")
    mirror.add_argument("source_sha")
    mirror.add_argument("scanner_version")
    args = parser.parse_args()
    if args.mode == "prepare":
        prepare(os.environ["GITHUB_REPOSITORY"], args.pr, args.prepared)
    elif args.mode == "format":
        format_plan(args.prepared, args.plan, args.prettier)
    elif args.mode == "apply":
        apply(args.plan, os.environ["GITHUB_REPOSITORY"], args.pr)
    elif args.mode == "mirror-preview":
        repo = os.environ["GITHUB_REPOSITORY"]
        source = f"https://github.com/{repo}"
        tag = "code-scan-action-" + args.version
        intro = (
            f"Mirrors the [source release]({source}/releases/tag/{tag}) at "
            f"[commit {args.source_sha[:12]}]({source}/commit/{args.source_sha})."
        )
        section = extract(args.changelog.read_text(), args.version)
        if f"promptfoo@{args.scanner_version}" not in section.partition(DISCLOSURE)[0]:
            intro += (
                f" The action installs `promptfoo@{args.scanner_version}` to run scans."
            )
        url = f"{source}/blob/{args.source_sha}/code-scan-action/CHANGELOG.md"
        print(pr_preview(section, intro, url))
    else:
        tag = re.fullmatch(r"(code-scan-action-)?(\d+\.\d+\.\d+)", args.tag)
        if not tag:
            raise ValueError("Unexpected release tag")
        path = COMPONENTS["code-scan-action" if tag[1] else "promptfoo"][1]
        print(extract(run("git", "show", f"refs/tags/{args.tag}:{path}"), tag[2]))


if __name__ == "__main__":
    main()
