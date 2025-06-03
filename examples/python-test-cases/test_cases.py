import pandas as pd


def generate_simple_tests(config=None):
    """Generate a simple set of test cases with optional configuration."""
    # Default configuration
    default_config = {
        "languages": ["Spanish", "French"],
        "phrases": ["Hello world", "How are you?"],
        "translations": {
            ("Hello world", "Spanish"): "Hola mundo",
            ("Hello world", "French"): "Bonjour le monde",
            ("How are you?", "Spanish"): "¿Cómo estás?",
            ("How are you?", "French"): "Comment allez-vous"
        }
    }
    
    # Merge with provided config
    if config:
        languages = config.get("languages", default_config["languages"])
        phrases = config.get("phrases", default_config["phrases"])
        translations = config.get("translations", default_config["translations"])
    else:
        languages = default_config["languages"]
        phrases = default_config["phrases"]
        translations = default_config["translations"]
    
    test_cases = []
    for phrase in phrases:
        for lang in languages:
            if (phrase, lang) in translations:
                test_case = {
                    "vars": {"text": phrase, "target_language": lang},
                    "assert": [{"type": "contains", "value": translations[(phrase, lang)]}],
                    "description": f"Basic {lang} translation: {phrase}",
                }
                test_cases.append(test_case)
    
    return test_cases


def generate_from_csv(config=None):
    """Generate test cases from a CSV file with configurable options."""
    # Default configuration
    default_data = {
        "source_text": ["Good morning", "Thank you", "Goodbye"],
        "target_language": ["French", "Spanish", "German"],
        "expected_translation": ["Bonjour", "Gracias", "Auf Wiedersehen"],
    }
    
    if config and "csv_file" in config:
        # Load from actual CSV file if specified
        try:
            df = pd.read_csv(config["csv_file"])
        except Exception as e:
            print(f"Warning: Could not load CSV file {config['csv_file']}: {e}")
            print("Using default data instead")
            df = pd.DataFrame(default_data)
    elif config and "data" in config:
        # Use data provided in config
        df = pd.DataFrame(config["data"])
    else:
        # Use default demo data
        df = pd.DataFrame(default_data)
    
    # Apply filters from config
    if config:
        max_cases = config.get("max_cases", len(df))
        df = df.head(max_cases)
        
        # Filter by languages if specified
        if "filter_languages" in config:
            df = df[df["target_language"].isin(config["filter_languages"])]

    test_cases = []
    for _, row in df.iterrows():
        test_case = {
            "vars": {
                "text": row["source_text"],
                "target_language": row["target_language"],
            },
            "assert": [{"type": "contains", "value": row["expected_translation"]}],
            "description": f"Translate '{row['source_text']}' to {row['target_language']}",
        }
        test_cases.append(test_case)

    return test_cases


class TestGenerator:
    @staticmethod
    def generate_systematic_tests(config=None):
        """Generate a systematic set of test cases with configurable phrases and languages."""
        # Default configuration
        default_config = {
            "phrases": ["Hello", "Thank you", "Please"],
            "languages": ["Spanish", "French", "German"],
            "difficulty": "basic"  # basic, intermediate, advanced
        }
        
        # Merge with provided config
        if config:
            phrases = config.get("phrases", default_config["phrases"])
            languages = config.get("languages", default_config["languages"])
            difficulty = config.get("difficulty", default_config["difficulty"])
        else:
            phrases = default_config["phrases"]
            languages = default_config["languages"]
            difficulty = default_config["difficulty"]
        
        # Translation dictionaries based on difficulty level
        basic_expected = {
            ("Hello", "Spanish"): "Hola",
            ("Hello", "French"): "Bonjour",
            ("Hello", "German"): "Hallo",
            ("Thank you", "Spanish"): "Gracias",
            ("Thank you", "French"): "Merci",
            ("Thank you", "German"): "Danke",
            ("Please", "Spanish"): "Por favor",
            ("Please", "French"): "S'il vous plaît",
            ("Please", "German"): "Bitte",
            ("Good morning", "Spanish"): "Buenos días",
            ("Good morning", "French"): "Bonjour",
            ("Good morning", "German"): "Guten Morgen",
            ("How are you?", "Spanish"): "¿Cómo estás?",
            ("How are you?", "French"): "Comment allez-vous?",
            ("How are you?", "German"): "Wie geht es dir?",
        }
        
        intermediate_expected = {
            **basic_expected,
            ("I would like to order", "Spanish"): "Me gustaría pedir",
            ("I would like to order", "French"): "Je voudrais commander",
            ("I would like to order", "German"): "Ich möchte bestellen",
            ("Where is the bathroom?", "Spanish"): "¿Dónde está el baño?",
            ("Where is the bathroom?", "French"): "Où sont les toilettes?",
            ("Where is the bathroom?", "German"): "Wo ist die Toilette?",
        }
        
        # Choose expected translations based on difficulty
        expected = basic_expected if difficulty == "basic" else intermediate_expected

        test_cases = []
        for phrase in phrases:
            for lang in languages:
                if (phrase, lang) in expected:
                    test_case = {
                        "vars": {"text": phrase, "target_language": lang},
                        "assert": [{"type": "contains", "value": expected[(phrase, lang)]}],
                        "description": f"[{difficulty.upper()}] Translate '{phrase}' to {lang}",
                    }
                    test_cases.append(test_case)

        return test_cases
