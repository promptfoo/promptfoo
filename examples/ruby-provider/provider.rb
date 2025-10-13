require 'net/http'
require 'json'
require 'uri'

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
