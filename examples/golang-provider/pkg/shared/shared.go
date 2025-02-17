package shared

import (
	"context"
	"fmt"
	"os"

	"github.com/sashabaranov/go-openai"
)

// NewClient creates a new OpenAI client with the given API key
func NewClient() *openai.Client {
	return openai.NewClient(os.Getenv("OPENAI_API_KEY"))
}

// CreateCompletion creates a chat completion with the given prompt
func CreateCompletion(client *openai.Client, prompt string, systemPrompt string) (string, error) {
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
		return "", fmt.Errorf("ChatCompletion error: %v", err)
	}

	return resp.Choices[0].Message.Content, nil
} 