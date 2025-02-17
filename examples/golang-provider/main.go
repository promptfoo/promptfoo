package main

import (
	"fmt"
	"os"

	"golang-provider/core"
	"golang-provider/pkg1"
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