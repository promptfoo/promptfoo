"""Flask server that interfaces with OpenAI's API for chat completions.

This server accepts POST requests with chat history and returns AI-generated responses
using OpenAI's GPT-4o-mini model.

Running instructions:
    1. Install dependencies:
        pip install flask openai python-dotenv mypy

    2. Create a .env file with your OpenAI API key:
        OPENAI_API_KEY=your-api-key-here

    3. Run the server:
        python app.py
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
import logging
import sys
from typing import Any, Dict, List, Union

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request
from openai import OpenAI

# Configure logging to stdout
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()
logger.info("Environment variables loaded")

app = Flask(__name__)

# Initialize OpenAI client
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")  # Make sure to set this environment variable
)
logger.info("OpenAI client initialized")

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
        logger.info(f"Received chat request from {request.remote_addr}")
        
        # Check for Authorization header
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            logger.warning("Request rejected: Missing authorization header")
            return jsonify({"error": "No authorization header"}), 401
        logger.debug(f"Authorization header present: {auth_header[:15]}...")

        data: Dict[str, Any] = request.json if request.json else {}
        logger.debug(f"Received request data: {data}")

        # Check for required fields
        if "api_provider" not in data:
            logger.warning("Request rejected: Missing api_provider field")
            return jsonify({"error": "Missing required field: api_provider"}), 400
        if "chat_history" not in data:
            logger.warning("Request rejected: Missing chat_history field")
            return jsonify({"error": "Missing required field: chat_history"}), 400

        # Extract chat history from request
        chat_history: List[Dict[str, str]] = data["chat_history"]
        logger.info(f"Processing chat history with {len(chat_history)} messages")

        # Prepare messages for OpenAI
        messages: List[Dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.extend(chat_history)

        # Call OpenAI API
        logger.info(f"Calling OpenAI API with model: gpt-4o-mini")
        response = client.chat.completions.create(
            model="gpt-4o-mini",  # Using the latest GPT-4 model
            messages=messages,
            temperature=0.7,
        )
        logger.info("Received response from OpenAI")
        logger.debug(f"OpenAI response: {response.choices[0].message.content[:50]}...")

        # Add assistant's response to chat history
        messages.append(
            {"role": "assistant", "content": response.choices[0].message.content}
        )

        logger.info("Sending response back to client")
        return jsonify({"chat_history": messages})

    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Set Flask environment to development mode
    os.environ['FLASK_ENV'] = 'development'
    logger.info("Starting Flask server on port 5000 in development mode...")
    app.run(port=5000, debug=True)
