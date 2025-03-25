# Python Utilities for promptfoo

This directory contains Python utilities and type definitions for working with promptfoo. These files are primarily for internal development and maintenance.

## Files

- `wrapper.py`: Python wrapper for executing Python assertions and scripts
- `wrapper_test.py`: Tests for the Python wrapper
- `pythonUtils.ts`: TypeScript utilities for interfacing with Python
- `schemas.py`: Pydantic models for promptfoo's configuration schema (auto-generated)
- `schema_example.py`: Simplified example demonstrating how to use Python types

## For Maintainers

### Schema Generation

The `schemas.py` file is auto-generated from the JSON schema and should not be edited directly. This file is generated during the build process.

There are two ways to regenerate the Python schema:

#### 1. Using the npm script (recommended)

```bash
# Generate the JSON schema and Python types in one command
npm run pySchema:generate
```

This script does three things:

1. Generates the JSON schema from TypeScript types
2. Uses pipx to run datamodel-code-generator without installing it globally
3. Runs a Python script that improves the class names (making them more descriptive)

#### 2. Manual regeneration

If you need more control over the generation process:

```bash
# First generate the JSON schema
npm run jsonSchema:generate

# Then generate the Python schema
pipx run datamodel-code-generator --input site/static/config-schema.json --input-file-type jsonschema --output src/python/schemas.py

# Then clean up the class names to be more descriptive
python scripts/cleanupPythonSchema.py src/python/schemas.py
```

### Automatic Schema Generation in CI

The GitHub Actions workflow automatically generates and validates both JSON and Python schemas during CI builds. It also runs the cleanup script to improve class names, converting generic names like `Type1` to more descriptive names like `GraderType`.

If your PR changes the schema definitions and you haven't updated the generated files, the CI will fail with a message showing which files need to be updated.

### Schema Class Name Cleanup

The `cleanupPythonSchema.py` script in the scripts directory handles improving the auto-generated class names. It replaces generic names with more descriptive ones according to a mapping defined in the script. If you need to add new mappings, you can edit the `CLASS_RENAME_MAP` dictionary in this script.

### Development Notes

1. Python code in this directory should be compatible with Python 3.7+ and both Pydantic v1 and v2
2. Add tests for any new functionality in `wrapper_test.py`
3. When updating schema types, consider if documentation needs to be updated in `site/docs/python/types.md`

## For Users

User-facing documentation about Python usage in promptfoo is available at:

- [Python in promptfoo](/docs/python/index)
- [Python Types Reference](/docs/python/types)
- [Python Assertions](/docs/configuration/expected-outputs/python)
