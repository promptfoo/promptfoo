// Package provider implements the Go provider example.
package provider

import (
	"fmt"

	"github.com/promptfoo/promptfoo/examples/golang-provider/core"
	"github.com/promptfoo/promptfoo/examples/golang-provider/pkg1"
)

var client = core.NewClient()

// CallApi returns a completion using the optional reasoning_effort setting.
func CallApi(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
	reasoningEffort := pkg1.GetDefaultReasoningEffort()
	if config, ok := options["config"].(map[string]interface{}); ok {
		if val, ok := config["reasoning_effort"].(string); ok {
			reasoningEffort = val
		}
	}

	output, err := client.CreateCompletion(prompt, reasoningEffort)
	if err != nil {
		return nil, fmt.Errorf("completion error: %v", err)
	}

	return map[string]interface{}{
		"output": output,
	}, nil
}
