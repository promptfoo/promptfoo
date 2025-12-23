# Echo provider in Ruby (10.5.2)
#
# Tests that Ruby provider wrapper works after ESM migration.
# Bug #6506: Ruby provider wrapper failed in 0.120.0

require 'json'

def call_api(prompt, options, context)
  {
    output: "Ruby Echo: #{prompt}",
    tokenUsage: {
      total: prompt.length,
      prompt: prompt.length,
      completion: 0
    }
  }
end
