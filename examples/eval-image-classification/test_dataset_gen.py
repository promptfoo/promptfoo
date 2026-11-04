import base64
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import dataset_gen
import numpy as np
import pandas as pd
from PIL import Image, ImageFile


class DatasetGenerationTest(unittest.TestCase):
    def test_grayscale_jpeg_roundtrip(self) -> None:
        encoded = dataset_gen.image_to_base64(np.full((28, 28), 128, dtype=np.uint8))
        with Image.open(io.BytesIO(base64.b64decode(encoded, validate=True))) as image:
            image.load()
            self.assertEqual(image.format, "JPEG")
            self.assertEqual(image.mode, "L")
            self.assertEqual(image.size, (28, 28))
            self.assertEqual(image.getpixel((14, 14)), 128)

    def test_float_images_cannot_silently_be_saved_as_jpeg(self) -> None:
        with self.assertRaises(OSError):
            dataset_gen.image_to_base64(np.zeros((28, 28), dtype=np.float32))

    def test_csv_contains_labels_and_decodable_images(self) -> None:
        images = np.stack([np.full((28, 28), n, dtype=np.uint8) for n in (0, 128, 255)])
        labels = np.array([0, 1, 9])
        dataset = ((images, labels), (images, labels))
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "samples.csv"
            with patch.object(
                dataset_gen.tf.keras.datasets.fashion_mnist,
                "load_data",
                return_value=dataset,
            ):
                dataset_gen.save_fashion_mnist_sample_to_csv(3, str(output))
            rows = pd.read_csv(output)
        self.assertEqual(list(rows.columns), ["index", "label", "image_base64"])
        self.assertEqual(set(rows["index"]), {0, 1, 2})
        for row in rows.itertuples():
            self.assertEqual(
                row.label, dataset_gen.get_class_names()[labels[row.index]]
            )
            with Image.open(io.BytesIO(base64.b64decode(row.image_base64))) as image:
                image.load()
                self.assertEqual(
                    image.getpixel((14, 14)), int(images[row.index, 14, 14])
                )

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
