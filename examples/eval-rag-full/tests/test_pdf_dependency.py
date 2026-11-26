"""Check the dependency boundary for the RAG example's PDF reader."""

import unittest
from importlib.metadata import version
from pathlib import Path

from packaging.requirements import Requirement
from packaging.version import Version


class PDFDependencyTest(unittest.TestCase):
    def test_requirements_exclude_affected_pypdf_releases(self) -> None:
        manifest = Path(__file__).resolve().parents[1] / "requirements.txt"
        requirements = (
            Requirement(entry)
            for line in manifest.read_text(encoding="utf-8").splitlines()
            if (entry := line.partition("#")[0].strip())
        )
        (reader,) = [req for req in requirements if req.name.lower() == "pypdf"]
        # The old minimum and the last release affected by GHSA-cggf-277g-3q54
        # and GHSA-5849-834g-hvw5 must both be rejected, even on a fresh CI host.
        for affected in ("6.19.0", "6.21.3"):
            with self.subTest(pypdf=affected):
                self.assertNotIn(affected, reader.specifier)

    def test_loader_suite_uses_a_patched_pypdf(self) -> None:
        self.assertGreaterEqual(Version(version("pypdf")), Version("6.21.4"))
