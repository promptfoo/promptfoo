# Red teaming a Multi-turn Chatbot

## Introduction

This example demonstrates how to test a stateless chatbot for security vulnerabilities using promptfoo's multi-turn strategies. It includes a Node.js Express server that accepts a conversation history in OpenAI format and returns a response in the same format. It leverages promptfoo's [goat](https://www.promptfoo.dev/blog/jailbreaking-with-goat/) and crescendo strategies for multi-turn red teaming. You can learn more about configuring these strategies [here](https://www.promptfoo.dev/docs/red-team/strategies/multi-turn/).

The chatbot uses OpenAI's Responses API with function calling to fetch dealership information on demand, rather than including all information in the system prompt.

## Setup

### Installation

1. Install dependencies:

```bash
npm install
```

2. Set your OpenAI API key:

```bash
export OPENAI_API_KEY=your-api-key-here
```

3. Start the server:

```bash
npm start
```

## Running Tests

```bash
# Generate test cases
promptfoo redteam generate

# Execute evaluation
promptfoo redteam eval

# View results
promptfoo view
```

## Node.js Webserver Example Usage

### Single Message Request

```bash
curl -X POST http://localhost:2345/chat \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer your-openai-api-key-here" \
    -d '{
        "api_provider": "openai",
        "chat_history": [
            {"role": "user", "content": "Tell me about your car inventory"}
        ]
    }'
```

### Multi-turn Conversation

```bash
curl -X POST http://localhost:2345/chat \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer your-openai-api-key-here" \
    -d '{
        "api_provider": "openai",
        "chat_history": [
            {"role": "user", "content": "Do you have any Toyota models?"},
            {"role": "assistant", "content": "Yes, we have several Toyota models in stock, including the Camry and RAV4. The Camry is a reliable midsize sedan known for comfort and fuel efficiency. Would you like more specific information about any of these models?"},
            {"role": "user", "content": "What's the warranty on a new Camry?"}
        ]
    }'
```

## OpenAI Responses API Implementation

This example demonstrates how to use OpenAI's Responses API with function calling to create a more modular and maintainable chatbot. The application:

1. Uses the official OpenAI SDK to interact with the Responses API
2. Organizes dealership information into structured categories
3. Implements multiple function calling tools that the model can use to provide realistic interactions
4. Handles tool call responses and formats them properly for the client

### Car Dealership Tools

The application implements the following tools that simulate real car dealership functionality:

1. **getDealershipInfo**: Retrieves general information about the dealership in various categories including location, hours, policies, etc.

2. **searchInventory**: Allows searching the dealership's current vehicle inventory by make, model, year, price range, and condition. Returns detailed vehicle information including features, price, and location.

3. **scheduleAppointment**: Books test drives or service appointments by collecting customer information and appointment details. Generates a reference number for tracking.

4. **checkMaintenanceRecords**: Looks up a customer's vehicle maintenance history using a reference number. Returns service records with dates, services performed, and technician notes.

5. **checkServiceStatus**: Provides real-time status updates for vehicles currently in service, including estimated completion dates and work performed.

6. **checkPartsAvailability**: Searches the parts inventory to check availability of specific parts by part number, description, or compatible vehicle.

7. **getDepartmentHours**: Retrieves operating hours for specific departments (sales, service, parts, finance) on particular days.

8. **getCurrentPromotions**: Shows current dealership promotions, special offers, and eligibility requirements.

9. **calculateFinancing**: Estimates monthly payments for a vehicle based on price, down payment, trade-in value, interest rate, and loan term.

### Internal Dealership Systems

The application also includes tools that simulate internal dealership systems that would typically only be available to employees:

1. **searchCustomerDatabase**: Searches the dealership's Customer Relationship Management (CRM) system to look up customer details, including contact information, purchase history, and past interactions.

2. **getSalesLeads**: Retrieves and filters active sales leads from the lead management system, including information about prospect status, interests, and assigned sales consultants.

3. **lookupEmployee**: Accesses the employee directory to find staff contact information, departments, schedules, and positions.

4. **checkInventoryAllocations**: Checks incoming vehicle allocations and factory orders, including estimated arrival dates and status updates.

5. **getSalesPerformance**: Retrieves sales performance metrics for the dealership, including monthly sales numbers, year-to-date figures, and comparisons to previous periods.

### Function Calling Architecture

The implementation follows these principles:

1. **Modular Data Organization**: All mock data is organized into separate data structures for inventory, appointments, maintenance records, service status, parts inventory, department hours, and promotions.

2. **Comprehensive Function Definitions**: Each tool is properly defined with detailed parameter descriptions, allowing the model to understand when and how to use each function.

3. **Multiple Tool Handling**: The application can process multiple tool calls in a single request, executing each function and returning the results to the model.

4. **Realistic Response Handling**: Tool results are formatted properly for the Responses API, which then generates a natural language response based on the data provided.

5. **Centralized Tool Registry**: All tools are registered in a central registry that handles both the function implementations and their corresponding definitions for the OpenAI API.

This approach creates a much more realistic simulation of a car dealership chatbot that can handle a wide range of customer inquiries with appropriate tools and data access.
