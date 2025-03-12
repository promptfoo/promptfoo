package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"testing"
)

var (
	errEmptyOutput = errors.New("empty output")
	errInvalidJSON = errors.New("invalid JSON")
)

// Mock function that matches the expected signature
func mockCallApi(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
	return map[string]interface{}{
		"output": prompt,
		"debug": map[string]interface{}{
			"raw_prompt": prompt,
			"options":    options,
			"context":    ctx,
		},
	}, nil
}

func TestMain(m *testing.M) {
	// Replace the real function with mock one
	CallApi = mockCallApi
	os.Exit(m.Run())
}

func runWrapper(t *testing.T, args []string) (map[string]interface{}, error) {
	// Create a command that runs the test binary with the -test.run flag
	cmd := exec.Command(os.Args[0], append([]string{"-test.run=TestHelperProcess", "--"}, args...)...)
	cmd.Env = append(os.Environ(), "GO_WANT_HELPER_PROCESS=1")

	// Capture stdout and stderr
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Run the command
	err := cmd.Run()

	// Get the first line of output (ignore test framework output)
	output := strings.TrimSpace(strings.Split(stdout.String(), "\n")[0])
	errOutput := strings.TrimSpace(stderr.String())

	t.Logf("stdout: %q", output)
	if errOutput != "" {
		t.Logf("stderr: %q", errOutput)
	}

	// Check for expected error cases
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			// Process exited with non-zero status
			if strings.Contains(output, "Error parsing JSON arguments") {
				return nil, errInvalidJSON
			}
			if strings.Contains(output, "Unknown function") {
				return nil, errEmptyOutput
			}
			if strings.Contains(output, "Usage:") || strings.Contains(errOutput, "No command") {
				return nil, errEmptyOutput
			}
			// If we got an exit error but none of the above matched, return errEmptyOutput
			return nil, errEmptyOutput
		}
		return nil, err
	}

	// If output is empty, return error
	if output == "" {
		return nil, errEmptyOutput
	}

	// Parse JSON output
	var result map[string]interface{}
	if err := json.Unmarshal([]byte(output), &result); err != nil {
		return nil, fmt.Errorf("json unmarshal error: %v, raw output: %q", err, output)
	}
	return result, nil
}

// TestHelperProcess is not a real test - it's used to mock the wrapper process
func TestHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_HELPER_PROCESS") != "1" {
		return
	}
	// Find the -- separator
	var args []string
	for i, arg := range os.Args {
		if arg == "--" && i < len(os.Args)-1 {
			args = os.Args[i+1:]
			break
		}
	}
	if len(args) == 0 {
		fmt.Fprintf(os.Stderr, "No command")
		os.Exit(2)
	}

	// Set up os.Args for main()
	os.Args = append([]string{args[0]}, args...)
	main()
}

func TestWrapper(t *testing.T) {
	tests := []struct {
		name    string
		args    []string
		want    string
		wantErr bool
		errType error // Optional: specific error to check for
	}{
		{
			name: "simple string",
			args: []string{"script.go", "call_api", `["hello",{},{}]`},
			want: "hello",
		},
		{
			name: "string with single quotes",
			args: []string{"script.go", "call_api", `["It's working",{},{}]`},
			want: "It's working",
		},
		{
			name: "string with double quotes",
			args: []string{"script.go", "call_api", `["Say \"hello\"",{},{}]`},
			want: `Say "hello"`,
		},
		{
			name: "string with mixed quotes",
			args: []string{"script.go", "call_api", `["It's \"quoted\"",{},{}]`},
			want: `It's "quoted"`,
		},
		{
			name: "with options",
			args: []string{"script.go", "call_api", `["test",{"key":"value"},{}]`},
			want: "test",
		},
		{
			name: "with context",
			args: []string{"script.go", "call_api", `["test",{},{"vars":{"key":"value"}}]`},
			want: "test",
		},
		{
			name: "json message array",
			args: []string{"script.go", "call_api", `["[{\"role\":\"user\",\"content\":\"What's your name?\"}]",{},{}]`},
			want: `[{"role":"user","content":"What's your name?"}]`,
		},
		{
			name: "empty string",
			args: []string{"script.go", "call_api", `["",{},{}]`},
			want: "",
		},
		{
			name: "string with newlines",
			args: []string{"script.go", "call_api", `["hello\nworld",{},{}]`},
			want: "hello\nworld",
		},
		{
			name: "string with unicode",
			args: []string{"script.go", "call_api", `["Hello 世界",{},{}]`},
			want: "Hello 世界",
		},
		{
			name:    "invalid json",
			args:    []string{"script.go", "call_api", `not json`},
			wantErr: true,
			errType: errInvalidJSON,
		},
		{
			name:    "missing args",
			args:    []string{"script.go", "call_api"},
			wantErr: true,
			errType: errEmptyOutput,
		},
		{
			name:    "unknown function",
			args:    []string{"script.go", "unknown_func", `["test",{},{}]`},
			wantErr: true,
			errType: errEmptyOutput,
		},
		{
			name:    "no args",
			args:    []string{},
			wantErr: true,
			errType: errEmptyOutput,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := runWrapper(t, tt.args)

			if tt.wantErr {
				if err == nil {
					t.Errorf("Expected error but got none")
				} else if tt.errType != nil && !errors.Is(err, tt.errType) {
					t.Errorf("Expected error type %v but got %v", tt.errType, err)
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if output, ok := result["output"].(string); !ok || output != tt.want {
				t.Errorf("Got %q, want %q", output, tt.want)
			}

			// Verify debug info is present
			if debug, ok := result["debug"].(map[string]interface{}); !ok {
				t.Error("Missing debug info in response")
			} else {
				if rawPrompt, ok := debug["raw_prompt"].(string); !ok || rawPrompt != tt.want {
					t.Errorf("Debug raw_prompt mismatch. Got %q, want %q", rawPrompt, tt.want)
				}
			}
		})
	}
}
