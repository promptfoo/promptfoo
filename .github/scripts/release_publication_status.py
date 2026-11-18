"""Reconcile merged release PRs with the artifacts consumers can actually use."""

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from release_notes import gh, gh_rows

SOURCE = "promptfoo/promptfoo"
MIRROR = "promptfoo/code-scan-action"
BRANCH = "release-please--branches--main--components--"
BOT = "promptfoobot[bot]"
MARKER = "<!-- promptfoo-release-publication -->"
PENDING = "Publication verification is incomplete"


def component(pr):
    if (
        pr["merged_at"]
        and pr["user"]["login"] == BOT
        and pr["base"]["ref"] == "main"
        and pr["base"]["repo"]["full_name"] == SOURCE
        and (pr["head"]["repo"] or {}).get("full_name") == SOURCE
    ):
        for name in ("promptfoo", "code-scan-action"):
            if pr["head"]["ref"] == BRANCH + name:
                return name
    return None


def status_comment(number):
    for comment in gh_rows(f"repos/{SOURCE}/issues/{number}/comments?per_page=100"):
        if comment["user"]["login"] in (BOT, "github-actions[bot]") and comment[
            "body"
        ].startswith(MARKER):
            return comment
    return None


def candidates(number, sha):
    if number:
        return [int(number)]
    if sha:
        return [
            pr["number"]
            for pr in gh(f"repos/{SOURCE}/commits/{sha}/pulls")
            if pr["merge_commit_sha"] == sha and component(pr)
        ]

    # Recover recent releases missing their first report and older open mirrors.
    since = datetime.now(timezone.utc).date() - timedelta(days=7)
    query = (
        f"repo:{SOURCE} is:pr is:merged author:app/promptfoobot head:{BRANCH} "
        f'(merged:>={since} OR in:comments "{PENDING}")'
    )
    params = urlencode({"q": query, "advanced_search": "true", "per_page": 100})
    return [pr["number"] for pr in gh_rows("search/issues?" + params, ".items[]")]


def version_at(path, sha):
    data = gh(
        f"repos/{SOURCE}/contents/{path}?ref={sha}",
        "-H",
        "Accept: application/vnd.github.raw+json",
    )
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", data["version"]):
        raise ValueError(f"Invalid release version in {path}")
    return data["version"]


def workflow(repo, filename, sha, event="push"):
    query = urlencode({"head_sha": sha, "event": event, "per_page": 1})
    runs = gh(f"repos/{repo}/actions/workflows/{filename}/runs?{query}")[
        "workflow_runs"
    ]
    return runs[0] if runs else {}


def workflow_line(label, run):
    if run:
        label = f"[{label}]({run['html_url']})"
    state = "Pending"
    if run.get("status") == "completed":
        state = (
            "Succeeded"
            if run["conclusion"] == "success"
            else f"Failed ({run['conclusion']})"
        )
    return f"{label} — {state}"


def absent(run):
    return (
        "Missing after publication run"
        if run.get("status") == "completed"
        else "Pending"
    )


def registry(url, *, head=False, headers=None):
    request = Request(url, headers=headers or {}, method="HEAD" if head else "GET")
    try:
        with urlopen(request, timeout=15) as response:
            return response.headers if head else json.load(response)
    except HTTPError as error:
        if error.code == 404:
            return {}
        raise


def docker_digest(version):
    token = registry(
        f"https://ghcr.io/token?service=ghcr.io&scope=repository:{SOURCE}:pull"
    )["token"]
    headers = registry(
        f"https://ghcr.io/v2/{SOURCE}/manifests/{version}",
        head=True,
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json",
        },
    )
    if not headers:
        return None
    digest = headers.get("Docker-Content-Digest", "")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
        raise ValueError("GHCR did not return a manifest digest")
    return digest


