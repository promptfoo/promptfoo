"""
HLE (Humanity's Last Exam) Prompt Generator

This file creates properly formatted prompts for the HLE benchmark.
It handles both multiple choice and exact answer questions, with support for images.
"""

import json


def create_hle_prompt(context):
    """
    Creates a chat message prompt for HLE benchmark questions.

    This function takes HLE dataset variables and formats them into the correct
    chat message structure for different AI models.

    Args:
        context (dict): Contains two keys:
            - 'vars': The question data from HLE dataset
            - 'provider': Information about which AI model is being used

    Returns:
        str: JSON string of chat messages ready to send to the AI model
    """
    # Extract the data we need
    question_data = context["vars"]
    model_info = context["provider"]

    # Step 1: Choose the right instruction format
    instructions = _get_response_instructions(question_data)

    # Step 2: Build the complete question text
    full_question = _build_question_text(question_data)

    # Step 3: Create the chat messages
    messages = _create_chat_messages(instructions, full_question, model_info)

    # Step 4: Add image if present
    if _has_image(question_data):
        image_message = _create_image_message(question_data, model_info)
        messages.append(image_message)

    return json.dumps(messages)


def _get_response_instructions(question_data):
    """
    Returns the appropriate response format instructions based on question type.

    HLE has two types of questions:
    - exactMatch: Questions that need a specific exact answer
    - multipleChoice: Questions with A/B/C/D options
    """
    question_type = question_data.get("answer_type", "multipleChoice")

    if question_type == "exactMatch":
        return """Your response should be in the following format:
Explanation: {your explanation for your final answer}
Exact Answer: {your succinct, final answer}
Confidence: {your confidence score between 0% and 100% for your answer}"""
    else:
        return """Your response should be in the following format:
Explanation: {your explanation for your answer choice}
Answer: {your chosen answer}
Confidence: {your confidence score between 0% and 100% for your answer}"""


def _build_question_text(question_data):
    """
    Builds the complete question text, including multiple choice options if present.
    """
    question_text = question_data["question"]

    # Add multiple choice options if this is a multiple choice question
    choices = question_data.get("choices", [])
    if choices and len(choices) > 0:
        question_text += "\n\nOptions:\n"
        for i, choice in enumerate(choices):
            letter = chr(65 + i)  # A, B, C, D, etc.
            question_text += f"{letter}) {choice}\n"

    return question_text


def _create_chat_messages(instructions, question_text, model_info):
    """
    Creates the basic chat message structure.

    Note: Some OpenAI reasoning models (o1, o3) use 'developer' role instead of 'system'
    """
    model_id = model_info.get("id", "")

    # OpenAI's reasoning models use 'developer' instead of 'system'
    if "o1" in model_id or "o3" in model_id:
        system_role = "developer"
    else:
        system_role = "system"

    return [
        {"role": system_role, "content": instructions},
        {"role": "user", "content": question_text},
    ]


def _has_image(question_data):
    """
    Checks if this question includes an image.
    """
    image_url = question_data.get("image", "")
    return image_url and image_url.strip() and image_url != "null"


def _create_image_message(question_data, model_info):
    """
    Creates an image message in the correct format for the AI model.

    Different AI providers use different image formats:
    - OpenAI: Uses 'image_url' format
    - Anthropic (Claude): Uses 'image' with 'source' format
    """
    image_url = question_data["image"]
    model_id = model_info.get("id", "")

    if "anthropic" in model_id or "claude" in model_id:
        # Claude format: expects base64 data
        return _create_claude_image_message(image_url)
    else:
        # OpenAI format: can handle URLs directly
        return _create_openai_image_message(image_url)


def _create_claude_image_message(image_url):
    """
    Creates image message in Claude/Anthropic format.
    """
    # If it's a data URL (data:image/jpeg;base64,xxxxx), extract just the base64 part
    if image_url.startswith("data:"):
        # Extract media type and base64 data
        header, base64_data = image_url.split(",", 1)
        media_type = header.split(":")[1].split(";")[0]
    else:
        # Assume it's already base64 data
        media_type = "image/jpeg"
        base64_data = image_url

    return {
        "role": "user",
        "content": [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": base64_data,
                },
            }
        ],
    }


def _create_openai_image_message(image_url):
    """
    Creates image message in OpenAI format.
    """
    return {
        "role": "user",
        "content": [{"type": "image_url", "image_url": {"url": image_url}}],
    }
