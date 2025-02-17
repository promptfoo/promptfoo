package core

import (
	"context"
	"fmt"
	"os"

	"github.com/promptfoo/promptfoo/examples/golang-provider/pkg1"
	"github.com/sashabaranov/go-openai"
)

// Client wraps the OpenAI client with our functionality
type Client struct {
	api *openai.Client
}

// NewClient creates a new OpenAI client
func NewClient() *Client {
	return &Client{
		api: openai.NewClient(os.Getenv("OPENAI_API_KEY")),
	}
}

// CreateCompletion generates a completion with reasoning effort control
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