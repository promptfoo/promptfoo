import base64
import csv
import gzip
import io
import random
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import dataset_gen
from PIL import Image


class DatasetGenerationTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name)
        self.images = struct.pack(">IIII", 2051, 20, 28, 28) + bytes(range(20)) * 784
        self.labels = struct.pack(">II", 2049, 20) + bytes(range(10)) * 2
        self.write_fixture()

    def write_fixture(self):
        (self.path / dataset_gen.IMAGE_FILE).write_bytes(gzip.compress(self.images))
        (self.path / dataset_gen.LABEL_FILE).write_bytes(gzip.compress(self.labels))

    def test_csv_schema_order_unique_samples_and_jpeg_encoding(self):
        output = self.path / "sample.csv"
        random.seed(123)
        state = random.getstate()
        dataset_gen.save_fashion_mnist_sample_to_csv(12, str(output), self.path)
        self.assertEqual(random.getstate(), state)
        with output.open() as file:
            reader = csv.DictReader(file)
            self.assertEqual(reader.fieldnames, ["index", "label", "image_base64"])
            records = list(reader)
        self.assertEqual(len(records), 12)
        self.assertEqual(len({record["index"] for record in records}), 12)
        self.assertEqual(
            [(r["label"], int(r["index"])) for r in records],
            sorted((r["label"], int(r["index"])) for r in records),
        )
        for record in records:
            self.assertEqual(
                record["label"], dataset_gen.CLASS_NAMES[int(record["index"]) % 10]
            )
            with Image.open(
                io.BytesIO(base64.b64decode(record["image_base64"]))
            ) as image:
                self.assertEqual(
                    (image.format, image.mode, image.size), ("JPEG", "L", (28, 28))
                )
        original = output.read_bytes()
        dataset_gen.save_fashion_mnist_sample_to_csv(12, str(output), self.path)
        self.assertEqual(output.read_bytes(), original)

    def test_download_reads_official_idx_files(self):
        fixtures = [
            io.BytesIO(gzip.compress(self.images)),
            io.BytesIO(gzip.compress(self.labels)),
        ]
        with patch(
            "dataset_gen.urllib.request.urlopen", side_effect=fixtures
        ) as request:
            images, labels = dataset_gen.load_dataset()
        self.assertEqual((images, labels), (self.images[16:], self.labels[8:]))
        self.assertEqual(request.call_count, 2)
        self.assertTrue(
            request.call_args_list[0].args[0].endswith(dataset_gen.IMAGE_FILE)
        )

    def test_rejects_truncated_or_mismatched_idx(self):
        for images, labels in [
            (b"short", self.labels),
            (self.images[:-1], self.labels),
            (self.images, self.labels[:-1]),
            (struct.pack(">IIII", 2051, 20, 27, 28) + self.images[16:], self.labels),
            (self.images, self.labels[:8] + b"\xff" * 20),
        ]:
            with self.subTest(images=len(images), labels=len(labels)):
                (self.path / dataset_gen.IMAGE_FILE).write_bytes(gzip.compress(images))
                (self.path / dataset_gen.LABEL_FILE).write_bytes(gzip.compress(labels))
                with self.assertRaises(ValueError):
                    dataset_gen.load_dataset(self.path)

    def test_rejects_invalid_sample_size_without_creating_output(self):
        output = self.path / "sample.csv"
        for size in [-1, 0, 21]:
            with self.subTest(size=size), self.assertRaises(ValueError):
                dataset_gen.save_fashion_mnist_sample_to_csv(
                    size, str(output), self.path
                )
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
