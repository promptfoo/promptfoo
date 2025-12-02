#!/usr/bin/env python3
"""
Promptfoo Python Provider for NAICS Classification Service

This provider wraps the target application for promptfoo red teaming.
"""

import sys
import os
from openai import OpenAI
from target_app import SYSTEM_PROMPT


def call_api(prompt: str, options: dict, context: dict) -> dict:
    """
    Call the NAICS classification service with the given prompt.

    Args:
        prompt: The full user input including business_name and all location fields
        options: Additional options from promptfoo config
        context: Additional context from promptfoo (e.g., vars, test info)

    Returns:
        dict with 'output' key containing the classification result
    """
    try:
        # Get config values if needed
        config = options.get("config", {})
        model = config.get("model", "gpt-4o-mini")

        # Debug: Write to stderr (which promptfoo may display with --verbose)
        print('##################################', file=sys.stderr, flush=True)
        print(f'PROMPT: {prompt}', file=sys.stderr, flush=True)
        print('##################################', file=sys.stderr, flush=True)

        # Call OpenAI directly with the full prompt
        client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ]
        )

        result = response.choices[0].message.content

        return {
            "output": result
        }

    except Exception as e:
        return {
            "error": str(e),
            "output": f'{{"error": "{str(e)}"}}'
        }


if __name__ == "__main__":
    # Example usage for testing the provider directly
    test_prompt = """<business_name>Acme Software Solutions</business_name>
<website_url>https://www.acmesoftware.com</website_url>
<city>San Francisco</city>
<state>CA</state>
<country>USA</country>
<zip>94102</zip>"""
    test_options = {"config": {}}
    test_context = {"vars": {}}

    result = call_api(test_prompt, test_options, test_context)
    print(result)
