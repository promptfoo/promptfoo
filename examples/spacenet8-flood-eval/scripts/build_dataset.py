"""Build a local SpaceNet 8 evaluation dataset and image quicklooks."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import shutil
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
DATASET_PATH = ROOT / "dataset.json"
CACHE_DIR = ROOT / ".cache"
ASSETS_DIR = ROOT / "assets"
DATASET_ROOT = "https://spacenet-dataset.s3.amazonaws.com/spacenet/SN8_floods"
ALLOWED_HOST = "spacenet-dataset.s3.amazonaws.com"
ALLOWED_PREFIX = "/spacenet/SN8_floods/"
TARGET_SIZE = 640
JPEG_QUALITY = 88

COLLECTIONS = (
    {
        "name": "Germany_Training_Public",
        "slug": "germany",
        "geography": "Germany",
        "event": "July 2021 heavy-rain flood",
    },
    {
        "name": "Louisiana-East_Training_Public",
        "slug": "louisiana-east",
        "geography": "Louisiana",
        "event": "August 2021 Hurricane Ida flood",
    },
)


def count_range(count: int) -> str:
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


def validate_source(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.netloc != ALLOWED_HOST:
        raise ValueError(f"Unexpected SpaceNet source host: {url}")
    if not parsed.path.startswith(ALLOWED_PREFIX):
        raise ValueError(f"Unexpected SpaceNet source path: {url}")
    if Path(parsed.path).suffix.lower() not in {".csv", ".geojson", ".tif"}:
        raise ValueError(f"Unexpected SpaceNet source type: {url}")


def download(url: str, destination: Path) -> bytes:
    validate_source(url)
    if destination.exists():
        return destination.read_bytes()

    destination.parent.mkdir(parents=True, exist_ok=True)
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
            return data
        except Exception as error:  # noqa: BLE001 - retry network failures uniformly
            if attempt == 3:
                raise RuntimeError(f"Failed to download {url}: {error}") from error
            time.sleep(2**attempt)
    raise AssertionError("unreachable")


def load_mapping(collection: str) -> list[dict[str, str]]:
    filename = f"{collection}_label_image_mapping.csv"
    url = f"{DATASET_ROOT}/{collection}/{filename}"
    data = download(url, CACHE_DIR / "mappings" / filename)
    rows = list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))
    if len({row["label"] for row in rows}) != len(rows):
        raise ValueError(f"Duplicate labels in {filename}")
    return rows


def validate_mapped_filename(filename: str, tile: str, suffix: str) -> None:
    expected_tail = f"{tile}{suffix}"
    if Path(filename).name != filename or not (
        filename == expected_tail or filename.endswith(f"_{expected_tail}")
    ):
        raise ValueError(f"Unexpected mapped filename for {tile}: {filename}")


def make_spec(
    collection: dict[str, str], row: dict[str, str], post_image_index: int
) -> dict[str, Any]:
    label_file = row["label"].strip()
    tile = Path(label_file).stem
    tile_parts = tile.split("_")
    if (
        label_file != f"{tile}.geojson"
        or len(tile_parts) != 3
        or not all(part.isdigit() for part in tile_parts)
    ):
        raise ValueError(f"Unexpected mapped label: {label_file}")

    pre_file = row["pre-event image"].strip()
    post_file = row[f"post-event image {post_image_index}"].strip()
    validate_mapped_filename(pre_file, tile, ".tif")
    validate_mapped_filename(post_file, tile, ".tif")

    base_tile_id = f"{collection['slug']}-{tile.replace('_', '-')}"
    tile_id = (
        base_tile_id
        if post_image_index == 1
        else f"{base_tile_id}-post-{post_image_index}"
    )
    return {
        "tileId": tile_id,
        "baseTileId": base_tile_id,
        "collection": collection["name"],
        "geography": collection["geography"],
        "event": collection["event"],
        "postImageIndex": post_image_index,
        "files": {"label": label_file, "pre": pre_file, "post": post_file},
    }


def interleave(groups: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    result = []
    for index in range(max(len(group) for group in groups)):
        for group in groups:
            if index < len(group):
                result.append(group[index])
    return result


def make_specs() -> list[dict[str, Any]]:
    primary_groups = []
    alternates = []
    for collection in COLLECTIONS:
        primary = []
        for row in load_mapping(collection["name"]):
            primary.append(make_spec(collection, row, 1))
            if row.get("post-event image 2", "").strip():
                alternates.append(make_spec(collection, row, 2))
        primary_groups.append(primary)

    specs = interleave(primary_groups) + alternates
    if len({spec["tileId"] for spec in specs}) != len(specs):
        raise ValueError("Official mappings produced duplicate pair IDs")
    return specs


def source_url(spec: dict[str, Any], kind: str) -> str:
    directory = {"label": "annotations", "pre": "PRE-event", "post": "POST-event"}[kind]
    return f"{DATASET_ROOT}/{spec['collection']}/{directory}/{spec['files'][kind]}"


def make_quicklook(source: bytes, destination: Path) -> None:
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


def build_tile(spec: dict[str, Any]) -> dict[str, Any]:
    downloaded = {}
    sources = {}
    for kind, suffix in (("label", ".geojson"), ("pre", ".tif"), ("post", ".tif")):
        url = source_url(spec, kind)
        cache_name = (
            f"post-{spec['postImageIndex']}{suffix}"
            if kind == "post" and spec["postImageIndex"] > 1
            else f"{kind}{suffix}"
        )
        data = download(url, CACHE_DIR / spec["baseTileId"] / cache_name)
        downloaded[kind] = data
        sources[kind] = {"sha256": hashlib.sha256(data).hexdigest(), "url": url}

    counts = counts_from_label(json.loads(downloaded["label"]))
    ranges = {
        "floodedBuildings": count_range(counts["building"]["flooded"]),
        "floodedRoads": count_range(counts["road"]["flooded"]),
    }
    make_quicklook(downloaded["pre"], ASSETS_DIR / spec["tileId"] / "pre.jpg")
    make_quicklook(downloaded["post"], ASSETS_DIR / spec["tileId"] / "post.jpg")
    return {
        "tileId": spec["tileId"],
        "collection": spec["collection"],
        "geography": spec["geography"],
        "event": spec["event"],
        "labelFile": spec["files"]["label"],
        "postImageIndex": spec["postImageIndex"],
        "counts": counts,
        "referenceRanges": ranges,
        "source": sources,
    }


def write_dataset(tiles: list[dict[str, Any]]) -> None:
    dataset = {
        "version": 1,
        "dataset": "SpaceNet 8 Flood Detection Challenge",
        "sample": {
            "pairs": len(tiles),
            "images": len(tiles) * 2,
            "uniqueLabels": len(
                {(tile["collection"], tile["labelFile"]) for tile in tiles}
            ),
            "alternatePostPairs": sum(tile["postImageIndex"] > 1 for tile in tiles),
            "design": "Primary pairs round-robin by collection; alternate post pairs follow",
            "collections": list(dict.fromkeys(tile["collection"] for tile in tiles)),
        },
        "image": {
            "format": "JPEG",
            "quality": JPEG_QUALITY,
            "resampling": "Lanczos",
            "size": [TARGET_SIZE, TARGET_SIZE],
        },
        "license": "CC-BY-SA-4.0",
        "tiles": tiles,
    }
    temporary = DATASET_PATH.with_suffix(".json.tmp")
    temporary.write_text(f"{json.dumps(dataset, indent=2)}\n", encoding="utf-8")
    temporary.replace(DATASET_PATH)


def parse_limit(value: str) -> int | None:
    if value.lower() == "all":
        return None
    try:
        limit = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            "must be a positive integer or 'all'"
        ) from error
    if limit < 1:
        raise argparse.ArgumentTypeError("must be a positive integer or 'all'")
    return limit


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--limit",
        type=parse_limit,
        default=50,
        metavar="N|all",
        help="number of mapped pairs to build (default: 50)",
    )
    parser.add_argument("--workers", type=int, default=12)
    args = parser.parse_args()
    all_specs = make_specs()
    if args.limit is not None and args.limit > len(all_specs):
        parser.error(f"--limit cannot exceed {len(all_specs)}")
    specs = all_specs if args.limit is None else all_specs[: args.limit]
    DATASET_PATH.unlink(missing_ok=True)
    if ASSETS_DIR.exists():
        shutil.rmtree(ASSETS_DIR)
    ASSETS_DIR.mkdir()

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        tiles = []
        for completed, tile in enumerate(executor.map(build_tile, specs), start=1):
            tiles.append(tile)
            if completed % 10 == 0 or completed == len(specs):
                print(f"Built {completed}/{len(specs)} image pairs")

    write_dataset(tiles)
    pair_label = "pair" if len(tiles) == 1 else "pairs"
    print(f"Ready: {len(tiles)} {pair_label} / {len(tiles) * 2} images")


if __name__ == "__main__":
    main()
