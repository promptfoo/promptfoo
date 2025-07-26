# Website

This website is built using [Docusaurus 2](https://docusaurus.io/), a modern static website generator.

### Installation

```sh
npm install
```

### Local Development

```sh
npm start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

### Build

```sh
npm run build
```

This command generates static content into the `build` directory and can be served using any static content hosting service.

## LLMs.txt Plugin

This website includes a custom Docusaurus plugin that generates two files during the build process:

1. `llms-full.txt` - A concatenated file containing all content from all markdown and MDX files in the docs directory, separated by dividers
2. `llms.txt` - A structured index of all documentation pages with titles, paths, and descriptions

These files are generated to support LLM-based tools that need to analyze or search through the documentation.

### Usage

No additional configuration is needed. The plugin runs automatically during the build process, and the files are created in the root of the build output directory.
