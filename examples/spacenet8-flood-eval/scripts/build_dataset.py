"""Generate the 100-image SpaceNet 8 demo dataset and quicklooks."""

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
TESTS_PATH = ROOT / "tests.generated.json"
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
        "tiles": (
            "0_15_63",
            "0_15_68",
            "0_16_66",
            "0_19_66",
            "0_19_67",
            "0_22_62",
            "0_22_70",
            "0_23_70",
            "0_24_67",
            "0_24_70",
            "0_25_70",
            "0_26_67",
            "0_27_67",
            "0_27_68",
            "0_28_64",
            "0_28_68",
            "0_31_63",
            "0_32_61",
            "0_34_61",
            "0_35_61",
            "0_36_62",
            "0_37_61",
            "0_41_58",
            "0_41_59",
            "0_42_58",
        ),
    },
    {
        "name": "Louisiana-East_Training_Public",
        "slug": "louisiana-east",
        "geography": "Louisiana",
        "event": "August 2021 Hurricane Ida flood",
        "tiles": (
            "0_11_15",
            "0_11_4",
            "0_14_4",
            "0_15_2",
            "0_16_8",
            "0_17_13",
            "0_18_15",
            "0_18_19",
            "0_21_19",
            "0_24_18",
            "0_24_21",
            "2_13_45",
            "2_14_46",
            "2_14_48",
            "2_15_44",
            "2_15_46",
            "2_16_49",
            "2_17_49",
            "2_18_44",
            "2_19_44",
            "2_19_56",
            "2_19_57",
            "2_19_60",
            "2_19_62",
            "2_20_44",
        ),
    },
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


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


def load_mapping(collection: str) -> dict[str, dict[str, str]]:
    filename = f"{collection}_label_image_mapping.csv"
    url = f"{DATASET_ROOT}/{collection}/{filename}"
    data = download(url, CACHE_DIR / "mappings" / filename)
    rows = list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))
    mapping = {row["label"]: row for row in rows}
    if len(mapping) != len(rows):
        raise ValueError(f"Duplicate labels in {filename}")
    return mapping


def validate_mapped_filename(filename: str, tile: str, suffix: str) -> None:
    expected_tail = f"{tile}{suffix}"
    if Path(filename).name != filename or not (
        filename == expected_tail or filename.endswith(f"_{expected_tail}")
    ):
        raise ValueError(f"Unexpected mapped filename for {tile}: {filename}")


def make_specs() -> list[dict[str, Any]]:
    specs = []
    for collection in COLLECTIONS:
        name = collection["name"]
        mapping = load_mapping(name)
        for tile in collection["tiles"]:
            label_file = f"{tile}.geojson"
            row = mapping.get(label_file)
            if row is None:
                raise ValueError(f"Missing {label_file} in the official {name} mapping")
            pre_file = row["pre-event image"]
            post_file = row["post-event image 1"]
            validate_mapped_filename(pre_file, tile, ".tif")
            validate_mapped_filename(post_file, tile, ".tif")
            specs.append(
                {
                    "tileId": f"{collection['slug']}-{tile.replace('_', '-')}",
                    "collection": name,
                    "geography": collection["geography"],
                    "event": collection["event"],
                    "files": {"label": label_file, "pre": pre_file, "post": post_file},
                }
            )
    if len(specs) != 50 or len({spec["tileId"] for spec in specs}) != 50:
        raise ValueError("The frozen sample must contain exactly 50 unique pairs")
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
        data = download(url, CACHE_DIR / spec["tileId"] / f"{kind}{suffix}")
        downloaded[kind] = data
        sources[kind] = {"sha256": sha256(data), "url": url}

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
        "counts": counts,
        "referenceRanges": ranges,
        "source": sources,
    }


def write_json(path: Path, value: Any) -> None:
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(f"{json.dumps(value, indent=2)}\n", encoding="utf-8")
    temporary.replace(path)


def write_outputs(tiles: list[dict[str, Any]]) -> None:
    dataset = {
        "version": 1,
        "dataset": "SpaceNet 8 Flood Detection Challenge",
        "sample": {
            "pairs": len(tiles),
            "images": len(tiles) * 2,
            "design": (
                "Evenly-spaced mapping candidates followed by round-robin "
                "count-range-signature stratification"
            ),
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
    tests = [
        {
            "description": f"{tile['geography']} labeled pair {index} ({tile['tileId']})",
            "metadata": {
                "collection": tile["collection"],
                "event": tile["event"],
                "geography": tile["geography"],
            },
            "vars": {
                "tile_id": tile["tileId"],
                "pre_image": f"file://assets/{tile['tileId']}/pre.jpg",
                "post_image": f"file://assets/{tile['tileId']}/post.jpg",
            },
        }
        for index, tile in enumerate(tiles, start=1)
    ]
    write_json(DATASET_PATH, dataset)
    write_json(TESTS_PATH, tests)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--limit", type=int, default=50, help="number of pairs to build (1-50)"
    )
    parser.add_argument("--workers", type=int, default=12)
    args = parser.parse_args()
    if not 1 <= args.limit <= 50:
        parser.error("--limit must be between 1 and 50")

    specs = make_specs()[: args.limit]
    DATASET_PATH.unlink(missing_ok=True)
    TESTS_PATH.unlink(missing_ok=True)
    if ASSETS_DIR.exists():
        shutil.rmtree(ASSETS_DIR)
    ASSETS_DIR.mkdir()

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        tiles = []
        for completed, tile in enumerate(executor.map(build_tile, specs), start=1):
            tiles.append(tile)
            if completed % 10 == 0 or completed == len(specs):
                print(f"Built {completed}/{len(specs)} image pairs")

    write_outputs(tiles)
    pair_label = "pair" if len(tiles) == 1 else "pairs"
    print(f"Ready: {len(tiles)} {pair_label} / {len(tiles) * 2} images")


if __name__ == "__main__":
    main()
