package main

import (
	"encoding/json"
	"fmt"
	"os"
	"plugin"
)

// Function type definitions for the API functions
type ApiFunc func(string, map[string]interface{}, map[string]interface{}) (map[string]interface{}, error)

func main() {
	if len(os.Args) != 4 {
		fmt.Println("Usage: golang_wrapper <script_path> <function_name> <json_args>")
		os.Exit(1)
	}

	scriptPath := os.Args[1]
	// functionName is not used since we always look for "CallApi"
	jsonArgs := os.Args[3]

	// Parse the JSON arguments
	var args []interface{}
	err := json.Unmarshal([]byte(jsonArgs), &args)
	if err != nil {
		fmt.Printf("Error parsing JSON arguments: %v\n", err)
		os.Exit(1)
	}

	// Load the plugin (user's Go script)
	p, err := plugin.Open(scriptPath)
	if err != nil {
		fmt.Printf("Error loading plugin: %v\n", err)
		os.Exit(1)
	}

	// Look up the CallApi function
	symbol, err := p.Lookup("CallApi")
	if err != nil {
		fmt.Printf("Error finding CallApi function: %v\n", err)
		os.Exit(1)
	}

	// Convert the symbol to a function
	callApi, ok := symbol.(func(string, map[string]interface{}, map[string]interface{}) (map[string]interface{}, error))
	if !ok {
		fmt.Println("Invalid CallApi function signature")
		os.Exit(1)
	}

	// Call the function
	result, err := callApi(
		args[0].(string),
		args[1].(map[string]interface{}),
		args[2].(map[string]interface{}),
	)
	if err != nil {
		fmt.Printf("Error calling function: %v\n", err)
		os.Exit(1)
	}

	// Marshal the result to JSON
	jsonResult, err := json.Marshal(result)
	if err != nil {
		fmt.Printf("Error marshaling result to JSON: %v\n", err)
		os.Exit(1)
	}

	// Print the JSON result
	fmt.Println(string(jsonResult))
}
