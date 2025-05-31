# Black Forest Labs FLUX Image Generation Example

This example demonstrates how to use Black Forest Labs' FLUX models for image generation and editing with promptfoo.

## Prerequisites

1. **API Key**: Get your API key from [Black Forest Labs](https://docs.bfl.ml/)
2. **Environment Setup**: Set your API key as an environment variable:

```bash
export BFL_API_KEY=your_api_key_here
```

## Available Models

This example showcases three different FLUX models:

- **flux-pro-1.1**: Latest high-quality text-to-image generation
- **flux-kontext-pro**: Advanced image-to-image editing with context understanding  
- **flux-dev**: Development model with lower costs for testing

## Running the Example

### Basic Text-to-Image Generation

```bash
# Run with default configuration
promptfoo eval

# Run specific tests
promptfoo eval --filter-pattern "Landscape Generation"
```

### Image-to-Image Editing

For image editing tests, you'll need to replace the placeholder base64 strings in `promptfooconfig.yaml` with actual images:

1. Convert your image to base64:
```bash
base64 -i your_image.jpg
```

2. Replace the placeholder `data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...` with your actual base64 string.

3. Run the evaluation:
```bash
promptfoo eval --filter-pattern "Style Transfer"
```

## Configuration Options

The example demonstrates various configuration options:

### Image Generation (flux-pro-1.1)
```yaml
config:
  aspect_ratio: "16:9"        # Image dimensions
  output_format: "jpeg"       # Output format (jpeg/png)
  seed: 42                    # Reproducibility
  prompt_upsampling: true     # Enhance prompt creativity
  safety_tolerance: 2         # Content moderation (0-6)
```

### Image Editing (flux-kontext-pro)
```yaml
config:
  input_image: "{{ input_image }}"  # Base64 encoded input
  output_format: "png"              # Output format
  prompt_upsampling: false          # Preserve original style
  safety_tolerance: 2               # Content moderation
```

## Test Categories

### 1. Text-to-Image Generation
- **Landscape Generation**: Natural scenes with detailed descriptions
- **Portrait Generation**: Professional headshots and character portraits
- **Digital Art Generation**: Stylized artwork and creative compositions

### 2. Image-to-Image Editing
- **Style Transfer**: Convert images to different artistic styles
- **Object Addition**: Add elements while preserving original composition
- **Background Change**: Replace backgrounds while keeping subjects intact

## Prompting Best Practices

### For Text-to-Image (FLUX Pro models)
- Be specific about details you want to see
- Include style descriptors (`photorealistic`, `digital art`, `oil painting`)
- Specify lighting and mood (`dramatic lighting`, `soft natural light`)
- Use descriptive adjectives (`highly detailed`, `vibrant colors`)

**Example:**
```
"A serene mountain lake at sunrise with mist rising from the water, dramatic lighting, photorealistic, highly detailed"
```

### For Image-to-Image (Kontext models)
- Describe specific changes you want to make
- Use "while maintaining" to preserve important elements
- Be explicit about style preservation when needed
- Start with simple edits for better results

**Example:**
```
"Transform to impressionist painting style while maintaining the same composition"
```

## Understanding Results

The evaluation will output markdown-formatted images:
```markdown
![A serene mountain lake at sunrise...](https://generated-image-url.com/image.jpg)
```

## Cost Considerations

Different models have different pricing:
- **flux-dev**: ~$0.02 per image (testing/development)
- **flux-pro-1.1**: ~$0.04 per image (production quality)
- **flux-kontext-pro**: ~$0.05 per image (image editing)

## Troubleshooting

### Common Issues

1. **API Key Not Set**
   ```
   Error: Black Forest Labs API key is not set
   ```
   **Solution**: Ensure `BFL_API_KEY` environment variable is set

2. **Timeout Errors**
   ```
   Error: Polling timed out after 300000ms
   ```
   **Solution**: Increase timeout in config:
   ```yaml
   config:
     max_poll_time_ms: 600000  # 10 minutes
   ```

3. **Invalid Image Format**
   ```
   Error: No image URL found in result
   ```
   **Solution**: Ensure input images are properly base64 encoded with correct MIME type

### Debug Mode

Run with debug output to see detailed API interactions:
```bash
DEBUG=promptfoo* promptfoo eval
```

## Advanced Usage

### Custom Assertions

Add custom assertions to validate specific image properties:

```yaml
assert:
  - type: contains
    value: "!["
    description: "Should generate valid image markdown"
  - type: javascript
    value: |
      (output) => {
        const imageUrl = output.match(/!\[.*?\]\((.*?)\)/)?.[1];
        return imageUrl && imageUrl.startsWith('https://');
      }
    description: "Should contain valid HTTPS image URL"
```

### Batch Processing

Process multiple prompts efficiently:

```yaml
tests:
  - vars:
      prompt: 
        - "Mountain landscape at sunset"
        - "Urban cityscape at night"
        - "Forest path in autumn"
```

## Next Steps

- Explore different FLUX models (`flux-fill-pro`, `flux-canny-pro`, `flux-depth-pro`)
- Integrate with other image providers for comparison
- Set up automated image quality evaluation pipelines
- Create custom image generation workflows

## Resources

- [Black Forest Labs API Documentation](https://docs.bfl.ml/)
- [FLUX Model Information](https://blackforestlabs.ai/)
- [Promptfoo Documentation](https://promptfoo.dev/docs/) 