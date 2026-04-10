"""
This script downloads the Fashion MNIST dataset, processes a specified number of samples,
and saves them to a CSV file. Each row in the CSV file contains the original dataset index,
the class label name, and the image encoded as a base64 string.

The Fashion MNIST dataset is a collection of 70,000 grayscale images of 28x28 pixels,
each depicting one of 10 types of clothing. For more information on the dataset, see:
https://www.tensorflow.org/api_docs/python/tf/keras/datasets/fashion_mnist/load_data

Usage:
    python save_fashion_mnist_to_csv.py --num_samples <num_samples> --filename <filename>

Arguments:
    --num_samples: Number of samples to save (default: 100)
    --filename: Output CSV file name (default: fashion_mnist_sample_base64.csv)
"""

import base64
import io
from typing import List

import numpy as np
import pandas as pd
import tensorflow as tf
from PIL import Image

# set np seed for reproducibility
np.random.seed(0)


def get_class_names() -> dict[int, str]:
    """Retrieves the class names for the Fashion MNIST dataset.

    Returns:
        A dictionary mapping class indices to class names.
    """
    return {
        0: "T-shirt/top",
        1: "Trouser",
        2: "Pullover",
        3: "Dress",
        4: "Coat",
        5: "Sandal",
        6: "Shirt",
        7: "Sneaker",
        8: "Bag",
        9: "Ankle boot",
    }


def image_to_base64(image: np.ndarray) -> str:
    """Converts an image to a base64 encoded string.

    Args:
        image: A numpy array representing the image.

    Returns:
        A base64 encoded string of the image.
    """
    buffered = io.BytesIO()
    pil_image = Image.fromarray(image)
    # NOTE: For a dataset with large images, you can resize it here to save
    # costs on the inference side.
    # pil_image = pil_image.resize((32, 32))
    pil_image.save(buffered, format="jpeg")
    return base64.b64encode(buffered.getvalue()).decode("utf-8")


def save_fashion_mnist_sample_to_csv(num_samples: int, filename: str) -> None:
    """Saves a sample of the Fashion MNIST dataset to a CSV file.

    Args:
        num_samples: The number of samples to save.
        filename: The name of the output CSV file.
    """
    # Load the Fashion MNIST dataset
    fashion_mnist = tf.keras.datasets.fashion_mnist
    (train_images, train_labels), _ = fashion_mnist.load_data()

    class_names = get_class_names()

    # Randomly sample indices without replacement
    sample_indices = np.random.choice(len(train_images), num_samples, replace=False)

    # Convert images to base64 and combine with labels and indices
    data: List[List] = []
    for sample_index in sample_indices:
        base64_image = image_to_base64(train_images[sample_index])
        label_index = train_labels[sample_index]
        label_name = class_names[label_index]
        data.append([sample_index, label_name, base64_image])

    pd.DataFrame(data, columns=["index", "label", "image_base64"]).sort_values(
        by=["label", "index"]
    ).to_csv(filename, index=False)
    print(f"CSV file '{filename}' created successfully.")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Save Fashion MNIST samples to a CSV file."
    )
    parser.add_argument(
        "--num_samples", type=int, default=100, help="Number of samples to save"
    )
    parser.add_argument(
        "--filename",
        type=str,
        default="fashion_mnist_sample_base64.csv",
        help="Output CSV file name",
    )

    args = parser.parse_args()

    save_fashion_mnist_sample_to_csv(args.num_samples, args.filename)
