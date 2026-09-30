// Package evaluation implements the Go provider example.
package evaluation

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
		if mode, ok := config["reasoning_effort"].(string); ok {
			reasoningEffort = mode
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
