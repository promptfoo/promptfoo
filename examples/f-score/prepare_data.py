from typing import Dict, List

import pandas as pd
from datasets import Dataset, load_dataset


def prepare_imdb_data() -> None:
    """
    Prepare and sample IMDB dataset for sentiment analysis evaluation.
    Loads data from HuggingFace, converts to DataFrame, and saves a sample to CSV.
    """
    # Load the IMDB dataset
    print("Loading IMDB dataset...")
    imdb: Dataset = load_dataset("imdb")  # type: ignore

    # Convert labels to more readable format
    label_map: Dict[int, str] = {0: "negative", 1: "positive"}

    # Create dataframe from test set (we'll use this for zero-shot evaluation)
    texts: List[str] = imdb["test"]["text"]  # type: ignore
    labels: List[int] = imdb["test"]["label"]  # type: ignore

    eval_df: pd.DataFrame = pd.DataFrame(
        {
            "text": texts,
            "sentiment": [label_map[label] for label in labels],
        }
    )

    # Take a small sample for evaluation
    eval_sample: pd.DataFrame = eval_df.sample(n=100, random_state=0)

    # Save to CSV file
    print("Saving sample to CSV...")
    eval_sample.to_csv("imdb_eval_sample.csv", index=False)

    print(f"Saved {len(eval_sample)} examples for evaluation")

    # Print some statistics
    print("\nLabel distribution in evaluation set:")
    print(eval_sample["sentiment"].value_counts())

    print("\nSample review:")
    print("Text:", eval_sample["text"].iloc[0][:200], "...")
    print("Sentiment:", eval_sample["sentiment"].iloc[0])


if __name__ == "__main__":
    prepare_imdb_data()
