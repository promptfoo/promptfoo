# Unicode Test
# Verifies UTF-8 encoding works correctly across platforms

def call_api(prompt, options, context):
    return {
        "output": f"Echo: {prompt}",
        "emoji": "🚀🎉💯",
        "cjk": "你好世界 こんにちは世界",
        "arabic": "مرحبا بالعالم",
        "accents": "Café résumé naïve Ångström",
        "mixed": "Test 测试 テスト اختبار"
    }
