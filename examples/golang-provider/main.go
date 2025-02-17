package main

import (
	"fmt"
	"os"

	"github.com/promptfoo/promptfoo/examples/golang-provider/core"
	"github.com/promptfoo/promptfoo/examples/golang-provider/pkg1"
)

func main() {
	client := core.NewClient()
	resp, err := client.CreateCompletion("Hello, world!", pkg1.GetDefaultTemperature())
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(resp)
}
