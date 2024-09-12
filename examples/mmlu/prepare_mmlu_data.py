import argparse

import pandas as pd
from datasets import load_dataset


def prepare_mmlu_data(
    task: str = "abstract_algebra",
    split: str = "test",
    output_file: str = "mmlu_data.csv",
    sample_size: int = None,
):
    """
    Prepare MMLU data and save it to a CSV file using pandas.
    """
    dataset = load_dataset("cais/mmlu", task, split=split)
    df = pd.DataFrame(dataset)

    if sample_size:
        df = df.sample(n=min(sample_size, len(df)), random_state=42)

    df.to_csv(output_file, index=False)
    print(f"MMLU data has been prepared and saved to {output_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Prepare MMLU data and save it to a CSV file."
    )
    parser.add_argument(
        "--sample", type=int, help="Number of samples to include in the output file."
    )
    args = parser.parse_args()

    prepare_mmlu_data(sample_size=args.sample)
