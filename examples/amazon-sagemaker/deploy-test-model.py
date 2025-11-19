#!/usr/bin/env python3
"""
SageMaker Deployment Helper Script

This script helps deploy a test model on Amazon SageMaker for testing the promptfoo SageMaker provider.
It uses the Hugging Face integration with SageMaker to deploy models.

Prerequisites:
- AWS CLI configured
- Required Python packages: sagemaker, boto3
- SageMaker execution role with appropriate permissions

Usage:
  python deploy-test-model.py --model-id meta-llama/Llama-2-7b-chat-hf --task text-generation

"""

import argparse
import json
import logging
import time
from datetime import datetime

import boto3

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Parse command line arguments
parser = argparse.ArgumentParser(description="Deploy a Hugging Face model to SageMaker")
parser.add_argument(
    "--model-id",
    required=True,
    help="Hugging Face model ID (e.g., meta-llama/Llama-2-7b-chat-hf)",
)
parser.add_argument(
    "--task",
    default="text-generation",
    help="Task of the model (default: text-generation)",
)
parser.add_argument(
    "--instance-type",
    default="ml.g5.2xlarge",
    help="SageMaker instance type (default: ml.g5.2xlarge)",
)
parser.add_argument(
    "--endpoint-name", help="Custom endpoint name (default: based on model name)"
)
parser.add_argument("--region", help="AWS region (default: from AWS CLI configuration)")
parser.add_argument(
    "--role-name",
    help="SageMaker execution IAM role name (if not specified, will try to find one)",
)
args = parser.parse_args()

# Get the AWS region
session = boto3.session.Session()
region = args.region or session.region_name
if not region:
    logger.error("AWS region not specified and not found in AWS CLI configuration")
    exit(1)

# Generate endpoint name if not provided
if not args.endpoint_name:
    # Extract model name from model ID and create a timestamp
    model_name = args.model_id.split("/")[-1].lower()
    timestamp = datetime.now().strftime("%m%d%H%M")
    args.endpoint_name = f"promptfoo-test-{model_name}-{timestamp}"

# Connect to AWS services
iam = boto3.client("iam", region_name=region)
sagemaker_client = boto3.client("sagemaker", region_name=region)


# Find or get SageMaker execution role
def get_sagemaker_role():
    if args.role_name:
        try:
            role = iam.get_role(RoleName=args.role_name)
            return role["Role"]["Arn"]
        except Exception as e:
            logger.error(f"Error getting specified role: {e}")
            exit(1)

    # Try to find a SageMaker execution role
    try:
        roles = iam.list_roles()
        for role in roles["Roles"]:
            if "AmazonSageMaker-ExecutionRole" in role["RoleName"]:
                logger.info(f"Found SageMaker role: {role['RoleName']}")
                return role["Arn"]

        logger.error(
            "No SageMaker execution role found. Please specify a role with --role-name"
        )
        exit(1)
    except Exception as e:
        logger.error(f"Error finding SageMaker role: {e}")
        exit(1)


role_arn = get_sagemaker_role()
logger.info(f"Using role ARN: {role_arn}")

# Create model
try:
    logger.info(f"Creating model: {args.model_id}")

    # HuggingFace Container settings
    # Find the latest container image for the region
    transformers_version = "4.28.1"
    pytorch_version = "2.0.0"
    python_version = "py310"

    hf_container = f"763104351884.dkr.ecr.{region}.amazonaws.com/huggingface-pytorch-tgi:{transformers_version}-transformers{pytorch_version}-cuda11.8-{python_version}"

    # Create model
    model_name = f"promptfoo-test-model-{int(time.time())}"

    # Hub config for text generation interface
    hub_config = {"HF_MODEL_ID": args.model_id, "HF_TASK": args.task}

    # Generation parameters for text generation models
    if args.task == "text-generation":
        hub_config["PARAMETERS"] = {
            "max_new_tokens": 256,
            "temperature": 0.7,
            "return_full_text": False,
        }

    # Create the model
    create_model_response = sagemaker_client.create_model(
        ModelName=model_name,
        PrimaryContainer={
            "Image": hf_container,
            "Environment": {
                "HF_MODEL_ID": args.model_id,
                "HF_TASK": args.task,
                "HF_MODEL_QUANTIZE": "bitsandbytes",  # Optional: for quantization
                "SM_NUM_GPUS": "1",
                "MAX_INPUT_LENGTH": "2048",
                "MAX_TOTAL_TOKENS": "4096",
                "HF_HUB_CONFIG": json.dumps(hub_config),
            },
        },
        ExecutionRoleArn=role_arn,
    )

    logger.info(f"Model created: {model_name}")

    # Create endpoint configuration
    endpoint_config_name = f"{args.endpoint_name}-config"

    logger.info(f"Creating endpoint configuration: {endpoint_config_name}")
    sagemaker_client.create_endpoint_config(
        EndpointConfigName=endpoint_config_name,
        ProductionVariants=[
            {
                "VariantName": "AllTraffic",
                "ModelName": model_name,
                "InstanceType": args.instance_type,
                "InitialInstanceCount": 1,
            }
        ],
    )

    # Create endpoint
    logger.info(
        f"Creating endpoint: {args.endpoint_name} (this will take several minutes)"
    )
    sagemaker_client.create_endpoint(
        EndpointName=args.endpoint_name, EndpointConfigName=endpoint_config_name
    )

    # Wait for endpoint to be in service
    logger.info("Waiting for endpoint to be in service...")

    status = None
    while status != "InService":
        response = sagemaker_client.describe_endpoint(EndpointName=args.endpoint_name)
        status = response["EndpointStatus"]

        if status == "Failed":
            logger.error(
                f"Endpoint creation failed: {response.get('FailureReason', 'Unknown reason')}"
            )
            exit(1)

        if status != "InService":
            logger.info(f"Endpoint status: {status}. Waiting...")
            time.sleep(60)

    logger.info(f"✅ Endpoint {args.endpoint_name} is now InService!")
    logger.info("\nTest with promptfoo using:")
    logger.info(
        f"""
providers:
  - id: sagemaker:{args.task.replace("-", ":")}:{args.endpoint_name}
    config:
      region: {region}
      modelType: {"openai" if "llama" in args.model_id.lower() else "custom"}
      maxTokens: 256
      temperature: 0.7
"""
    )

    logger.info("\nOr use the test script:")
    logger.info(
        f"node test-sagemaker-provider.js --endpoint={args.endpoint_name} --region={region} --model-type={'openai' if 'llama' in args.model_id.lower() else 'custom'}"
    )

    logger.info(
        "\nTo delete this endpoint when done testing (to avoid unnecessary charges):"
    )
    logger.info(
        f"aws sagemaker delete-endpoint --endpoint-name {args.endpoint_name} --region {region}"
    )

except Exception as e:
    logger.error(f"Error deploying model: {e}")
    exit(1)
