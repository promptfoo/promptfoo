"""Check release section links before the tag exists. Only gh api receives a GitHub credential."""

import ipaddress
import json
import os
import re
import socket
import string
import subprocess
from concurrent.futures import ThreadPoolExecutor
from html import unescape
from html.parser import HTMLParser
from typing import NamedTuple
from urllib.parse import quote, unquote, urljoin, urlsplit

# Simple labels used by the optional plain-text preview excerpt. Never use for link validation.
LINK = re.compile(r"\[([^\]\n]*)\]\(([^()\s]+)\)")
SHA = re.compile(r"[0-9a-f]{40}")


ESCAPABLE = frozenset(string.punctuation)
CODE_FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})([^\n]*)$", re.M)


class InlineLink(NamedTuple):
    label_start: int
    label_end: int
    url_start: int
    url_end: int
    url: str


def inline_links(markdown):
    """Read the inline destinations in reviewed Markdown, retaining spans for safe edits."""
    labels = []
    i = 0
    while i < len(markdown):
        char = markdown[i]
        if char == "\\" and markdown[i + 1 : i + 2] in ESCAPABLE:
            i += 2
            continue
        if (i == 0 or markdown[i - 1] == "\n") and (
            fence := CODE_FENCE.match(markdown, i)
        ):
            ticks, info = fence.groups()
            if ticks[0] == "~" or "`" not in info:
                close = re.compile(
                    r"^ {0,3}" + ticks[0] + "{" + str(len(ticks)) + r",}[ \t]*$", re.M
                )
                end = close.search(markdown, fence.end() + 1)
                i = end.end() if end else len(markdown)
                labels.clear()
                continue
        if char == "`":
            end = i + 1
            while markdown[end : end + 1] == "`":
                end += 1
            # A single-line code span is a common place to document expressions
            # such as methods[0](). They are code, not release-note links.
            close = re.compile(r"(?<!`)" + markdown[i:end] + r"(?!`)")
            newline = markdown.find("\n", end)
            end_code = close.search(
                markdown, end, newline if newline >= 0 else len(markdown)
            )
            i = end_code.end() if end_code else end
            continue
        if char == "[":
            labels.append(i + 1)
        if char != "]" or not labels:
            i += 1
            continue
        label = labels.pop()
        if markdown[i + 1 : i + 2] != "(":
            i += 1
            continue
        label_end = i
        i += 2
        while i < len(markdown) and markdown[i].isspace():
            i += 1
        enclosed = markdown[i : i + 1] == "<"
        i += int(enclosed)
        start = i
        depth = 0
        while i < len(markdown):
            char = markdown[i]
            if char == "\\" and markdown[i + 1 : i + 2] in ESCAPABLE:
                i += 2
                continue
            if enclosed:
                if char == ">":
                    break
                if char in "<\n\r":
                    raise ValueError(
                        "Invalid angle-bracketed release-note link destination"
                    )
            elif char == "(":
                depth += 1
            elif char == ")":
                if not depth:
                    break
                depth -= 1
            elif char.isspace():
                break
            i += 1
        end = i
        if depth or (enclosed and markdown[i : i + 1] != ">"):
            raise ValueError("Unclosed release-note link destination")
        i += int(enclosed)
        # A link title can use either quotation mark or a pair of parentheses.
        # Preserve the original title and escape syntax when repairing a destination.
        after_url = i
        while i < len(markdown) and markdown[i].isspace():
            i += 1
        if i > after_url and markdown[i : i + 1] in {'"', "'", "("}:
            close = ")" if markdown[i] == "(" else markdown[i]
            i += 1
            while i < len(markdown) and markdown[i] != close:
                i += (
                    2
                    if markdown[i] == "\\" and markdown[i + 1 : i + 2] in ESCAPABLE
                    else 1
                )
            i += 1
            while i < len(markdown) and markdown[i].isspace():
                i += 1
        if markdown[i : i + 1] != ")" or re.search(
            r"\n[ \t]*\r?\n", markdown[label_end + 2 : i]
        ):
            raise ValueError("Unsupported release-note link destination or title")
        raw = re.sub(
            r"\\([" + re.escape(string.punctuation) + r"])", r"\1", markdown[start:end]
        )
        url = quote(unescape(raw), safe=":/?#[]@!$&'()*+,;=%")
        yield InlineLink(label, label_end, start, end, url)
        i += 1


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
    links = list(inline_links(section))
    urls = {link.url for link in links}
    compare = f"{prefix}compare/{previous_tag}...{tag}"
    if not any(
        link.url == compare and link.url_end <= len(section.splitlines()[0])
        for link in links
    ):
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

    replacements = []
    for link in links:
        if link.url not in issue_urls:
            continue
        kind, number = issue_urls[link.url]
        if types[number] and (kind == "issues" or types[number] == "PullRequest"):
            continue
        sources = fallbacks.get(number, set())
        if len(sources) != 1:
            raise ValueError(f"Missing {link.url}; supply a link to the source commit")
        commit = next(iter(sources))
        replacements.append((link.url_start, link.url_end, commit))
        if section[link.label_start : link.label_end] == f"#{number}":
            replacements.append(
                (link.label_start, link.label_end, commit.rsplit("/", 1)[1][:7])
            )

    # Preserve wrappers, nested labels and titles verbatim on fallback links.
    for start, end, replacement in sorted(replacements, reverse=True):
        section = section[:start] + replacement + section[end:]
    # Generated inventories already carry the verified commit next to the PR.
    return re.sub(
        r"(\(\[[a-f0-9]+\]\(https://github\.com/[^)]+/commit/[0-9a-f]{40}\)\)) \1",
        r"\1",
        section,
    )
