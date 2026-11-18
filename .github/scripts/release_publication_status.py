"""Report consumer-visible release artifacts on their original release-please PR."""

import base64
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SOURCE = "promptfoo/promptfoo"
MIRROR = "promptfoo/code-scan-action"
BRANCH = "release-please--branches--main--components--"
BOT = "promptfoobot[bot]"
MARKER = "<!-- promptfoo-release-publication -->"
PENDING = "Publication verification is incomplete"


def github(path, *, method="GET", body=None, items=None, missing_ok=False):
    command = ["gh", "api", "--method", method, path]
    if items:
        command.extend(["--paginate", "--jq", items + " | @json"])
    if body is not None:
        command.extend(["--input", "-"])
    result = subprocess.run(
        command,
        input=json.dumps(body) if body is not None else None,
        capture_output=True,
        text=True,
    )
    if missing_ok and result.returncode and "(HTTP 404)" in result.stderr:
        return None
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    if items:
        return [json.loads(line) for line in result.stdout.splitlines()]
    return json.loads(result.stdout)


def version_at(repo, path, sha):
    data = github(f"repos/{repo}/contents/{path}?ref={sha}")
    version = json.loads(base64.b64decode(data["content"]))["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", version):
        raise ValueError(f"Invalid release version in {path}")
    return version


def source_component(pr):
    if (
        pr.get("merged_at")
        and pr["base"]["ref"] == "main"
        and pr["base"]["repo"]["full_name"] == SOURCE
        and (pr["head"].get("repo") or {}).get("full_name") == SOURCE
        and pr["user"]["login"] == BOT
    ):
        for component in ("promptfoo", "code-scan-action"):
            if pr["head"]["ref"] == BRANCH + component:
                return component
    return None


def discover(event, sha, number):
    if event == "workflow_dispatch":
        return [int(number)]
    if event in ("push", "workflow_run"):
        prs = github(f"repos/{SOURCE}/commits/{sha}/pulls")
        return [
            pr["number"]
            for pr in prs
            if pr["merge_commit_sha"] == sha and source_component(pr)
        ]
    # Cover first-attempt outages as well as mirror PRs that remain open for
    # weeks. Completed releases need no more registry or workflow checks.
    query = f"repo:{SOURCE} is:pr is:merged author:app/promptfoobot head:{BRANCH}"

    def search(qualifier):
        params = urlencode({"q": f"{query} {qualifier}", "per_page": 100})
        return {
            pr["number"] for pr in github("search/issues?" + params, items=".items[]")
        }

    pending = search(f'in:comments "{PENDING}"')
    week_ago = (datetime.now(timezone.utc).date() - timedelta(days=7)).isoformat()
    for number in search(f"merged:>={week_ago}") - pending:
        comment = status_comment(number)
        if not comment or PENDING in comment["body"]:
            pending.add(number)
    return sorted(pending)


def workflow(repo, filename, sha, event):
    query = urlencode({"head_sha": sha, "event": event, "per_page": 1})
    runs = github(f"repos/{repo}/actions/workflows/{filename}/runs?{query}")[
        "workflow_runs"
    ]
    return runs[0] if runs else None


def run_state(run):
    if not run or run["status"] != "completed":
        return "Pending"
    return (
        "Succeeded"
        if run["conclusion"] == "success"
        else f"Failed ({run['conclusion']})"
    )


def absent(run):
    return "Pending" if run_state(run) == "Pending" else "Missing after publication run"


def http_request(url, **options):
    try:
        return urlopen(Request(url, **options), timeout=15)
    except HTTPError as error:
        if error.code != 404:
            raise
        return None


def npm_published(version):
    response = http_request(f"https://registry.npmjs.org/promptfoo/{version}")
    if response is None:
        return False
    with response:
        package = json.load(response)
        return package["name"] == "promptfoo" and package["version"] == version


def docker_digest(version):
    # Anonymous pull token for the public registry. Never send GitHub credentials.
    with urlopen(
        f"https://ghcr.io/token?service=ghcr.io&scope=repository:{SOURCE}:pull",
        timeout=15,
    ) as response:
        token = json.load(response)["token"]
    response = http_request(
        f"https://ghcr.io/v2/{SOURCE}/manifests/{version}",
        method="HEAD",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json",
        },
    )
    if response is None:
        return None
    with response:
        digest = response.headers["Docker-Content-Digest"]
        if not re.fullmatch(r"sha256:[a-f0-9]{64}", digest or ""):
            raise ValueError("GHCR did not return a manifest digest")
        return digest


def link_run(label, run):
    return f"[{label}]({run['html_url']})" if run else label


def tag_commit(tag):
    ref = github(f"repos/{MIRROR}/git/ref/tags/{tag}", missing_ok=True)
    if not ref:
        return None
    obj = ref["object"]
    while obj["type"] == "tag":
        obj = github(f"repos/{MIRROR}/git/tags/{obj['sha']}")["object"]
    return obj["sha"] if obj["type"] == "commit" else None


