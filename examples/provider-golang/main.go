// Package main implements a promptfoo provider that uses OpenAI's API.
// It demonstrates a simple implementation of the provider interface using
// shared code from the core and pkg1 packages.
package main

import (
	"fmt"

	"github.com/promptfoo/promptfoo/examples/golang-provider/core"
	"github.com/promptfoo/promptfoo/examples/golang-provider/pkg1"
)

// client is the shared OpenAI client instance used for all requests.
var client = core.NewClient()

// CallApi is the provider's implementation of promptfoo's API interface.
// It processes prompts with configurable reasoning effort and returns the model's response.
//
// The prompt parameter is the input text to send to the model.
// The options parameter may contain a config map with a "reasoning_effort" key
// that accepts "low", "medium", or "high" values.
//
// Returns a map containing the "output" key with the model's response,
// or an error if the API call fails.
var CallApi func(string, map[string]interface{}, map[string]interface{}) (map[string]interface{}, error)

// handlePrompt processes a prompt with configurable reasoning effort.
// It extracts the reasoning_effort from options (defaulting to pkg1's default)
// and calls the OpenAI API through the core client.
func handlePrompt(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
	reasoningEffort := pkg1.GetDefaultReasoningEffort()
	if val, ok := options["config"].(map[string]interface{})["reasoning_effort"].(string); ok {
		reasoningEffort = val
	}

	output, err := client.CreateCompletion(prompt, reasoningEffort)
	if err != nil {
		return nil, fmt.Errorf("completion error: %v", err)
	}

	return map[string]interface{}{
		"output": output,
	}, nil
}

func init() {
	// Assign our implementation to the wrapper's CallApi function.
	// This makes it available to promptfoo for evaluation.
	CallApi = handlePrompt
}
