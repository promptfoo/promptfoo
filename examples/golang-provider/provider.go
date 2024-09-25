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

func CallApi(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
	// Get config values
	// someOption := options["config"].(map[string]interface{})["someOption"].(string)

	resp, err := client.CreateChatCompletion(
		context.Background(),
		openai.ChatCompletionRequest{
			Model: openai.GPT4,
			Messages: []openai.ChatCompletionMessage{
				{
					Role:    openai.ChatMessageRoleSystem,
					Content: "You are a marketer working for a startup called Acme.",
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

func SomeOtherFunction(prompt string, options map[string]interface{}, context map[string]interface{}) (map[string]interface{}, error) {
	return CallApi(prompt+"\nWrite in ALL CAPS", options, context)
}

func AsyncProvider(prompt string, options map[string]interface{}, context map[string]interface{}) (map[string]interface{}, error) {
	// In Go, we don't have async/await syntax, but we can use goroutines and channels for concurrency
	// For this example, we'll just call the regular function
	return CallApi(prompt, options, context)
}
