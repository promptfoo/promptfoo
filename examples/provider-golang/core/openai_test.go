package core

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/sashabaranov/go-openai"
)

func TestCreateCompletion(t *testing.T) {
	for _, effort := range []string{"low", "medium", "high"} {
		t.Run(effort, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var body openai.ChatCompletionRequest
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Errorf("decode request: %v", err)
				}
				if r.Method != http.MethodPost || r.URL.Path != "/chat/completions" || body.Model != "gpt-5-mini" || body.ReasoningEffort != effort {
					t.Errorf("unexpected chat request: %s %s model=%q effort=%q", r.Method, r.URL.Path, body.Model, body.ReasoningEffort)
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"choices":[{"message":{"role":"assistant","content":"Hello"}}]}`))
			}))
			defer server.Close()
			config := openai.DefaultConfig("offline-test-key")
			config.BaseURL = server.URL
			client := &Client{api: openai.NewClientWithConfig(config)}
			output, err := client.CreateCompletion("Say hello", effort)
			if err != nil || output != "Hello" {
				t.Fatalf("output=%q error=%v", output, err)
			}
		})
	}
}

func TestCreateCompletionError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"Unsupported reasoning effort","type":"invalid_request_error"}}`))
	}))
	defer server.Close()
	config := openai.DefaultConfig("offline-test-key")
	config.BaseURL = server.URL
	client := &Client{api: openai.NewClientWithConfig(config)}
	output, err := client.CreateCompletion("Say hello", "invalid")
	if err == nil || !strings.Contains(err.Error(), "Unsupported reasoning effort") || output != "" {
		t.Fatalf("output=%q error=%v", output, err)
	}
}
