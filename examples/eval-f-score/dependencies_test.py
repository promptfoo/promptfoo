"""Offline regressions for the dataset preparation workflow and local file boundaries."""

import csv
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import prepare_data
from datasets import Dataset, DatasetDict, load_dataset_builder
from datasets.download.streaming_download_manager import StreamingDownloadManager


class DatasetDependenciesTest(unittest.TestCase):
    def test_preparation_preserves_sample_labels_and_csv_text(self):
        texts = [
            f'Review {index}: {"positive" if index % 2 else "negative"}, "quoted"\n'
            "multilingual: café 天気"
            for index in range(200)
        ]
        dataset = DatasetDict(
            {
                "test": Dataset.from_dict(
                    {"text": texts, "label": [i % 2 for i in range(200)]}
                )
            }
        )
        with tempfile.TemporaryDirectory() as directory:
            original_directory = Path.cwd()
            try:
                os.chdir(directory)
                with patch.object(
                    prepare_data, "load_dataset", return_value=dataset
                ) as load:
                    prepare_data.prepare_imdb_data()
                load.assert_called_once_with("imdb")
                with Path("imdb_eval_sample.csv").open(
                    encoding="utf-8", newline=""
                ) as stream:
                    reader = csv.DictReader(stream)
                    self.assertEqual(reader.fieldnames, ["text", "sentiment"])
                    rows = list(reader)
            finally:
                os.chdir(original_directory)

        self.assertEqual(len(rows), 100)
        self.assertEqual(len({row["text"] for row in rows}), 100)
        self.assertEqual(
            [row["text"] for row in rows[:3]], [texts[i] for i in [18, 170, 107]]
        )
        for row in rows:
            self.assertIn(row["text"], texts)
            index = texts.index(row["text"])
            self.assertEqual(row["sentiment"], "positive" if index % 2 else "negative")

    def test_folder_metadata_cannot_reference_files_outside_the_dataset(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            images = root / "images"
            images.mkdir()
            safe = images / "safe.png"
            safe.write_bytes(b"public fixture")
            outside = root / "outside.png"
            outside.write_bytes(b"private fixture")

            for index, filename in enumerate(
                ["safe.png", "../outside.png", str(outside), outside.as_uri()]
            ):
                with self.subTest(filename=filename):
                    (images / "metadata.jsonl").write_text(
                        json.dumps({"file_name": filename, "caption": "fixture"})
                        + "\n",
                        encoding="utf-8",
                    )
                    builder = load_dataset_builder(
                        "imagefolder",
                        data_dir=str(images),
                        cache_dir=str(root / f"cache-{index}"),
                    )
                    # Exercise metadata path resolution before image decoding, without Pillow.
                    kwargs = builder._split_generators(StreamingDownloadManager())[
                        0
                    ].gen_kwargs
                    if filename == "safe.png":
                        records = list(builder._generate_examples(**kwargs))
                        self.assertEqual(len(records), 1)
                        self.assertEqual(records[0][1]["image"], str(safe))
                    else:
                        with self.assertRaisesRegex(
                            ValueError, "Invalid metadata file_name"
                        ):
                            list(builder._generate_examples(**kwargs))


if __name__ == "__main__":
    unittest.main()
