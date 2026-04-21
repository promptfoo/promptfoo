#!/usr/bin/env ruby

# Ruby executable prompt generator
# Demonstrates template-based prompt generation

require 'json'
require 'erb'

# Parse context from command line
begin
  context = JSON.parse(ARGV[0] || '{}')
rescue JSON::ParserError => e
  STDERR.puts "Error parsing JSON: #{e.message}"
  exit 1
end

vars = context['vars'] || {}
provider = context['provider'] || {}
config = context['config'] || {}

# Define prompt templates using ERB
class PromptGenerator
  attr_accessor :vars, :config, :provider
  
  def initialize(vars, config, provider)
    @vars = vars
    @config = config
    @provider = provider
  end
  
  def generate
    template = if vars['useCase'] == 'customer_service'
      customer_service_template
    elsif vars['useCase'] == 'data_analysis'
      data_analysis_template
    elsif vars['useCase'] == 'creative_writing'
      creative_writing_template
    else
      default_template
    end
    
    ERB.new(template, trim_mode: '-').result(binding)
  end
  
  private
  
  def customer_service_template
    <<~TEMPLATE
      You are a customer service representative for <%= vars['company'] || 'our company' %>.
      
      Customer Profile:
      - Name: <%= vars['customerName'] || 'Valued Customer' %>
      - Issue Type: <%= vars['issueType'] || 'General Inquiry' %>
      - Priority: <%= vars['priority'] || 'Normal' %>
      
      Guidelines:
      - Be empathetic and professional
      - Acknowledge the customer's concerns
      - Provide clear solutions or next steps
      - Follow up appropriately
      
      Customer Message: <%= vars['message'] || 'How can I help you today?' %>
      
      Please respond appropriately to resolve the customer's issue.
    TEMPLATE
  end
  
  def data_analysis_template
    <<~TEMPLATE
      You are a data analyst examining <%= vars['dataType'] || 'business data' %>.
      
      Analysis Parameters:
      - Dataset: <%= vars['dataset'] || 'general dataset' %>
      - Time Period: <%= vars['timePeriod'] || 'last quarter' %>
      - Focus Areas: <%= vars['focusAreas'] || 'key metrics' %>
      
      Required Analysis:
      1. Identify trends and patterns
      2. Highlight anomalies or outliers
      3. Provide actionable insights
      4. Suggest areas for further investigation
      
      <% if vars['specificQuestions'] %>
      Specific Questions to Address:
      <%= vars['specificQuestions'] %>
      <% end %>
      
      Provide a comprehensive analysis with visualizations where appropriate.
    TEMPLATE
  end
  
  def creative_writing_template
    <<~TEMPLATE
      You are a creative writer working on <%= vars['genre'] || 'general fiction' %>.
      
      Writing Parameters:
      - Style: <%= vars['style'] || 'contemporary' %>
      - Tone: <%= vars['tone'] || 'engaging' %>
      - Target Audience: <%= vars['audience'] || 'general readers' %>
      - Length: <%= vars['length'] || 'medium' %>
      
      <% if vars['prompt'] %>
      Writing Prompt: <%= vars['prompt'] %>
      <% end %>
      
      <% if vars['characters'] %>
      Characters: <%= vars['characters'] %>
      <% end %>
      
      <% if vars['setting'] %>
      Setting: <%= vars['setting'] %>
      <% end %>
      
      Create an original, compelling piece that captures the reader's attention.
    TEMPLATE
  end
  
  def default_template
    <<~TEMPLATE
      You are a helpful AI assistant.
      
      Context Information:
      - Provider: <%= provider['id'] || 'default' %>
      - Task: <%= vars['task'] || 'assist the user' %>
      - User: <%= vars['userName'] || 'User' %>
      
      <% if config['temperature'] %>
      Response Style: <%= config['temperature'] > 0.7 ? 'Creative' : 'Focused' %>
      <% end %>
      
      User Request: <%= vars['request'] || 'Please help me with my task.' %>
      
      Please provide a helpful and appropriate response.
    TEMPLATE
  end
end

# Generate and output the prompt
generator = PromptGenerator.new(vars, config, provider)
puts generator.generate