"""Check release section links before the tag exists. Only gh api receives a GitHub credential."""

import ipaddress
import json
import os
import re
import socket
import subprocess
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from urllib.parse import unquote, urljoin, urlsplit

LINK = re.compile(r"\[([^\]\n]*)\]\(([^()\s]+)\)")
SHA = re.compile(r"[0-9a-f]{40}")


def issue_types(repo, numbers):
    owner, name = repo.split("/")
    found = {}
    ordered = sorted(numbers)
    for offset in range(0, len(ordered), 40):
        chunk = ordered[offset : offset + 40]
        fields = " ".join(
            f"n{n}:issueOrPullRequest(number:{n}){{__typename}}" for n in chunk
        )
        query = (
            "query($owner:String!,$name:String!){repository(owner:$owner,name:$name){"
            + fields
            + "}}"
        )
        r = subprocess.run(
            [
                "gh",
                "api",
                "graphql",
                "-f",
                "query=" + query,
                "-f",
                "owner=" + owner,
                "-f",
                "name=" + name,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        obj = json.loads(r.stdout)
        errors = obj.get("errors", [])
        if (r.returncode and not errors) or any(
            e.get("type") != "NOT_FOUND"
            or e.get("path") not in [["repository", f"n{n}"] for n in chunk]
            for e in errors
        ):
            raise ValueError(
                "GitHub could not validate release PR links; retry after the API recovers"
            )
        for n in chunk:
            row = obj["data"]["repository"][f"n{n}"]
            found[n] = row["__typename"] if row else None
    return found


class AnchorParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.anchors = set()

    def handle_starttag(self, tag, attrs):
        self.anchors.update(
            v for k, v in attrs if k == "id" or (k == "name" and tag == "a")
        )


def check_public_url(url):
    # Resolve each redirect again and pin a public address for the request. Never
    # forward GH_TOKEN, credentials from curlrc, proxy credentials or cookies.
    original = url
    fragment = unquote(urlsplit(url).fragment)
    for _ in range(6):
        parsed = urlsplit(url)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.port not in (None, 443)
            or parsed.username
            or parsed.password
            or not re.fullmatch(r"[a-zA-Z0-9.-]+", parsed.hostname)
        ):
            raise ValueError(f"Expected a public HTTPS release-note link: {original}")
        env = {"PATH": os.environ["PATH"]}
        if parsed.hostname in {"www.promptfoo.dev", "promptfoo.dev", "github.com"}:
            # These fixed public origins may also be reached through a CI egress proxy.
            # The subprocess receives no GitHub token or ambient curl configuration.
            env.update(
                {
                    k: os.environ[k]
                    for k in (
                        "HTTPS_PROXY",
                        "https_proxy",
                        "SSL_CERT_FILE",
                        "CURL_CA_BUNDLE",
                    )
                    if k in os.environ
                }
            )
            routing = []
        else:
            addresses = [
                v[4][0]
                for v in socket.getaddrinfo(
                    parsed.hostname, 443, type=socket.SOCK_STREAM
                )
            ]
            if not addresses or not all(
                ipaddress.ip_address(a).is_global for a in addresses
            ):
                raise ValueError(
                    f"Release-note link does not resolve to a public address: {original}"
                )
            addr = next((a for a in addresses if ":" not in a), f"[{addresses[0]}]")
            routing = ["--noproxy", "*", "--resolve", f"{parsed.hostname}:443:{addr}"]
        r = subprocess.run(
            [
                "curl",
                "--disable",
                "--silent",
                "--show-error",
                "--globoff",
                "--suppress-connect-headers",
                *routing,
                "--proto",
                "=https",
                "--max-time",
                "12",
                "--max-filesize",
                "5000000",
                "--dump-header",
                "-",
                "--url",
                url,
            ],
            stdout=subprocess.PIPE,
            check=True,
            timeout=15,
            env=env,
        ).stdout
        header, _, body = r.partition(b"\r\n\r\n")
        status = int(header.splitlines()[0].split()[1])
        if 300 <= status < 400:
            match = re.search(rb"^location:\s*(.*?)\s*$", header, re.I | re.M)
            if not match:
                break
            url = urljoin(url, match[1].decode())
            fragment = unquote(urlsplit(url).fragment) or fragment
            continue
        if status < 200 or status >= 300:
            raise ValueError(f"Release-note link returned {status}: {original}")
        if fragment:
            anchors = AnchorParser()
            anchors.feed(body.decode("utf-8", errors="replace"))
            if (
                fragment not in anchors.anchors
                and f"user-content-{fragment}" not in anchors.anchors
            ):
                raise ValueError(f"Missing release-note link anchor: {original}")
        return
    raise ValueError(f"Too many redirects for release-note link: {original}")


def check_links(section, repo, previous_tag, tag, head):
    prefix = f"https://github.com/{repo}/"
    urls = {m[2] for m in LINK.finditer(section)}
    if len(urls) > 1000:
        raise ValueError("Release section exceeds the 1,000-link validation budget")
    compare = f"{prefix}compare/{previous_tag}...{tag}"
    if compare not in section.splitlines()[0]:
        raise ValueError(f"Expected component comparison {compare}")
    # The right side is the future release tag. Its immutable candidate is head.
    subprocess.run(
        ["git", "merge-base", "--is-ancestor", f"refs/tags/{previous_tag}", head],
        check=True,
    )
    issue_urls, commits, outside = {}, {}, set()
    for url in urls - {compare}:
        path = url.removeprefix(prefix)
        if url.startswith(prefix) and (m := re.fullmatch(r"(issues|pull)/(\d+)", path)):
            issue_urls[url] = (m[1], int(m[2]))
        elif (
            url.startswith(prefix)
            and path.startswith("commit/")
            and SHA.fullmatch(path[7:])
        ):
            commits[url] = path[7:]
        else:
            outside.add(url)
    for sha in commits.values():
        subprocess.run(["git", "merge-base", "--is-ancestor", sha, head], check=True)
    # Compare both the issue number and its type. GitHub's /issues/N redirects for PRs.
    types = issue_types(repo, {n for _, n in issue_urls.values()})
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(check_public_url, sorted(outside)))
    # Use the immutable squash commit's own PR number. This also works after a
    # previous refresh has already replaced the dead link in the inventory.
    fallbacks = {}
    if commits:
        subjects = subprocess.check_output(
            [
                "git",
                "show",
                "--no-patch",
                "--format=%H%x09%s",
                *dict.fromkeys(commits.values()),
            ],
            text=True,
        )
        for line in subjects.splitlines():
            sha, _, subject = line.partition("\t")
            number = re.search(r"\(#(\d+)\)$", subject)
            if number:
                fallbacks.setdefault(int(number[1]), set()).add(
                    prefix + "commit/" + sha
                )

    def fix(match):
        label, url = match.groups()
        if url not in issue_urls:
            return match[0]
        kind, number = issue_urls[url]
        if types[number] and (kind == "issues" or types[number] == "PullRequest"):
            return match[0]
        sources = fallbacks.get(number, set())
        if len(sources) != 1:
            raise ValueError(f"Missing {url}; supply a link to the source commit")
        commit = next(iter(sources))
        return f"[{commit.rsplit('/', 1)[1][:7] if label == '#' + str(number) else label}]({commit})"

    # Generated inventories already carry the verified commit next to the PR.
    normalized = LINK.sub(fix, section)
    return re.sub(
        r"(\(\[[a-f0-9]+\]\(https://github\.com/[^)]+/commit/[0-9a-f]{40}\)\)) \1",
        r"\1",
        normalized,
    )
