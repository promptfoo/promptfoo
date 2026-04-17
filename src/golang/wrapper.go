package main

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
)

// Function type definitions for the API functions
type ApiFunc func(string, map[string]interface{}, map[string]interface{}) (map[string]interface{}, error)

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
		// Use the CallApi function defined in the user's code
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
