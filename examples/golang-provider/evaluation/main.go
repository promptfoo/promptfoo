// Package main implements a promptfoo provider that uses OpenAI's API with reasoning effort control.
// It provides a CallApi function that can be used by promptfoo to generate responses
// with configurable reasoning levels.
package main

import (
	"fmt"

	"github.com/promptfoo/promptfoo/examples/golang-provider/core"
	"github.com/promptfoo/promptfoo/examples/golang-provider/pkg1"
)

// client is the OpenAI API client instance used for all requests
var client = core.NewClient()

// handlePrompt processes a prompt with configurable reasoning effort.
// It accepts:
//   - prompt: the input text to send to the model
//   - options: configuration map containing reasoning_effort setting
//   - ctx: additional context (currently unused)
//
// Returns a map containing the "output" key with the model's response,
// or an error if the API call fails.
func handlePrompt(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
	// Get reasoning_effort from config, default to pkg1's default if not specified
	reasoningEffort := pkg1.GetDefaultReasoningEffort()
	if mode, ok := options["config"].(map[string]interface{})["reasoning_effort"].(string); ok {
		reasoningEffort = mode
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
