// Package pkg1 provides configuration and utility functions for the OpenAI API client.
package pkg1

// GetDefaultReasoningEffort returns the default reasoning effort setting for the API.
// Valid values are "low", "medium", or "high", controlling how much effort the model
// spends on reasoning through the problem.
func GetDefaultReasoningEffort() string {
	return "medium"
}

// GetModel returns the model identifier to use for API calls.
// Currently uses o3-mini, which is optimized for reasoning tasks.
func GetModel() string {
	return "o3-mini"
}