def action_rows(version, sha, source_run):
    branch = f"release/code-scan-action-v{version}"
    query = urlencode({"state": "all", "base": "main", "head": f"promptfoo:{branch}"})
    prs = github(f"repos/{MIRROR}/pulls?{query}")
    pr = next(
        (
            p
            for p in prs
            if p["user"]["login"] == BOT
            and (p["head"].get("repo") or {}).get("full_name") == MIRROR
        ),
        None,
    )
    tag = f"v{version}"
    public = f"[{MIRROR}@{tag}](https://github.com/{MIRROR}/releases/tag/{tag})"
    if not pr:
        return [
            f"Mirror PR — {absent(source_run)}",
            f"{public} — Pending mirror",
        ], False

    merged = pr["merged_at"] is not None
    mirror_state = (
        "Merged"
        if merged
        else ("Awaiting merge" if pr["state"] == "open" else "Closed without merge")
    )
    validate = workflow(
        MIRROR, "validate-release-pr.yml", pr["head"]["sha"], "pull_request"
    )
    rows = [
        f"Mirror [PR #{pr['number']}]({pr['html_url']}) — {mirror_state}",
        f"{link_run('Mirror validation', validate)} — {run_state(validate)}",
    ]
    if not merged:
        return [*rows, f"{public} — Pending mirror merge"], False

    merge_sha = pr["merge_commit_sha"]
    publish = workflow(MIRROR, "release-tags.yml", merge_sha, "push")
    rows.append(f"{link_run('Mirror tag publication', publish)} — {run_state(publish)}")
    # Match the exact public tag, merge commit and source provenance.
    tag_sha = tag_commit(tag)
    release = github(f"repos/{MIRROR}/releases/tags/{tag}", missing_ok=True)
    if not tag_sha or not release or release["draft"]:
        return [*rows, f"{public} — {absent(publish)}"], False
    metadata = github(f"repos/{MIRROR}/contents/.release-source.json?ref={tag_sha}")
    manifest = json.loads(base64.b64decode(metadata["content"]))
    expected = {
        "repository": SOURCE,
        "sourceSha": sha,
        "sourceTag": f"code-scan-action-{version}",
        "version": version,
        "packagePath": "code-scan-action",
    }
    if tag_sha != merge_sha or any(
        manifest.get(key) != value for key, value in expected.items()
    ):
        return [*rows, f"{public} — Failed source verification"], False
    verified = all(run_state(run) == "Succeeded" for run in (validate, publish))
    state = "Published" if verified else "Tag visible; workflow verification incomplete"
    return [*rows, f"{public} — {state} at `{merge_sha[:12]}`"], verified


def report(pr):
    component = source_component(pr)
    sha = pr["merge_commit_sha"]
    cli = version_at(SOURCE, "package.json", sha)
    run = workflow(SOURCE, "release-please.yml", sha, "push")
    action = component == "code-scan-action"
    version = (
        version_at(SOURCE, "code-scan-action/package.json", sha) if action else cli
    )
    npm = npm_published(cli)
    npm_state = "Published" if npm else absent(run)
    pin = "Pinned CLI" if action else "npm"
    rows = [
        f"{link_run('Source publication workflow', run)} — {run_state(run)}",
        f"{pin} [promptfoo@{cli}](https://www.npmjs.com/package/promptfoo/v/{cli}) — {npm_state}",
    ]
    if action:
        details, available = action_rows(version, sha, run)
        rows.extend(details)
    else:
        digest = docker_digest(version)
        available = bool(digest)
        image = f"ghcr.io/{SOURCE}:{version}"
        state = f"Published, `{digest}`" if digest else absent(run)
        rows.append(
            f"Docker [`{image}`](https://github.com/{SOURCE}/pkgs/container/promptfoo) — {state}"
        )
    footer = (
        ""
        if npm and available and run_state(run) != "Pending"
        else f"\n\n{PENDING}. This report refreshes automatically."
    )
    lines = "\n".join(f"- {row}" for row in rows)
    return (
        f"{MARKER}\n## Publication status for {component} {version}\n\n{lines}{footer}"
    )


def status_comment(pr_number):
    endpoint = f"repos/{SOURCE}/issues/{pr_number}/comments"
    comments = github(f"{endpoint}?per_page=100", items=".[]")
    return next(
        (
            comment
            for comment in comments
            if comment["user"]["login"] == "github-actions[bot]"
            and comment["body"].startswith(MARKER)
        ),
        None,
    )


def update(pr_number, dry_run=False):
    pr = github(f"repos/{SOURCE}/pulls/{pr_number}")
    if not source_component(pr):
        raise ValueError(
            "Expected a merged release-please PR from the source repository"
        )
    if dry_run:
        print(report(pr))
        return

    existing = status_comment(pr_number)
    endpoint = f"repos/{SOURCE}/issues/{pr_number}/comments"

    def save(body):
        if not existing:
            github(endpoint, method="POST", body={"body": body})
        elif existing["body"] != body:
            github(
                f"repos/{SOURCE}/issues/comments/{existing['id']}",
                method="PATCH",
                body={"body": body},
            )

    try:
        body = report(pr)
    except (OSError, RuntimeError, ValueError):
        # Preserve any prior evidence, and keep the PR discoverable after an
        # outage on the very first publication check. Surface the failed check.
        body = existing["body"] if existing else f"{MARKER}\n## Publication status"
        if PENDING not in body:
            save(f"{body}\n\n{PENDING}. The registry or workflow check will retry.")
        raise
    save(body)


if __name__ == "__main__":
    if sys.argv[1] == "discover":
        print(
            json.dumps(
                discover(
                    os.environ["GITHUB_EVENT_NAME"],
                    os.getenv("RELEASE_SHA"),
                    os.getenv("RELEASE_PR"),
                )
            )
        )
    elif sys.argv[1] in ("update", "preview"):
        update(int(os.environ["RELEASE_PR"]), dry_run=sys.argv[1] == "preview")
