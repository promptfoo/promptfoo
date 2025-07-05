// Package core provides OpenAI API integration with support for reasoning effort control.
package core

import (
	"context"
	"fmt"
	"os"

	"github.com/promptfoo/promptfoo/examples/golang-provider/pkg1"
	"github.com/sashabaranov/go-openai"
)

// Client wraps the OpenAI API client with custom functionality for reasoning control.
// It provides a simplified interface for making chat completion requests with
// configurable reasoning effort levels.
type Client struct {
	api *openai.Client
}

// NewClient creates a new OpenAI client using the API key from OPENAI_API_KEY
// environment variable. Returns a Client configured with default settings.
func NewClient() *Client {
	return &Client{
		api: openai.NewClient(os.Getenv("OPENAI_API_KEY")),
	}
}

// CreateCompletion generates a chat completion with reasoning effort control.
// It takes a prompt string and a reasoningEffort level ("low", "medium", "high")
// and returns the model's response as a string.
//
// The reasoning effort parameter controls how much computation the model spends
// on analyzing and solving the problem. Higher effort may result in more thorough
// or accurate responses at the cost of increased latency.
//
// Returns an error if the API call fails or if the response is invalid.
func (c *Client) CreateCompletion(prompt string, reasoningEffort string) (string, error) {
	resp, err := c.api.CreateChatCompletion(
		context.Background(),
		openai.ChatCompletionRequest{
			Model: pkg1.GetModel(),
			Messages: []openai.ChatCompletionMessage{
				{
					Role:    openai.ChatMessageRoleUser,
					Content: prompt,
				},
			},
			ReasoningEffort: reasoningEffort,
		},
	)

	if err != nil {
		return "", fmt.Errorf("chat completion error: %v", err)
	}

	return resp.Choices[0].Message.Content, nil
}