def mirror_rows(version, sha, source_run):
    tag = "v" + version
    query = urlencode(
        {
            "state": "all",
            "base": "main",
            "head": f"promptfoo:release/code-scan-action-{tag}",
        }
    )
    prs = gh(f"repos/{MIRROR}/pulls?{query}")
    pr = next(
        (
            p
            for p in prs
            if p["user"]["login"] == BOT
            and (p["head"]["repo"] or {}).get("full_name") == MIRROR
        ),
        None,
    )
    public_link = f"[{MIRROR}@{tag}](https://github.com/{MIRROR}/releases/tag/{tag})"
    if not pr:
        return [
            f"Mirror PR — {absent(source_run)}",
            f"{public_link} — Pending mirror",
        ], False

    state = (
        "Merged"
        if pr["merged_at"]
        else {"open": "Awaiting merge", "closed": "Closed without merge"}[pr["state"]]
    )
    validation = workflow(
        MIRROR, "validate-release-pr.yml", pr["head"]["sha"], "pull_request"
    )
    details = [
        f"Mirror [PR #{pr['number']}]({pr['html_url']}) — {state}",
        workflow_line("Mirror validation", validation),
    ]
    if not pr["merged_at"]:
        return [*details, f"{public_link} — Pending mirror merge"], False

    merge = pr["merge_commit_sha"]
    publish = workflow(MIRROR, "release-tags.yml", merge)
    details.append(workflow_line("Mirror tag publication", publish))
    # GitHub peels annotated and lightweight tags. Read provenance at the same exact ref.
    ref = f"refs/tags/{tag}"
    query = """query($tag:String!, $commit:String!, $manifest:String!) {
      repository(owner:"promptfoo", name:"code-scan-action") {
        release(tagName:$tag) { isDraft }
        commit: object(expression:$commit) { oid }
        manifest: object(expression:$manifest) { ... on Blob { text } }
      }
    }"""
    public = gh(
        "graphql",
        data={
            "query": query,
            "variables": {
                "tag": tag,
                "commit": ref + "^{commit}",
                "manifest": ref + ":.release-source.json",
            },
        },
    )["data"]["repository"]
    verified = False
    state = absent(publish)
    if public["release"] and not public["release"]["isDraft"] and public["commit"]:
        source = json.loads((public["manifest"] or {}).get("text", "{}"))
        expected = {
            "repository": SOURCE,
            "sourceSha": sha,
            "sourceTag": f"code-scan-action-{version}",
            "version": version,
            "packagePath": "code-scan-action",
        }
        if public["commit"]["oid"] != merge or not expected.items() <= source.items():
            state = "Failed source verification"
        else:
            verified = all(
                r.get("conclusion") == "success" for r in (publish, validation)
            )
            state = (
                f"Published at `{merge[:12]}`"
                if verified
                else "Tag visible; workflow verification incomplete"
            )
    details.append(f"{public_link} — {state}")
    return details, verified


def report(name, sha):
    source_run = workflow(SOURCE, "release-please.yml", sha)
    cli = version_at("package.json", sha)
    npm = registry(f"https://registry.npmjs.org/promptfoo/{cli}")
    on_npm = npm.get("name") == "promptfoo" and npm.get("version") == cli
    action = name == "code-scan-action"
    version = version_at("code-scan-action/package.json", sha) if action else cli
    pin = "Pinned CLI" if action else "npm"
    npm_state = "Published" if on_npm else absent(source_run)
    details = [
        workflow_line("Source publication workflow", source_run),
        f"{pin} [promptfoo@{cli}](https://www.npmjs.com/package/promptfoo/v/{cli}) — {npm_state}",
    ]
    if action:
        extra, published = mirror_rows(version, sha, source_run)
        details.extend(extra)
    else:
        digest = docker_digest(version)
        published = bool(digest)
        state = f"Published, `{digest}`" if digest else absent(source_run)
        details.append(
            f"Docker [`ghcr.io/{SOURCE}:{version}`](https://github.com/{SOURCE}/pkgs/container/promptfoo) — {state}"
        )
    body = f"{MARKER}\n## Publication status for {name} {version}\n\n- " + "\n- ".join(
        details
    )
    if not (on_npm and published and source_run.get("status") == "completed"):
        body += f"\n\n{PENDING}. This report refreshes automatically."
    return body


def prepare(number, directory, *, pending_only=False):
    pr = gh(f"repos/{SOURCE}/pulls/{number}")
    name = component(pr)
    if not name:
        raise ValueError(
            "Expected a merged release-please PR from the source repository"
        )
    previous = status_comment(number)
    old = previous["body"] if previous else ""
    if pending_only and old and PENDING not in old:
        return
    body = old
    try:
        body = report(name, pr["merge_commit_sha"])
    except (OSError, ValueError, subprocess.SubprocessError):
        if PENDING not in old:
            body = (
                old or MARKER + "\n## Publication status"
            ) + f"\n\n{PENDING}. The registry or workflow check will retry."
        raise
    finally:
        if body != old:
            plan = {"comment": previous["id"] if previous else None, "body": body}
            (directory / f"{number}.json").write_text(json.dumps(plan))


def publish(file):
    number = int(file.stem)
    plan = json.loads(file.read_text())
    if not plan["body"].startswith(MARKER):
        raise ValueError("Expected the prepared publication report")
    if plan["comment"]:
        endpoint, method = f"issues/comments/{int(plan['comment'])}", "PATCH"
    else:
        endpoint, method = f"issues/{number}/comments", "POST"
    gh(f"repos/{SOURCE}/{endpoint}", "--method", method, data={"body": plan["body"]})


def main():
    mode, output = sys.argv[1:]
    directory = Path(output)
    failed = False
    if mode == "prepare":
        directory.mkdir(exist_ok=True)
        number, sha = os.getenv("RELEASE_PR"), os.getenv("RELEASE_SHA")
        tasks = candidates(number, sha)
    elif mode == "publish":
        tasks = directory.glob("*.json")
    else:
        raise ValueError("Expected prepare or publish")
    for task in tasks:
        try:
            if mode == "prepare":
                prepare(task, directory, pending_only=not number and not sha)
            else:
                publish(task)
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            print(f"{task}: {error}", file=sys.stderr)
            failed = True
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
