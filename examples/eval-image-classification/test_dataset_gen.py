import base64
import csv
import gzip
import hashlib
import io
import random
import struct
import tempfile
import unittest
from array import array
from pathlib import Path
from unittest.mock import patch

import dataset_gen
from PIL import Image, ImageFile


class DatasetGenerationTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name)
        self.images = struct.pack(">IIII", 2051, 20, 28, 28) + b"".join(
            bytes([pixel]) * 784 for pixel in range(20)
        )
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
                image.load()
                self.assertEqual(image.getpixel((14, 14)), int(record["index"]))
                self.assertEqual(
                    (image.format, image.mode, image.size), ("JPEG", "L", (28, 28))
                )
        original = output.read_bytes()
        dataset_gen.save_fashion_mnist_sample_to_csv(12, str(output), self.path)
        self.assertEqual(output.read_bytes(), original)

    def test_float_pixels_are_rejected(self):
        with self.assertRaises(ValueError):
            dataset_gen.image_to_base64(array("f", [0.0]) * (28 * 28))

    def test_download_reads_official_idx_files(self):
        fixtures = {
            name: (self.path / name).read_bytes()
            for name in (dataset_gen.IMAGE_FILE, dataset_gen.LABEL_FILE)
        }
        hashes = {
            name: hashlib.sha256(data).hexdigest() for name, data in fixtures.items()
        }
        with (
            patch.dict(dataset_gen.DOWNLOAD_SHA256, hashes),
            patch(
                "dataset_gen.urllib.request.urlopen",
                side_effect=[io.BytesIO(data) for data in fixtures.values()],
            ) as request,
        ):
            images, labels = dataset_gen.load_dataset()
        self.assertEqual((images, labels), (self.images[16:], self.labels[8:]))
        self.assertEqual(request.call_count, 2)
        self.assertTrue(
            request.call_args_list[0].args[0].endswith(dataset_gen.IMAGE_FILE)
        )

    def test_rejects_noncanonical_downloads_before_decompression(self):
        image = (self.path / dataset_gen.IMAGE_FILE).read_bytes()
        label = (self.path / dataset_gen.LABEL_FILE).read_bytes()
        output = self.path / "sample.csv"
        for filename, responses, hashes in [
            (dataset_gen.IMAGE_FILE, [image], {}),
            (
                dataset_gen.LABEL_FILE,
                [image, label],
                {dataset_gen.IMAGE_FILE: hashlib.sha256(image).hexdigest()},
            ),
        ]:
            with (
                self.subTest(filename=filename),
                patch.dict(dataset_gen.DOWNLOAD_SHA256, hashes),
                patch(
                    "dataset_gen.urllib.request.urlopen",
                    side_effect=[io.BytesIO(data) for data in responses],
                ),
                patch("dataset_gen.gzip.decompress", wraps=gzip.decompress) as unpack,
                self.assertRaisesRegex(ValueError, f"SHA-256 mismatch for {filename}"),
            ):
                dataset_gen.save_fashion_mnist_sample_to_csv(1, str(output))
            self.assertEqual(unpack.call_count, len(responses) - 1)
            self.assertFalse(output.exists())

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

    def test_jpeg_comment_after_full_icc_buffer(self) -> None:
        # GHSA-g7cr-3p24-7wf7: writing a comment after ICC data fills the
        # encoder buffer must not write outside that buffer.
        comment = b"C" * 65533
        with Image.new("L", (28, 28), 128) as image:
            for size in range(ImageFile.MAXBLOCK - 40, ImageFile.MAXBLOCK - 30):
                with self.subTest(icc_size=size):
                    profile = b"I" * size
                    output = io.BytesIO()
                    image.save(output, "JPEG", icc_profile=profile, comment=comment)
                    output.seek(0)
                    with Image.open(output) as decoded:
                        decoded.load()
                        self.assertEqual(decoded.info["icc_profile"], profile)
                        self.assertEqual(decoded.info["comment"], comment)
                        self.assertEqual(decoded.getpixel((14, 14)), 128)


if __name__ == "__main__":
    unittest.main()
