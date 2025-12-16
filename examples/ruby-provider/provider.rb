require 'net/http'
require 'json'
require 'uri'

##
# Sends the prompt to OpenAI's chat completion endpoint with a system role of a marketer for "Bananamax" and returns the assistant's output along with token usage and metadata.
# @param [String] prompt - The user-facing prompt to submit to the model.
# @param [Hash] options - Optional settings; may include a 'config' key (Hash) which will be returned under metadata.
# @param [Hash] context - Additional contextual information provided by the caller (preserved but not included in the request body).
# @return [Hash] A hash containing:
#   - 'output' => String: the assistant message content from the first choice.
#   - 'tokenUsage' => Hash or nil: when present, contains 'total', 'prompt', and 'completion' token counts.
#   - 'metadata' => Hash: includes 'config' reflecting options['config'] or an empty hash.
def call_api(prompt, options, context)
  # Get config values
  config = options['config'] || {}

  # Prepare API request
  uri = URI.parse('https://api.openai.com/v1/chat/completions')
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true

  request = Net::HTTP::Post.new(uri.path)
  request['Content-Type'] = 'application/json'
  request['Authorization'] = "Bearer #{ENV['OPENAI_API_KEY']}"

  request.body = JSON.generate({
    'model' => 'gpt-4.1-mini',
    'messages' => [
      {
        'role' => 'system',
        'content' => 'You are a marketer working for a startup called Bananamax.'
      },
      {
        'role' => 'user',
        'content' => prompt
      }
    ]
  })

  # Make API call
  response = http.request(request)
  data = JSON.parse(response.body)

  # Extract token usage information from the response
  token_usage = nil
  if data['usage']
    token_usage = {
      'total' => data['usage']['total_tokens'],
      'prompt' => data['usage']['prompt_tokens'],
      'completion' => data['usage']['completion_tokens']
    }
  end

  {
    'output' => data['choices'][0]['message']['content'],
    'tokenUsage' => token_usage,
    'metadata' => {
      'config' => config
    }
  }
end

##
# Appends an instruction to the prompt to produce an all-caps response and forwards the request to the API.
# @param [String] prompt - The user prompt to send.
# @param [Hash] options - Request options; may include a `config` hash used in returned metadata.
# @param [Hash] context - Additional contextual data passed through to the API call.
# @return [Hash] A hash with keys:
#   - 'output' => the assistant's message content,
#   - 'tokenUsage' => a hash with `total`, `prompt`, and `completion` token counts or `nil`,
#   - 'metadata' => a hash containing the provided `config`.
def some_other_function(prompt, options, context)
  call_api(prompt + "\nWrite in ALL CAPS", options, context)
end

# Example usage when running the script directly
if __FILE__ == $PROGRAM_NAME
  prompt = 'What is the weather in San Francisco?'
  options = { 'config' => { 'optionFromYaml' => 123 } }
  context = { 'vars' => { 'location' => 'San Francisco' } }

  puts JSON.pretty_generate(call_api(prompt, options, context))
end
