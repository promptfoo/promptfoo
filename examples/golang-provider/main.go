package main

import (
	"fmt"

	"github.com/promptfoo/promptfoo/examples/golang-provider/core"
	"github.com/promptfoo/promptfoo/examples/golang-provider/pkg1"
)

// Initialize OpenAI client
var client = core.NewClient()

// handlePrompt processes a prompt with configurable reasoning effort.
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
	// Assign our implementation to the wrapper's CallApi function
	CallApi = handlePrompt
}
