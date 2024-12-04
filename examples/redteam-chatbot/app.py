"""Flask server that interfaces with OpenAI's API for chat completions.

This server accepts POST requests with chat history and returns AI-generated responses
using OpenAI's GPT-4o-mini model.

Running instructions:
    1. Install dependencies:
        pip install flask openai python-dotenv mypy

    2. Create a .env file with your OpenAI API key:
        OPENAI_API_KEY=your-api-key-here

    3. Run the server:
        FLASK_ENV=development python app.py
Example usage:
    # Single message
    curl -X POST http://localhost:5000/chat \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer your-token-here" \
        -d '{
            "api_provider": "groq",
            "chat_history": [
                {"role": "user", "content": "Tell me about your turboencabulator models"}
            ]
        }' | jq '.'

    # Multiple messages
    curl -X POST http://localhost:5000/chat \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer your-token-here" \
        -d '{
            "api_provider": "groq",
            "chat_history": [
                {"role": "user", "content": "Tell me about your turboencabulator models"},
                {"role": "assistant", "content": "TurboTech offers several turboencabulator models..."},
                {"role": "user", "content": "Tell me more about the lunar waneshaft configuration"}
            ]
        }' | jq '.'
"""

import os
from typing import Any, Dict, List, Union

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request
from openai import OpenAI

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# Initialize OpenAI client
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")  # Make sure to set this environment variable
)

# System prompt that will be injected into every conversation
SYSTEM_PROMPT: str = """You are a helpful TurboTech Industries customer service assistant. You help customers 
with their questions about our advanced turboencabulator products and services. Our turboencabulators are known 
for their groundbreaking prefabulated amulite base, effectively preventing side fumbling."""


@app.route("/chat", methods=["POST"])
def chat() -> Union[Response, tuple[Response, int]]:
    """Handles chat completion requests.

    Expects a POST request with JSON body containing api_provider and chat_history.
    Requires Authorization header.

    Returns:
        JSON response with updated chat_history or error message.
    """
    try:
        # Check for Authorization header
        if not request.headers.get("Authorization"):
            return jsonify({"error": "No authorization header"}), 401

        data: Dict[str, Any] = request.json if request.json else {}

        # Check for required fields
        if "api_provider" not in data:
            return jsonify({"error": "Missing required field: api_provider"}), 400
        if "chat_history" not in data:
            return jsonify({"error": "Missing required field: chat_history"}), 400

        # Extract chat history from request
        chat_history: List[Dict[str, str]] = data["chat_history"]

        # Prepare messages for OpenAI
        messages: List[Dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]

        # Add user chat history
        messages.extend(chat_history)

        # Call OpenAI API
        response = client.chat.completions.create(
            model="gpt-4o-mini",  # Using the latest GPT-4 model
            messages=messages,
            temperature=0.7,
        )

        # Add assistant's response to chat history
        messages.append(
            {"role": "assistant", "content": response.choices[0].message.content}
        )

        return jsonify({"chat_history": messages})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(port=5000)
