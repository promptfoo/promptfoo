"""Validate links in the proposed Markdown. Only gh receives the GitHub credential."""

import ipaddress
import json
import os
import re
import socket
import subprocess
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.links = Counter()
        self.anchors = set()
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "a" and attrs.get("href"):
            self.links[attrs["href"]] += 1
        if tag == "img" and attrs.get("src"):
            self.links[attrs["src"]] += 1
        self.anchors.update(
            v for v in (attrs.get("id"), attrs.get("name") if tag == "a" else None) if v
        )


def rendered_links(markdown):
    # Actions installs a fixed, protected copy outside the checkout. The parser
    # reads Markdown on stdin without loading project config or any credentials.
    tools = (
        Path(os.environ["RUNNER_TEMP"]) / "prettier-install"
        if "RUNNER_TEMP" in os.environ
        else Path.cwd()
    )
    result = subprocess.check_output(
        ["node", Path(__file__).with_name("release_note_markdown.mjs"), tools],
        input=markdown,
        text=True,
        timeout=45,
        env={"PATH": os.environ["PATH"]},
    )
    parsed = json.loads(result)
    links = Page("\n".join(parsed["html"])).links
    links.update(quote(url, safe=":/?#[]@!$&'()*+,;=%") for url in parsed["urls"])
    return links


def issue_types(repo, numbers):
    owner, name = repo.split("/")
    found = {}
    ordered = sorted(numbers)
    for offset in range(0, len(ordered), 40):
        chunk = ordered[offset : offset + 40]
        fields = " ".join(
            f"n{n}:issueOrPullRequest(number:{n}){{__typename}}" for n in chunk
        )
        query = f"query($owner:String!,$name:String!){{repository(owner:$owner,name:$name){{{fields}}}}}"
        result = subprocess.run(
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
        obj = json.loads(result.stdout)
        errors = obj.get("errors", [])
        expected_paths = [["repository", f"n{n}"] for n in chunk]
        if (result.returncode and not errors) or any(
            e.get("type") != "NOT_FOUND" or e.get("path") not in expected_paths
            for e in errors
        ):
            raise ValueError(
                "GitHub could not validate release citations; retry after the API recovers"
            )
        for n in chunk:
            row = obj["data"]["repository"][f"n{n}"]
            found[n] = row["__typename"] if row else None
    return found


def check_public_url(url):
    original = url
    fragment = unquote(urlsplit(url).fragment)
    for _ in range(6):
        target = urlsplit(url)
        host = target.hostname or ""
        if (
            target.scheme != "https"
            or target.port not in (None, 443)
            or target.username
            or target.password
            or not re.fullmatch(r"[a-zA-Z0-9.-]+", host)
        ):
            raise ValueError(f"Expected a public HTTPS release-note link: {original}")
        env = {"PATH": os.environ["PATH"]}
        routing = []
        if host in {"www.promptfoo.dev", "promptfoo.dev", "github.com"}:
            # These fixed public origins may be reached through the environment's egress proxy.
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
        else:
            # Check and pin the destination for *each* hop, including redirects.
            ips = [
                r[4][0] for r in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
            ]
            if not ips or not all(ipaddress.ip_address(ip).is_global for ip in ips):
                raise ValueError(
                    f"Release-note link does not resolve to a public address: {original}"
                )
            ip = next((ip for ip in ips if ":" not in ip), f"[{ips[0]}]")
            routing = ["--noproxy", "*", "--resolve", f"{host}:443:{ip}"]
        output = subprocess.check_output(
            [
                "curl",
                "--disable",
                "--silent",
                "--show-error",
                "--globoff",
                *routing,
                "--proto",
                "=https",
                "--max-time",
                "12",
                "--max-filesize",
                "5000000",
                "--write-out",
                "\n%{response_code}\n%{redirect_url}",
                "--url",
                url,
            ],
            env=env,
            timeout=15,
        )
        body, status, redirect = output.rsplit(b"\n", 2)
        if status.startswith(b"3") and redirect:
            url = redirect.decode()
            fragment = unquote(urlsplit(url).fragment) or fragment
            continue
        if not status.startswith(b"2"):
            raise ValueError(
                f"Release-note link returned {status.decode()}: {original}"
            )
        if fragment:
            anchors = Page(body.decode(errors="replace")).anchors
            if fragment not in anchors and "user-content-" + fragment not in anchors:
                raise ValueError(f"Missing release-note link anchor: {original}")
        return
    raise ValueError(f"Too many redirects for release-note link: {original}")


def check_links(section, repo, previous_tag, tag, head):
    prefix = f"https://github.com/{repo}/"
    compare = f"{prefix}compare/{previous_tag}...{tag}"
    if f"]({compare})" not in section.splitlines()[0]:
        raise ValueError(f"Expected component comparison {compare}")
    # The new tag does not exist before merge. Validate its base against the actual candidate.
    subprocess.run(
        ["git", "merge-base", "--is-ancestor", "refs/tags/" + previous_tag, head],
        check=True,
    )
    links = rendered_links(section)
    if compare not in links:
        raise ValueError(f"Missing component comparison {compare}")
    citations, commits, outside = {}, [], []
    for url in links.keys() - {compare}:
        path = url[len(prefix) :] if url.startswith(prefix) else ""
        if match := re.fullmatch(r"(issues|pull)/([1-9]\d*)", path):
            citations[url] = match[1], int(match[2])
        elif match := re.fullmatch(r"commit/([0-9a-f]{40})", path):
            sha = match[1]
            subprocess.run(
                ["git", "merge-base", "--is-ancestor", sha, head], check=True
            )
            commits.append(sha)
        else:
            outside.append(url)
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(check_public_url, outside))
    types = issue_types(repo, {n for _, n in citations.values()})
    missing = {
        url: n
        for url, (kind, n) in citations.items()
        if not types[n] or (kind == "pull" and types[n] != "PullRequest")
    }
    if not missing:
        return section
    subjects = (
        subprocess.check_output(
            ["git", "show", "--no-patch", "--format=%H%x09%s", *commits], text=True
        )
        if commits
        else ""
    )
    for url, number in missing.items():
        shas = re.findall(rf"^([0-9a-f]{{40}})\t[^\n]*\(#{number}\)$", subjects, re.M)
        # Only change literal citations with an unambiguous, verified squash commit.
        # If a code sample or prose also quotes the URL, leave that decision to its author.
        candidate = re.compile(re.escape(url) + r"""(?=[\s)>'"]|$)""")
        if len(shas) != 1 or len(candidate.findall(section)) != links[url]:
            raise ValueError(f"Missing {url}; supply a link to the source commit")
        commit = prefix + "commit/" + shas[0]
        section = section.replace(f"[#{number}]({url})", f"[{shas[0][:7]}]({commit})")
        section = candidate.sub(commit, section)
    # Drop duplicate adjacent commit citations in Release Please's generated bullet.
    section = re.sub(
        r"(\(\[[0-9a-f]+\]\(https://github\.com/[^)]+/commit/[0-9a-f]{40}\)\)) \1",
        r"\1",
        section,
    )
    if missing.keys() & rendered_links(section).keys():
        raise ValueError(
            "Could not replace every unavailable PR; use its source commit in the reviewed notes"
        )
    return section
