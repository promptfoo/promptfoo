#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Unicode and encoding test script for persistent Python provider validation
Tests handling of various text encodings, special characters, and international text
"""

import json
import sys
from datetime import datetime

def call_api(prompt, options=None, context=None):
    """Main API function for unicode testing"""
    if options is None:
        options = {}

    prompt_lower = prompt.lower()

    if "process_unicode" in prompt_lower:
        # Extract unicode text from prompt
        import re
        unicode_match = re.search(r'process_unicode:\s*(.+)', prompt)
        if unicode_match:
            unicode_text = unicode_match.group(1).strip()

            # Test various unicode operations
            result = {
                "output": f"Unicode processing completed for: {unicode_text}",
                "original_text": unicode_text,
                "text_length": len(unicode_text),
                "byte_length": len(unicode_text.encode('utf-8')),
                "char_analysis": {
                    "ascii_chars": sum(1 for c in unicode_text if ord(c) < 128),
                    "unicode_chars": sum(1 for c in unicode_text if ord(c) >= 128),
                    "emoji_chars": sum(1 for c in unicode_text if ord(c) > 0x1F000),
                    "special_chars": sum(1 for c in unicode_text if c in "ñáéíóúü")
                },
                "encodings_test": {
                    "utf8_bytes": len(unicode_text.encode('utf-8')),
                    "utf16_bytes": len(unicode_text.encode('utf-16')),
                    "ascii_safe": unicode_text.encode('ascii', errors='ignore').decode('ascii'),
                },
                "transformations": {
                    "uppercase": unicode_text.upper(),
                    "lowercase": unicode_text.lower(),
                    "normalized": unicode_text,  # Could add unicodedata.normalize
                    "reversed": unicode_text[::-1]
                },
                "unicode_test": True
            }

            return result

    elif "handle_special_chars" in prompt_lower:
        # Extract special characters from prompt
        import re
        special_match = re.search(r'handle_special_chars:\s*(.+)', prompt)
        if special_match:
            special_text = special_match.group(1).strip()

            # Test handling of control characters and escape sequences
            result = {
                "output": f"Special characters handled: {repr(special_text)}",
                "original": special_text,
                "repr_form": repr(special_text),
                "escape_analysis": {
                    "has_newlines": '\n' in special_text,
                    "has_tabs": '\t' in special_text,
                    "has_carriage_returns": '\r' in special_text,
                    "has_backslashes": '\\' in special_text,
                    "has_quotes": '"' in special_text or "'" in special_text
                },
                "safe_json": json.dumps(special_text),
                "length": len(special_text),
                "special_chars_test": True
            }

            return result

    elif "binary_data_simulation" in prompt_lower:
        # Handle binary-like data
        import re
        binary_match = re.search(r'binary_data_simulation:\s*(.+)', prompt)
        if binary_match:
            binary_text = binary_match.group(1).strip()

            # Simulate binary data handling
            result = {
                "output": f"Binary data simulation processed: {repr(binary_text)}",
                "original": binary_text,
                "hex_representation": binary_text.encode('utf-8').hex(),
                "bytes_length": len(binary_text.encode('utf-8')),
                "null_bytes": binary_text.count('\x00'),
                "control_chars": sum(1 for c in binary_text if ord(c) < 32),
                "binary_safe": True,
                "encoding_test": {
                    "utf8_safe": True,
                    "ascii_safe": all(ord(c) < 128 for c in binary_text),
                    "latin1_safe": all(ord(c) < 256 for c in binary_text)
                }
            }

            return result

    # Multi-language test
    elif "multilingual" in prompt_lower:
        multilingual_samples = {
            "english": "Hello World",
            "chinese": "你好世界",
            "japanese": "こんにちは世界",
            "korean": "안녕하세요 세계",
            "arabic": "مرحبا بالعالم",
            "russian": "Привет мир",
            "hindi": "नमस्ते दुनिया",
            "emoji": "🌍🌎🌏 Hello World! 👋",
            "mixed": "Hello 世界 🌍 مرحبا мир"
        }

        processed_languages = {}
        for lang, text in multilingual_samples.items():
            processed_languages[lang] = {
                "text": text,
                "length": len(text),
                "byte_length": len(text.encode('utf-8')),
                "char_codes": [ord(c) for c in text[:5]],  # First 5 chars
                "reversed": text[::-1]
            }

        return {
            "output": "Multilingual processing completed",
            "languages_processed": processed_languages,
            "total_languages": len(multilingual_samples),
            "multilingual_test": True
        }

    # Default unicode-aware response
    return {
        "output": f"Unicode-aware processing: {prompt}",
        "prompt_analysis": {
            "length": len(prompt),
            "byte_length": len(prompt.encode('utf-8')),
            "has_unicode": any(ord(c) >= 128 for c in prompt),
            "char_range": {
                "min_ord": min(ord(c) for c in prompt) if prompt else 0,
                "max_ord": max(ord(c) for c in prompt) if prompt else 0
            }
        },
        "unicode_support": True,
        "encoding": "utf-8"
    }

# Test embedding API with unicode
def call_embedding_api(prompt, options=None):
    """Test embedding API with unicode text"""
    # Simple mock embedding that handles unicode
    text_bytes = prompt.encode('utf-8')

    # Generate embedding based on unicode properties
    embedding = []
    for i, byte_val in enumerate(text_bytes[:10]):  # Use first 10 bytes
        embedding.append((byte_val / 255.0) + (i * 0.01))

    # Pad to fixed size
    while len(embedding) < 10:
        embedding.append(0.0)

    return {
        "embedding": embedding,
        "text_analyzed": prompt,
        "unicode_chars": sum(1 for c in prompt if ord(c) >= 128),
        "embedding_dimension": len(embedding),
        "unicode_embedding": True
    }

if __name__ == "__main__":
    # Direct test
    print("Testing unicode_test.py")
    print(json.dumps(call_api("process_unicode: 你好世界 🌍 émojis"), indent=2))
    print(json.dumps(call_api("handle_special_chars: \\n\\t\\r\\\"'"), indent=2))
    print(json.dumps(call_api("multilingual test"), indent=2))