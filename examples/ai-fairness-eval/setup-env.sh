#!/bin/bash

# Setup environment variables for AI Fairness Evaluation
# This script helps configure the required API keys

echo "🔧 Setting up environment variables for AI Fairness Evaluation"
echo "============================================================"

# Check if .env file exists
if [ -f "../../.env" ]; then
    echo "✅ Loading existing .env file..."
    source ../../.env
else
    echo "📝 Creating new .env file..."
    touch ../../.env
fi

echo ""
echo "This evaluation requires API keys for:"
echo "1. OpenAI (for GPT-4o-mini as judge)"
echo "2. AWS Bedrock (for Llama 4 Scout)"
echo "3. Google (for Gemini 2.5 Flash)"
echo "4. Anthropic (for dataset generation)"
echo ""

# OpenAI API Key
if [ -z "$OPENAI_API_KEY" ]; then
    read -p "Enter your OpenAI API key: " OPENAI_API_KEY
    echo "export OPENAI_API_KEY=$OPENAI_API_KEY" >> ../../.env
fi

# AWS Credentials for Bedrock
if [ -z "$AWS_ACCESS_KEY_ID" ]; then
    echo ""
    echo "AWS Bedrock credentials needed for Llama 4 Scout:"
    read -p "Enter your AWS Access Key ID: " AWS_ACCESS_KEY_ID
    echo "export AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID" >> ../../.env
fi

if [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    read -p "Enter your AWS Secret Access Key: " AWS_SECRET_ACCESS_KEY
    echo "export AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY" >> ../../.env
fi

if [ -z "$AWS_REGION" ]; then
    echo "Llama 4 Scout is available in us-east-1 and us-west-2"
    read -p "Enter AWS Region [us-east-1]: " AWS_REGION
    AWS_REGION=${AWS_REGION:-us-east-1}
    echo "export AWS_REGION=$AWS_REGION" >> ../../.env
fi

# Google API Key
if [ -z "$GOOGLE_API_KEY" ]; then
    echo ""
    read -p "Enter your Google API key for Gemini 2.5 Flash: " GOOGLE_API_KEY
    echo "export GOOGLE_API_KEY=$GOOGLE_API_KEY" >> ../../.env
fi

# Anthropic API Key
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo ""
    read -p "Enter your Anthropic API key (for dataset generation): " ANTHROPIC_API_KEY
    echo "export ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" >> ../../.env
fi

# Export all variables
export OPENAI_API_KEY
export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY
export AWS_REGION
export GOOGLE_API_KEY
export ANTHROPIC_API_KEY

echo ""
echo "✅ Environment variables configured!"
echo ""
echo "To use these variables in your current shell:"
echo "  source ../../.env"
echo ""
echo "Ready to run the evaluation with:"
echo "  npx promptfoo eval" 