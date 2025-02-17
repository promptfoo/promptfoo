package main

import (
	"fmt"

	"github.com/promptfoo/promptfoo/examples/golang-provider/core"
	"github.com/promptfoo/promptfoo/examples/golang-provider/pkg1"
)

// Initialize OpenAI client
var client = core.NewClient()

// handlePrompt implements the OpenAI API call with temperature control
func handlePrompt(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
	// Get temperature from config, default to pkg1's default if not specified
	temperature := pkg1.GetDefaultTemperature()
	if temp, ok := options["config"].(map[string]interface{})["temperature"].(float64); ok {
		temperature = float32(temp)
	}

	output, err := client.CreateCompletion(prompt, temperature)
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