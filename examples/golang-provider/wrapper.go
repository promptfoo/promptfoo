package main

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
)

// CallApi is the provider's implementation of promptfoo's API interface.
// It processes prompts with configurable reasoning effort and returns the model's response.
//
// The prompt parameter is the input text to send to the model.
// The options parameter may contain a config map with a "reasoning_effort" key
// that accepts "low", "medium", or "high" values.
//
// Returns a map containing the "output" key with the model's response,
// or an error if the API call fails.
type ApiFunc func(string, map[string]interface{}, map[string]interface{}) (map[string]interface{}, error)

// Default implementation that will be replaced by the actual provider
func defaultCallApi(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
	return nil, fmt.Errorf("CallApi not implemented")
}

var CallApi ApiFunc = defaultCallApi

func main() {
	if len(os.Args) != 4 {
		fmt.Println("Usage: golang_wrapper <script_path> <function_name> <json_args>")
		os.Exit(1)
	}

	functionName := os.Args[2]
	jsonArgs := os.Args[3]

	// Parse the JSON arguments
	var args []interface{}
	err := json.Unmarshal([]byte(jsonArgs), &args)
	if err != nil {
		fmt.Printf("Error parsing JSON arguments: %v\n", err)
		os.Exit(1)
	}

	// Get the function by name using reflection
	f := reflect.ValueOf(nil)
	switch functionName {
	case "call_api", "CallApi":
		f = reflect.ValueOf(CallApi)
	default:
		fmt.Printf("Unknown function: %s\n", functionName)
		os.Exit(1)
	}

	// Call the function
	result := f.Call([]reflect.Value{
		reflect.ValueOf(args[0].(string)),
		reflect.ValueOf(args[1]),
		reflect.ValueOf(args[2]),
	})

	// Check for errors
	if !result[1].IsNil() {
		fmt.Printf("Error calling function: %v\n", result[1].Interface())
		os.Exit(1)
	}

	// Marshal the result to JSON
	jsonResult, err := json.Marshal(result[0].Interface())
	if err != nil {
		fmt.Printf("Error marshaling result to JSON: %v\n", err)
		os.Exit(1)
	}

	// Print the JSON result
	fmt.Println(string(jsonResult))
}
