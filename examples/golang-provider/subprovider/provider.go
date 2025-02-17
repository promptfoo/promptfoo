package main

import (
	"context"
	"fmt"
	"os"

	"github.com/sashabaranov/go-openai"
)

var client *openai.Client

func init() {
	client = openai.NewClient(os.Getenv("OPENAI_API_KEY"))
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