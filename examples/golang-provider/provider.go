package main

import (
	"context"
	"fmt"
	"os"

	"github.com/sashabaranov/go-openai"
)

// Initialize OpenAI client
var client *openai.Client

func init() {
	client = openai.NewClient(os.Getenv("OPENAI_API_KEY"))
}

// handlePrompt implements the OpenAI API call with temperature control
func handlePrompt(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
	// Get temperature from config, default to 0.7 if not specified
	temperature := float32(0.7)
	if temp, ok := options["config"].(map[string]interface{})["temperature"].(float64); ok {
		temperature = float32(temp)
	}

	resp, err := client.CreateChatCompletion(
		context.Background(),
		openai.ChatCompletionRequest{
			Model:       openai.GPT4,
			Temperature: temperature,
			Messages: []openai.ChatCompletionMessage{
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

func init() {
	// Assign our implementation to the wrapper's CallApi
	CallApi = handlePrompt
} 