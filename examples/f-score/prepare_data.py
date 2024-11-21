from datasets import load_dataset
import pandas as pd

def prepare_imdb_data():
    # Load the IMDB dataset
    print("Loading IMDB dataset...")
    imdb = load_dataset("imdb")
    
    # Convert labels to more readable format
    label_map = {0: "negative", 1: "positive"}
    
    # Create dataframe from test set (we'll use this for zero-shot evaluation)
    eval_df = pd.DataFrame({
        'text': imdb['test']['text'],
        'sentiment': [label_map[label] for label in imdb['test']['label']]
    })
    
    # Take a small sample for evaluation
    eval_sample = eval_df.sample(n=100, random_state=0)
    
    # Save to CSV file
    print("Saving sample to CSV...")
    eval_sample.to_csv('imdb_eval_sample.csv', index=False)
    
    print(f"Saved {len(eval_sample)} examples for evaluation")
    
    # Print some statistics
    print("\nLabel distribution in evaluation set:")
    print(eval_sample['sentiment'].value_counts())
    
    print("\nSample review:")
    print("Text:", eval_sample['text'].iloc[0][:200], "...")
    print("Sentiment:", eval_sample['sentiment'].iloc[0])

if __name__ == "__main__":
    prepare_imdb_data()