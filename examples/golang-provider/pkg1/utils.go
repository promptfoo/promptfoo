package pkg1

// GetDefaultTemperature returns the default temperature for the OpenAI API
func GetDefaultTemperature() float32 {
	return 0.7
}

// GetModel returns the default model to use
func GetModel() string {
	return "gpt-4"
} 