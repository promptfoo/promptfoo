"""
Entry point for running promptfoo as a module: python -m promptfoo
"""

import sys

from promptfoo.cli import main

if __name__ == "__main__":
    sys.exit(main())
