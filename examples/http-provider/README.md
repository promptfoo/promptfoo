# HTTP Provider Example

This example demonstrates how to configure and use HTTP providers with promptfoo to integrate with external API endpoints.

## Quick Start

1. Visit the [HTTP Provider Generator](/http-provider-generator) to automatically generate configurations based on your HTTP endpoint.
2. Enter your request configuration and sample response.
3. Copy the generated configuration to your promptfoo config file.

## Example Configuration

Here's a basic example configuration for an HTTP provider that sends prompts to an API endpoint:

```yaml
providers:
  - id: https://api.example.com/chat
    config:
      method: POST
      headers:
        Content-Type: application/json
      body:
        messages:
          - role: user
            content: '{{prompt}}'
      transformResponse: json.choices[0].message.content
```

## Configuration Options

- `method`: HTTP method (GET, POST, PUT, etc.)
- `headers`: Request headers (Content-Type, Authorization, etc.)
- `body`: Request body (supports template variables like `{{prompt}}`)
- `queryParams`: URL query parameters
- `transformResponse`: JavaScript expression to extract the response

## Usage Steps

1. Copy the example configuration above
2. Modify the configuration for your endpoint:
   - Update the URL
   - Adjust headers (add authentication if needed)
   - Modify the request body structure
   - Update the transformResponse to match your API's response format
3. Test the configuration using the [HTTP Provider Generator](/http-provider-generator)
4. Save the working configuration to your promptfoo config file

## Testing Locally

To test your configuration:

1. Create a promptfooconfig.yaml file with your configuration
2. Run the evaluation:
   ```bash
   promptfoo eval
   ```
3. View the results:
   ```bash
   promptfoo view
   ```

For development and testing, you can use services like [webhook.site](https://webhook.site) to create test endpoints.

For more detailed information, see the [HTTP Provider documentation](/docs/providers/http).
