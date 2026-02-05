// Echo provider in Go (10.5.1)
//
// Tests that Go provider wrapper works after ESM migration.
// Bug #6506: Go provider wrapper failed in 0.120.0
//
// Go providers must export a CallApi function that takes prompt, options, and context.

package main

import "fmt"

// CallApi is the function called by the promptfoo Go wrapper
// It receives the prompt string, options map, and context map
// Returns a map with "output" key containing the response
func CallApi(prompt string, options map[string]interface{}, context map[string]interface{}) (map[string]interface{}, error) {
	return map[string]interface{}{
		"output": fmt.Sprintf("Go Echo: %s", prompt),
	}, nil
}
