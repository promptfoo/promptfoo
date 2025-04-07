# LLMs.txt Plugin for Docusaurus

This plugin generates two files during the build process:

1. `llms-full.txt` - A concatenated file containing all content from all markdown and MDX files in the docs directory, separated by dividers
2. `llms.txt` - A structured index of all documentation pages with titles, paths, and descriptions

These files are primarily intended for LLM-based tools that want to index or search through documentation.

## How it Works

The plugin:

1. Traverses the `/docs` directory to find all `.md` and `.mdx` files
2. Concatenates all file contents into a single file (`llms-full.txt`)
3. Extracts route information from the Docusaurus routes registry
4. Creates a structured markdown file (`llms.txt`) with links to all documentation pages

## Usage

The output files can be found in the root of the build directory after building the site. They can be useful for:

- Training or fine-tuning LLMs on your documentation
- Providing structured knowledge to AI-assisted documentation tools
- Enabling semantic search over your documentation content

## Integration

No configuration is needed - the plugin automatically runs during the build process. 