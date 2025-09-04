#!/bin/bash

# MCP Server Testing Script
# This script helps you run various MCP server tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_color() {
    echo -e "${2}${1}${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
print_color "Checking prerequisites..." "$YELLOW"

if ! command_exists npx; then
    print_color "Error: npm/npx not found. Please install Node.js" "$RED"
    exit 1
fi

if ! command_exists promptfoo; then
    print_color "Promptfoo not found. Installing..." "$YELLOW"
    npm install -g promptfoo@latest
fi

# Check for .env file
if [ ! -f .env ]; then
    print_color "Warning: .env file not found. Creating template..." "$YELLOW"
    cat > .env << 'EOF'
# MCP Server Configuration
MCP_API_KEY=your-mcp-api-key
MCP_AUTH_TOKEN=your-bearer-token
MCP_SERVER_URL=https://your-mcp-server-url.com/mcp

# K8s MCP Server (if different)
K8S_MCP_SERVER_URL=https://your-k8s-mcp-server.com/mcp
K8S_API_KEY=your-k8s-api-key
K8S_AUTH_TOKEN=your-k8s-auth-token

# AI Provider Keys
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key

# Optional
TENANT_ID=your-tenant-id
EOF
    print_color "Created .env template. Please update with your actual values." "$GREEN"
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Menu function
show_menu() {
    echo ""
    print_color "=== MCP Server Testing Menu ===" "$GREEN"
    echo "1. Basic Connectivity Test"
    echo "2. Functional Testing (Remote MCP)"
    echo "3. Custom Provider Testing"
    echo "4. Red Team Security Testing (General)"
    echo "5. Red Team K8s MCP Testing"
    echo "6. View Test Results"
    echo "7. Setup mcp-agent-provider"
    echo "8. Run All Tests"
    echo "9. Exit"
    echo ""
    read -p "Select an option: " choice
}

# Function to run tests
run_test() {
    local config_file=$1
    local test_name=$2
    
    print_color "Running $test_name..." "$YELLOW"
    
    if [[ "$config_file" == *"redteam"* ]]; then
        npx promptfoo redteam run -c "$config_file" --verbose
    else
        npx promptfoo eval -c "$config_file" --verbose
    fi
    
    if [ $? -eq 0 ]; then
        print_color "✓ $test_name completed successfully" "$GREEN"
    else
        print_color "✗ $test_name failed" "$RED"
    fi
}

# Setup mcp-agent-provider
setup_mcp_provider() {
    print_color "Setting up mcp-agent-provider..." "$YELLOW"
    
    if [ ! -d "../../mcp-agent-provider" ]; then
        cd ../..
        git clone https://github.com/promptfoo/mcp-agent-provider.git
        cd mcp-agent-provider
        npm install
        print_color "✓ mcp-agent-provider installed" "$GREEN"
        cd ../pf2/examples/mcp-testing
    else
        print_color "mcp-agent-provider already exists" "$GREEN"
    fi
}

# Main loop
while true; do
    show_menu
    
    case $choice in
        1)
            # Quick connectivity test
            print_color "Testing MCP server connectivity..." "$YELLOW"
            curl -X POST "$MCP_SERVER_URL" \
                -H "x-api-key: $MCP_API_KEY" \
                -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
                -H "Content-Type: application/json" \
                -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
                --fail --silent --show-error | jq '.' || print_color "Connection failed" "$RED"
            ;;
        2)
            run_test "mcp-remote-config.yaml" "Functional Testing"
            ;;
        3)
            if [ ! -d "../../mcp-agent-provider" ]; then
                print_color "mcp-agent-provider not found. Please run option 7 first." "$RED"
            else
                run_test "custom-provider-config.yaml" "Custom Provider Testing"
            fi
            ;;
        4)
            run_test "mcp-redteam-config.yaml" "Red Team Security Testing"
            ;;
        5)
            run_test "k8s-mcp-redteam.yaml" "K8s MCP Red Team Testing"
            ;;
        6)
            print_color "Opening test results viewer..." "$YELLOW"
            npx promptfoo view
            ;;
        7)
            setup_mcp_provider
            ;;
        8)
            print_color "Running all tests..." "$YELLOW"
            run_test "mcp-remote-config.yaml" "Functional Testing"
            run_test "custom-provider-config.yaml" "Custom Provider Testing"
            run_test "mcp-redteam-config.yaml" "Red Team Security Testing"
            run_test "k8s-mcp-redteam.yaml" "K8s MCP Red Team Testing"
            print_color "All tests completed!" "$GREEN"
            ;;
        9)
            print_color "Exiting..." "$GREEN"
            exit 0
            ;;
        *)
            print_color "Invalid option. Please try again." "$RED"
            ;;
    esac
    
    echo ""
    read -p "Press Enter to continue..."
done
