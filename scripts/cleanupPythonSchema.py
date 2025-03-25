#!/usr/bin/env python3
"""
Clean up auto-generated Python schema classes to have more descriptive names.

This script replaces generic names like Type1, Providers1, etc. with
more descriptive names that are easier to understand and use.

Usage:
    python cleanupPythonSchema.py src/python/schemas.py
    python cleanupPythonSchema.py --list-mappings
    python cleanupPythonSchema.py --help
"""

import re
import sys
from pathlib import Path

# Mapping of class names to rename
CLASS_RENAME_MAP = {
    # Provider-related types
    "Providers1": "ProviderConfig",
    "Providers2": "ProviderBaseLabel",
    "Providers3": "ProviderFullConfig",
    
    # Prompt-related types
    "Prompts1": "PromptConfig",
    
    # Assertion/Grader types
    "Type1": "GraderType",
    "Type2": "AssertionMethodEnum", 
    "Type3": "GraderMethodEnum",
    "Type4": "AssertItemMethodEnum",  # Enum of assertion methods used in AssertItem
    "Type5": "AssertItemGraderEnum",  # Enum of grader methods used in AssertItem
    "Type6": "AssertItemMethodEnum2", # Another enum of assertion methods
    "Type7": "AssertItemGraderEnum2", # Another enum of grader methods
    
    # Options and configuration
    "Options1": "TestOptionsConfig",
    
    # Assertion sets
    "Assert1": "AssertionSet",
    "Assert2": "ExtendedAssertionSet",
    
    # Plugins and strategies
    "Plugins1": "PluginConfig",
    "Strategies1": "StrategyConfig",
    
    # Assertion items
    "Items": "AssertionItem",
    
    # Field-related types
    "Field0Model": "AssertionTypeEnumModel",
    "Field0Model1": "MetadataConfig",
    "Field1Model": "TestCaseConfig",
    "Field1": "ProviderLabel",
    "Field2": "ProviderDetails",
    "Field01": "StrategyEnum",
    "Field0": "StrategyField",
    
    # Additional assertion-related types
    "AssertItem1": "BasicAssertionItem",
    "AssertItem2": "ExtendedAssertionItem",
}

def cleanup_schema(file_path):
    """
    Clean up the schema file by replacing generic class names with more descriptive ones.
    
    Args:
        file_path: Path to the schemas.py file
    """
    path = Path(file_path)
    if not path.exists():
        print(f"Error: File {file_path} not found")
        return False
    
    # Read the file content
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Add cleanup comment after timestamp line
    timestamp_pattern = r'(#\s+timestamp:.*?\n)'
    cleanup_comment = r'\1#   name-cleanup: Applied class name improvements\n'
    content = re.sub(timestamp_pattern, cleanup_comment, content)
    
    # Replace class definitions
    for old_name, new_name in CLASS_RENAME_MAP.items():
        content = re.sub(rf"class {old_name}\(", f"class {new_name}(", content)
    
    # Replace references to classes within the code
    for old_name, new_name in CLASS_RENAME_MAP.items():
        # Match variable types like: var: Optional[OldName] = None
        content = re.sub(rf": {old_name}(?=[,\s\]\)])", f": {new_name}", content)
        # Match list types like: var: List[OldName] 
        content = re.sub(rf"\[{old_name}\]", f"[{new_name}]", content)
        # Match other references with word boundaries
        content = re.sub(rf"\b{old_name}\b", new_name, content)
    
    # Write the updated content back to the file
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    
    print(f"Successfully cleaned up schema file: {file_path}")
    print(f"Renamed {len(CLASS_RENAME_MAP)} class names to be more descriptive")
    return True

def list_mappings():
    """Print all current class name mappings in a readable format."""
    print("\nCurrent class name mappings:")
    print("===========================\n")
    
    # Group by category
    categories = {}
    current_category = "Others"
    
    for old_name, new_name in CLASS_RENAME_MAP.items():
        # Use the comment above the category in the dictionary as the category name
        comment_match = None
        lines = CLASS_RENAME_MAP.__str__().split('\n')
        for i, line in enumerate(lines):
            if old_name in line:
                for j in range(i-1, -1, -1):
                    if '#' in lines[j]:
                        comment_match = lines[j].strip().strip('#').strip()
                        break
        
        category = comment_match or current_category
        if category not in categories:
            categories[category] = []
        
        categories[category].append((old_name, new_name))
    
    # Display by category with proper formatting
    for category, mappings in categories.items():
        print(f"{category}:")
        max_old_len = max(len(old) for old, _ in mappings)
        for old, new in mappings:
            print(f"  {old:<{max_old_len+2}} → {new}")
        print()
    
    print(f"Total: {len(CLASS_RENAME_MAP)} class name mappings")

def show_help():
    """Display help information."""
    print(__doc__)
    print("Options:")
    print("  path/to/schemas.py   Process the specified schema file")
    print("  --list-mappings      Display current class name mappings")
    print("  --help               Show this help message")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        show_help()
        sys.exit(1)
        
    arg = sys.argv[1]
    
    if arg == "--help":
        show_help()
        sys.exit(0)
    elif arg == "--list-mappings":
        list_mappings()
        sys.exit(0)
    else:
        # Treat as a file path
        file_path = arg
        success = cleanup_schema(file_path)
        sys.exit(0 if success else 1) 