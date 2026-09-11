// Package pkg1 provides configuration and utility functions for the OpenAI API client.
package pkg1

// GetDefaultReasoningEffort returns the default reasoning effort setting for the API.
// Valid values are "low", "medium", or "high", controlling how much effort the model
// spends on reasoning through the problem.
func GetDefaultReasoningEffort() string {
	return "medium"
}

// GetModel returns the model identifier to use for API calls.
// Uses GPT-5 mini with configurable reasoning effort.
func GetModel() string {
	return "gpt-5-mini"
}
