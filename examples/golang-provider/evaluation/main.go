package main

import (
	"fmt"

	"github.com/promptfoo/promptfoo/examples/golang-provider/core"
	"github.com/promptfoo/promptfoo/examples/golang-provider/pkg1"
)

// Initialize OpenAI client
var client = core.NewClient()

// handlePrompt implements the OpenAI API call with reasoning effort control
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
	// Assign our implementation to the wrapper's CallApi
	CallApi = handlePrompt
}