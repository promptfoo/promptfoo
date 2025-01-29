package main

import (
	"github.com/mdangelo/promptfoo/examples/golang-provider/internal/openai"
)

var client *openai.Client

func init() {
	client = openai.NewClient()
}

func CallApi(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
	output, err := client.GenerateCompletion(prompt)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"output": output,
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
