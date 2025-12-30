require 'json'

# Default assertion function
def get_assert(output, context)
  topic = context['vars']['topic']

  # Check if the output mentions the topic
  if output.downcase.include?(topic.downcase)
    {
      'pass' => true,
      'score' => 1.0,
      'reason' => "Output mentions the topic '#{topic}'"
    }
  else
    {
      'pass' => false,
      'score' => 0.0,
      'reason' => "Output does not mention the topic '#{topic}'"
    }
  end
end

# Custom assertion function
def check_length(output, context)
  min_length = context.fetch('config', {}).fetch('minLength', 20)

  if output.length >= min_length
    {
      'pass' => true,
      'score' => 1.0,
      'reason' => "Output length #{output.length} meets minimum #{min_length}"
    }
  else
    {
      'pass' => false,
      'score' => output.length.to_f / min_length,
      'reason' => "Output length #{output.length} is below minimum #{min_length}"
    }
  end
end
