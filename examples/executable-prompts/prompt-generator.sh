#!/bin/bash

# This script demonstrates how to create executable prompts for promptfoo
# It receives context as JSON in the first argument

CONTEXT=$1

# Parse some values from the context using jq
VARS=$(echo "$CONTEXT" | jq -r '.vars')
PROVIDER_ID=$(echo "$CONTEXT" | jq -r '.provider.id')

# Extract specific vars if they exist
USER_NAME=$(echo "$CONTEXT" | jq -r '.vars.name // "user"')
TASK=$(echo "$CONTEXT" | jq -r '.vars.task // "help with a task"')

# Generate a dynamic prompt based on the context
cat <<EOF
You are a helpful AI assistant.

Current user: ${USER_NAME}
Task requested: ${TASK}

Please provide a detailed and helpful response to assist the user with their task.
Be professional, accurate, and thorough in your response.

Context variables received:
$CONTEXT
EOF
