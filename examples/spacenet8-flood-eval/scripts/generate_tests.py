"""Generate Promptfoo test cases from the locally built SpaceNet dataset."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
DATASET_PATH = ROOT / "dataset.json"


def generate_tests() -> list[dict[str, Any]]:
    if not DATASET_PATH.exists():
        raise RuntimeError("Run python scripts/build_dataset.py before promptfoo eval")

    dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    tests = []
    for index, tile in enumerate(dataset["tiles"], start=1):
        building_flooded = tile["counts"]["building"]["flooded"] > 0
        road_flooded = tile["counts"]["road"]["flooded"] > 0
        tests.append(
            {
                "description": f"{tile['geography']} pair {index} ({tile['tileId']})",
                "metadata": {
                    "buildingFlooded": building_flooded,
                    "collection": tile["collection"],
                    "event": tile["event"],
                    "floodCase": building_flooded or road_flooded,
                    "geography": tile["geography"],
                    "postImageIndex": tile["postImageIndex"],
                    "roadFlooded": road_flooded,
                },
                "vars": {
                    "tile_id": tile["tileId"],
                    "pre_image": f"file://assets/{tile['tileId']}/pre.jpg",
                    "post_image": f"file://assets/{tile['tileId']}/post.jpg",
                },
            }
        )
    return tests
