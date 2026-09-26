"""Download a deterministic Fashion MNIST sample as a CSV of JPEG images."""

import argparse
import base64
import csv
import gzip
import io
import random
import struct
import urllib.request
from pathlib import Path

from PIL import Image

DATASET_URL = "https://raw.githubusercontent.com/zalandoresearch/fashion-mnist/master/data/fashion/"
IMAGE_FILE = "train-images-idx3-ubyte.gz"
LABEL_FILE = "train-labels-idx1-ubyte.gz"
CLASS_NAMES = (
    "T-shirt/top",
    "Trouser",
    "Pullover",
    "Dress",
    "Coat",
    "Sandal",
    "Shirt",
    "Sneaker",
    "Bag",
    "Ankle boot",
)


def load_dataset(data_dir: Path | None = None) -> tuple[bytes, bytes]:
    """Read the official gzip-compressed IDX images and labels."""

    def read(filename: str) -> bytes:
        if data_dir is not None:
            return gzip.decompress((data_dir / filename).read_bytes())
        with urllib.request.urlopen(DATASET_URL + filename, timeout=60) as response:
            return gzip.decompress(response.read())

    images, labels = read(IMAGE_FILE), read(LABEL_FILE)
    if len(images) < 16 or len(labels) < 8:
        raise ValueError("Fashion MNIST has a truncated IDX header")
    image_magic, count, rows, columns = struct.unpack_from(">IIII", images)
    label_magic, label_count = struct.unpack_from(">II", labels)
    if (image_magic, rows, columns) != (2051, 28, 28) or label_magic != 2049:
        raise ValueError("Expected Fashion MNIST IDX images (28x28) and labels")
    if (
        count != label_count
        or len(images) != 16 + count * 784
        or len(labels) != 8 + count
    ):
        raise ValueError("Fashion MNIST image and label counts do not match their data")
    labels = labels[8:]
    if any(label >= len(CLASS_NAMES) for label in labels):
        raise ValueError("Fashion MNIST contains an unknown class label")
    return images[16:], labels


def image_to_base64(pixels: bytes) -> str:
    """Encode one 28x28 grayscale image as JPEG, matching the eval input format."""
    buffer = io.BytesIO()
    Image.frombytes("L", (28, 28), pixels).save(buffer, format="JPEG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def save_fashion_mnist_sample_to_csv(
    num_samples: int, filename: str, data_dir: Path | None = None
) -> None:
    """Sample without replacement with a local seed, then sort by label/index."""
    if num_samples < 1:
        raise ValueError("num_samples must be positive")
    images, labels = load_dataset(data_dir)
    if num_samples > len(labels):
        raise ValueError(f"num_samples cannot exceed the dataset size ({len(labels)})")
    indices = random.Random(0).sample(range(len(labels)), num_samples)
    indices.sort(key=lambda index: (CLASS_NAMES[labels[index]], index))
    with open(filename, "w", newline="", encoding="utf-8") as output:
        writer = csv.writer(output)
        writer.writerow(["index", "label", "image_base64"])
        for index in indices:
            writer.writerow(
                [
                    index,
                    CLASS_NAMES[labels[index]],
                    image_to_base64(images[index * 784 : (index + 1) * 784]),
                ]
            )
    print(f"CSV file '{filename}' created successfully.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--num_samples", type=int, default=100)
    parser.add_argument("--filename", default="fashion_mnist_sample_base64.csv")
    parser.add_argument(
        "--data-dir",
        type=Path,
        help="Read the two IDX gzip files locally instead of downloading",
    )
    args = parser.parse_args()
    save_fashion_mnist_sample_to_csv(args.num_samples, args.filename, args.data_dir)
