package main

import (
	"fmt"

	"github.com/promptfoo/promptfoo/examples/golang-provider/pkg/shared"
)

// Initialize OpenAI client
var client = shared.NewClient()

// handlePrompt implements the OpenAI API call with temperature control
func handlePrompt(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
	// Get temperature from config, default to 0.7 if not specified
	temperature := float32(0.7)
	if temp, ok := options["config"].(map[string]interface{})["temperature"].(float64); ok {
		temperature = float32(temp)
	}

	output, err := shared.CreateCompletion(client, prompt, "", temperature)
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

// defaultCallApi is the function that will be called by the wrapper
func defaultCallApi(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
	// Get config values
	systemPrompt := "You are a technical writer creating documentation."
	if sp, ok := options["config"].(map[string]interface{})["systemPrompt"].(string); ok {
		systemPrompt = sp
	}

	resp, err := client.CreateChatCompletion(
		context.Background(),
		openai.ChatCompletionRequest{
			Model: openai.GPT4,
			Messages: []openai.ChatCompletionMessage{
				{
					Role:    openai.ChatMessageRoleSystem,
					Content: systemPrompt,
				},
				{
					Role:    openai.ChatMessageRoleUser,
					Content: prompt,
				},
			},
		},
	)

	if err != nil {
		return nil, fmt.Errorf("ChatCompletion error: %v", err)
	}

	return map[string]interface{}{
		"output": resp.Choices[0].Message.Content,
	}, nil
}

// call_api is an alternative name that the wrapper might look for
func call_api(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
	return defaultCallApi(prompt, options, ctx)
}

// Variables that will be used by the wrapper
var (
	// Default handler
	CallApi = call_api

	// Technical docs version
	SomeOtherFunction = func(prompt string, options map[string]interface{}, context map[string]interface{}) (map[string]interface{}, error) {
		return call_api(prompt+"\nPlease format this as technical documentation.", options, context)
	}
) 