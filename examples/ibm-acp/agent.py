import asyncio
import os
from collections.abc import AsyncGenerator

import openai
from acp_sdk.models import Message
from acp_sdk.server import Context, RunYield, RunYieldResume, Server

# Initialize OpenAI async client using environment variable API key
client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Create ACP server instance to register agents
server = Server()

# Helper function to call OpenAI API with given prompt and token limit
async def call_openai(prompt, max_tokens=1000):
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=max_tokens
        )
        return response.choices[0].message.content  # Return generated text
    except Exception as e:
        print(f"[OpenAI API error]: {type(e).__name__}: {e}")
        return "[Error: Failed to generate content]"

# Agent: Generates book outline based on title
@server.agent()
async def outline(input: list[Message], context: Context) -> AsyncGenerator[RunYield, RunYieldResume]:
    title = input[0].parts[0].content  # Extract title from input
    prompt = f"Create a detailed book outline with chapters and sections for the book titled '{title}'."
    outline_text = await call_openai(prompt)  # Get outline from OpenAI
    yield Message(parts=[{"content": outline_text, "content_type": "text/plain"}])

# Agent: Generates full chapter text (~3000 words) from chapter summary
@server.agent()
async def chapter(input: list[Message], context: Context) -> AsyncGenerator[RunYield, RunYieldResume]:
    chapter_summary = input[0].parts[0].content  # Extract chapter summary
    prompt = f"Write a full book chapter (~3000 words) based on this summary:\n{chapter_summary}"
    chapter_text = await call_openai(prompt, max_tokens=3000)  # Get chapter draft
    yield Message(parts=[{"content": chapter_text, "content_type": "text/plain"}])

# Agent: Edits chapter text for clarity, style, and coherence
@server.agent()
async def editor(input: list[Message], context: Context) -> AsyncGenerator[RunYield, RunYieldResume]:
    raw_text = input[0].parts[0].content  # Extract raw chapter text
    prompt = f"Please edit and polish the following chapter for clarity, style, and coherence:\n\n{raw_text}"
    edited_text = await call_openai(prompt, max_tokens=3000)  # Get edited version
    yield Message(parts=[{"content": edited_text, "content_type": "text/plain"}])

# Agent: Compiles all parts (outline + chapters) into one full text
@server.agent()
async def compiler(input: list[Message], context: Context) -> AsyncGenerator[RunYield, RunYieldResume]:
    compiled = "\n\n".join(msg.parts[0].content for msg in input)  # Concatenate all inputs
    yield Message(parts=[{"content": compiled, "content_type": "text/plain"}])

# Run the ACP server to start serving agent endpoints
server.run()