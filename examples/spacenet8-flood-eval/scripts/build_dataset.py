"""Download and verify the frozen 100-image SpaceNet 8 demo sample."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
DATASET_PATH = ROOT / "dataset.json"
CACHE_DIR = ROOT / ".cache"
ASSETS_DIR = ROOT / "assets"
ALLOWED_HOST = "spacenet-dataset.s3.amazonaws.com"
ALLOWED_PREFIX = "/spacenet/SN8_floods/"
TILE_ID_PATTERN = re.compile(r"^(germany|louisiana-east)-[0-9-]+$")
TARGET_SIZE = 640
JPEG_QUALITY = 88


def sha256(data: bytes) -> str:
    """Return the lowercase SHA-256 digest for data."""
    return hashlib.sha256(data).hexdigest()


def count_range(count: int) -> str:
    """Map a non-negative feature count to the model output buckets."""
    if count == 0:
        return "0"
    if count <= 10:
        return "1-10"
    if count <= 20:
        return "11-20"
    if count <= 50:
        return "21-50"
    if count <= 100:
        return "51-100"
    return ">100"


def counts_from_label(label: dict[str, Any]) -> dict[str, dict[str, int]]:
    """Count flooded and non-flooded building and road GeoJSON features."""
    counts = {
        "building": {"flooded": 0, "notFlooded": 0, "total": 0},
        "road": {"flooded": 0, "notFlooded": 0, "total": 0},
    }
    for feature in label.get("features", []):
        properties = feature.get("properties") or {}
        kind = "building" if properties.get("building") else None
        if kind is None and properties.get("highway"):
            kind = "road"
        if kind is None:
            continue
        flooded = properties.get("flooded") == "yes"
        counts[kind]["total"] += 1
        counts[kind]["flooded" if flooded else "notFlooded"] += 1
    return counts


def validate_source(url: str) -> str:
    """Validate and return the file extension for an official dataset URL."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.netloc != ALLOWED_HOST:
        raise ValueError(f"Unexpected SpaceNet source host: {url}")
    if not parsed.path.startswith(ALLOWED_PREFIX):
        raise ValueError(f"Unexpected SpaceNet source path: {url}")
    suffix = Path(parsed.path).suffix.lower()
    if suffix not in {".geojson", ".tif"}:
        raise ValueError(f"Unexpected SpaceNet source type: {url}")
    return suffix


def download_and_verify(url: str, expected_hash: str, destination: Path) -> bytes:
    """Download one source with retries, then enforce its frozen hash."""
    if destination.exists():
        data = destination.read_bytes()
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        error: Exception | None = None
        for attempt in range(4):
            try:
                request = urllib.request.Request(
                    url,
                    headers={"User-Agent": "promptfoo-spacenet8-example"},
                )
                with urllib.request.urlopen(request, timeout=180) as response:
                    data = response.read()
                temporary = destination.with_suffix(destination.suffix + ".tmp")
                temporary.write_bytes(data)
                temporary.replace(destination)
                break
            except Exception as caught:  # noqa: BLE001 - retry network failures uniformly
                error = caught
                if attempt == 3:
                    raise RuntimeError(f"Failed to download {url}: {error}") from error
                time.sleep(2**attempt)

    actual_hash = sha256(data)
    if actual_hash != expected_hash:
        raise ValueError(
            f"SHA-256 mismatch for {url}: expected {expected_hash}, got {actual_hash}"
        )
    return data


def make_quicklook(source: bytes, destination: Path) -> None:
    """Create one deterministic model-facing JPEG quicklook."""
    with Image.open(BytesIO(source)) as image:
        quicklook = image.convert("RGB").resize(
            (TARGET_SIZE, TARGET_SIZE), Image.Resampling.LANCZOS
        )
        destination.parent.mkdir(parents=True, exist_ok=True)
        quicklook.save(
            destination,
            format="JPEG",
            quality=JPEG_QUALITY,
            subsampling=0,
            optimize=False,
            progressive=False,
        )


def cache_path(tile_id: str, kind: str, url: str) -> Path:
    suffix = validate_source(url)
    return CACHE_DIR / tile_id / f"{kind}{suffix}"


def build_tile(tile: dict[str, Any]) -> None:
    """Verify one label and create its pre/post quicklooks."""
    tile_id = tile["tileId"]
    if not TILE_ID_PATTERN.fullmatch(tile_id):
        raise ValueError(f"Invalid frozen tile ID: {tile_id}")

    downloaded = {}
    for kind in ("label", "pre", "post"):
        source = tile["source"][kind]
        downloaded[kind] = download_and_verify(
            source["url"], source["sha256"], cache_path(tile_id, kind, source["url"])
        )

    actual_counts = counts_from_label(json.loads(downloaded["label"]))
    if actual_counts != tile["counts"]:
        raise ValueError(f"Frozen label counts changed for {tile_id}")
    actual_ranges = {
        "floodedBuildings": count_range(actual_counts["building"]["flooded"]),
        "floodedRoads": count_range(actual_counts["road"]["flooded"]),
    }
    if actual_ranges != tile["referenceRanges"]:
        raise ValueError(f"Frozen count ranges changed for {tile_id}")

    make_quicklook(downloaded["pre"], ASSETS_DIR / tile_id / "pre.jpg")
    make_quicklook(downloaded["post"], ASSETS_DIR / tile_id / "post.jpg")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=12)
    args = parser.parse_args()

    dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    tiles = dataset.get("tiles")
    if not isinstance(tiles, list) or len(tiles) != 50:
        raise ValueError("dataset.json must contain exactly 50 frozen pairs")
    if len({tile["tileId"] for tile in tiles}) != len(tiles):
        raise ValueError("dataset.json contains duplicate tile IDs")

    if ASSETS_DIR.exists():
        shutil.rmtree(ASSETS_DIR)
    ASSETS_DIR.mkdir()

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(build_tile, tile) for tile in tiles]
        for index, future in enumerate(as_completed(futures), start=1):
            future.result()
            if index % 10 == 0 or index == len(futures):
                print(f"Built {index}/{len(futures)} image pairs")

    print(f"Ready: {len(tiles)} pairs / {len(tiles) * 2} images")


if __name__ == "__main__":
    main()
