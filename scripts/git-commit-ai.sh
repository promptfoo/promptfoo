#!/bin/bash

# Try to load API key from environment or .env file
if [ -z "$OPENAI_API_KEY" ]; then
    # Check for .env file one directory up
    ENV_FILE="../.env"
    if [ -f "$ENV_FILE" ]; then
        # Extract OPENAI_API_KEY from .env file
        OPENAI_API_KEY=$(grep "^OPENAI_API_KEY=" "$ENV_FILE" | cut -d '=' -f2- | sed 's/^["'\'']//' | sed 's/["'\'']$//')
    fi
fi

if [ -z "$OPENAI_API_KEY" ]; then
    echo "Error: OPENAI_API_KEY not found in environment or .env file" >&2
    echo "Set it with: export OPENAI_API_KEY=\"your-key\" or add to ../.env" >&2
    exit 1
fi

# Get git diff (staged first, then unstaged)
DIFF=$(git diff --cached 2>/dev/null)
if [ -z "$DIFF" ]; then
    DIFF=$(git diff 2>/dev/null)
fi

if [ -z "$DIFF" ]; then
    echo "No changes detected. Stage changes with 'git add' or make changes first." >&2
    exit 1
fi

# Limit diff size (o4-mini has 200k context window, but be conservative)
MAX_LENGTH=150000
if [ ${#DIFF} -gt $MAX_LENGTH ]; then
    DIFF="${DIFF:0:$MAX_LENGTH}... (diff truncated)"
fi

# Escape JSON special characters
DIFF=$(echo "$DIFF" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g' | sed 's/\t/\\t/g' | sed 's/\r/\\r/g')

# Create the JSON payload with structured output
PAYLOAD=$(
    cat <<EOF
{
  "model": "o4-mini",
  "messages": [
    {
      "role": "system",
      "content": "You are a git commit message generator. Analyze diffs and generate structured conventional commits."
    },
    {
      "role": "user",
      "content": "Analyze the following git diff and generate a conventional commit message.\\n\\nRules:\\n- Choose the most appropriate type based on the changes\\n- Include scope if it helps clarify the change (e.g., component name, module)\\n- Description should be concise, in present tense, and under 50 characters\\n- Set breaking to true only for breaking changes\\n\\nGit diff:\\n$DIFF"
    }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "conventional_commit",
      "schema": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert"]
          },
          "scope": {
            "type": "string",
            "description": "Optional scope of the change"
          },
          "description": {
            "type": "string",
            "description": "Short description in present tense, max 50 chars"
          },
          "breaking": {
            "type": "boolean",
            "description": "Whether this is a breaking change"
          }
        },
        "required": ["type", "description"],
        "additionalProperties": false
      },
      "strict": true
    }
  },
  "temperature": 0.3,
  "max_tokens": 200
}
EOF
)

# Make the API call
RESPONSE=$(curl -s -X POST https://api.openai.com/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -d "$PAYLOAD")

# Check for curl errors
if [ $? -ne 0 ]; then
    echo "Error: Failed to connect to OpenAI API" >&2
    exit 1
fi

# Check if we got an error instead
if echo "$RESPONSE" | grep -q '"error"'; then
    ERROR=$(echo "$RESPONSE" | grep -o '"message":[^,}]*' | sed 's/"message":"\([^"]*\)".*/\1/')
    echo "OpenAI API error: $ERROR" >&2
    exit 1
fi

# Extract the JSON content and parse it
CONTENT=$(echo "$RESPONSE" | grep -o '"content":[^}]*' | sed 's/"content":"\(.*\)"/\1/' | sed 's/\\"/"/g' | sed 's/\\\\/\\/g')

if [ -z "$CONTENT" ]; then
    echo "Error: No content received from API" >&2
    echo "Response: $RESPONSE" >&2
    exit 1
fi

# Parse the JSON to construct the commit message
# Using a more portable approach with sed
TYPE=$(echo "$CONTENT" | sed -n 's/.*"type":"\([^"]*\)".*/\1/p')
SCOPE=$(echo "$CONTENT" | sed -n 's/.*"scope":"\([^"]*\)".*/\1/p')
DESC=$(echo "$CONTENT" | sed -n 's/.*"description":"\([^"]*\)".*/\1/p')
BREAKING=$(echo "$CONTENT" | grep -o '"breaking":true' | wc -l)

# Build the commit message
MESSAGE="$TYPE"
if [ -n "$SCOPE" ]; then
    MESSAGE="$MESSAGE($SCOPE)"
fi

if [ "$BREAKING" -gt 0 ]; then
    MESSAGE="$MESSAGE!: $DESC"
else
    MESSAGE="$MESSAGE: $DESC"
fi

# Output the message
echo "$MESSAGE"

# Copy to clipboard on macOS
if [ "$(uname)" = "Darwin" ]; then
    echo "$MESSAGE" | pbcopy 2>/dev/null && echo -e "\n✓ Copied to clipboard"
fi
