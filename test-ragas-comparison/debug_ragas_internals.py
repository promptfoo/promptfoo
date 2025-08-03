#!/usr/bin/env python3
"""
Debug RAGAS internal configuration
"""

import os
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from ragas.metrics import ContextRecall, ContextRelevance, AnswerRelevancy, Faithfulness
from ragas.prompt import PromptMixin
import json

# Set up LLM
api_key = os.environ.get("OPENAI_API_KEY", "dummy-key-for-testing")

llm = ChatOpenAI(
    model="gpt-4o",
    temperature=0,
    api_key=api_key,
    seed=42
)

# Initialize metrics
context_recall = ContextRecall(llm=llm)
context_relevance = ContextRelevance(llm=llm)
answer_relevancy = AnswerRelevancy(llm=llm)
faithfulness = Faithfulness(llm=llm)

print("RAGAS Metric Configuration Debug")
print("=" * 80)

# Check each metric's prompts
for metric_name, metric in [
    ("ContextRecall", context_recall),
    ("ContextRelevance", context_relevance),
    ("AnswerRelevancy", answer_relevancy),
    ("Faithfulness", faithfulness)
]:
    print(f"\n{metric_name}:")
    print("-" * 40)
    
    # Check if metric has prompts
    if hasattr(metric, '__dict__'):
        for attr, value in metric.__dict__.items():
            if 'prompt' in attr.lower() or isinstance(value, PromptMixin):
                print(f"  {attr}: {type(value)}")
                if hasattr(value, 'to_string'):
                    prompt_str = value.to_string()
                    print(f"    Prompt preview: {prompt_str[:200]}...")
                elif hasattr(value, 'instruction'):
                    print(f"    Instruction: {value.instruction[:200]}...")
    
    # Check specific settings
    if hasattr(metric, 'name'):
        print(f"  Metric name: {metric.name}")
    if hasattr(metric, 'evaluation_mode'):
        print(f"  Evaluation mode: {metric.evaluation_mode}")
    if hasattr(metric, '_reproducibility'):
        print(f"  Reproducibility: {metric._reproducibility}")

print("\n\nLLM Configuration:")
print("-" * 40)
print(f"Model: {llm.model_name}")
print(f"Temperature: {llm.temperature}")
print(f"Max tokens: {llm.max_tokens}")
if hasattr(llm, 'model_kwargs'):
    print(f"Model kwargs: {llm.model_kwargs}")