#!/bin/bash

# Create data directory if it doesn't exist
mkdir -p data

# Download the CSV file
echo "Downloading HarmBench behaviors dataset..."
curl -o data/harmbench_behaviors_text_all.csv https://raw.githubusercontent.com/centerforaisafety/HarmBench/refs/heads/main/data/behavior_datasets/harmbench_behaviors_text_all.csv

# Make sure the download was successful
if [ $? -eq 0 ]; then
    echo "Successfully downloaded behaviors dataset to data/harmbench_behaviors_text_all.csv"
else
    echo "Error downloading the file"
    exit 1
fi 