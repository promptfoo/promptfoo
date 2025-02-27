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
