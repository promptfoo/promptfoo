#!/usr/bin/env python3
"""
Create a test prompt in AWS Bedrock Prompt Management for use with promptfoo.

Prerequisites:
  pip install boto3

Usage:
  python create_test_prompt.py

This creates a simple playlist prompt with a {{genre}} and {{number}} variable.
"""

import boto3
import sys

def create_example_prompt():
    """Create a sample prompt in Bedrock Prompt Management."""

    client = boto3.client('bedrock-agent', region_name='us-east-1')

    print("Creating example prompt in Bedrock Prompt Management...")

    try:
        # Create the prompt
        response = client.create_prompt(
            name='PromptfooExamplePlaylist',
            description='Example playlist prompt for promptfoo testing',
            variants=[
                {
                    'name': 'Variant1',
                    'modelId': 'amazon.titan-text-express-v1',
                    'templateType': 'TEXT',
                    'inferenceConfiguration': {
                        'text': {
                            'temperature': 0.7,
                            'maxTokens': 200
                        }
                    },
                    'templateConfiguration': {
                        'text': {
                            'text': 'Create a {{genre}} music playlist with {{number}} songs. List the song titles.'
                        }
                    }
                }
            ]
        )

        prompt_id = response['id']
        prompt_arn = response['arn']

        print(f"\n✅ Successfully created prompt!")
        print(f"   Prompt ID: {prompt_id}")
        print(f"   ARN: {prompt_arn}")

        # Create a version
        print("\nCreating version 1...")
        version_response = client.create_prompt_version(
            promptIdentifier=prompt_id,
            description='Version 1 - Initial release'
        )

        version = version_response['version']
        version_arn = version_response['arn']

        print(f"\n✅ Successfully created version {version}!")
        print(f"   Version ARN: {version_arn}")

        # Update the config file
        print("\n" + "="*60)
        print("Next steps:")
        print("="*60)
        print(f"\n1. Update promptfooconfig.yaml with your prompt ID:")
        print(f"   Replace 'EXAMPLEPROMPT123' with '{prompt_id}'")
        print(f"\n2. Test with DRAFT version:")
        print(f"   prompts:")
        print(f"     - bedrock://{prompt_id}")
        print(f"\n3. Test with version 1:")
        print(f"   prompts:")
        print(f"     - bedrock://{prompt_id}:1")
        print(f"\n4. Run the evaluation:")
        print(f"   npx promptfoo@latest eval")

        return prompt_id

    except client.exceptions.ResourceNotFoundException:
        print("\n❌ Error: Bedrock Prompt Management not available in this region")
        print("   Try a different region like us-east-1 or us-west-2")
        sys.exit(1)

    except client.exceptions.AccessDeniedException:
        print("\n❌ Error: Access denied")
        print("   Ensure your AWS credentials have bedrock:CreatePrompt permission")
        sys.exit(1)

    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    create_example_prompt()
