# tau-simulated-user (Tau Simulated User Example)

You can run this example with:

```bash
npx promptfoo@latest init --example tau-simulated-user
```

This example shows how to test airline booking agents through realistic conversations with 31 different customer personas - from budget travelers to VIP customers to anxious flyers.

## Quick Start

1. **Set your API key**:

   ```bash
   export OPENAI_API_KEY=your_api_key_here
   ```

2. **Run the evaluation**:

   ```bash
   promptfoo eval
   ```

3. **View results**:
   ```bash
   promptfoo view
   ```

## What You'll See

Each test creates a natural conversation between a simulated customer and your airline agent:

```
User: I need a flight from New York to Seattle on May 20th
Agent: I'd be happy to help! Could you provide your user ID?
User: It's mia_li_3668
Agent: [makes function call to get user profile]
User: I prefer direct flights but one stop is okay if cheaper
Agent: [searches flights and presents options]
...
```

The agent makes structured function calls to:

- Look up customer profiles and preferences
- Search for available flights  
- Process bookings and payments
- Handle modifications and cancellations

**Note**: This example tests the conversation flow and function calling interface, but doesn't execute real airline functions. The AI simulates realistic responses based on the function schemas, making it perfect for testing conversational logic without requiring a full airline booking backend.

## Sample Customer Personas

- **mia_li_3668**: Budget-conscious, wants economy class, has baggage, prefers certificates for payment
- **tony_plus_5980**: Busy parent, needs last-minute business class, flexible booking
- **fear_of_flying_321**: Anxious flyer, wants shortest routes, prefers front seats
- **vip_request_999**: Luxury traveler, money no object, wants premium amenities

## Key Features

- **31 diverse personas**: Tests edge cases, difficult customers, and varied requirements
- **Function calling**: Uses OpenAI Responses API with structured airline booking functions
- **Multi-turn conversations**: Up to 10 conversation turns per test
- **Realistic scenarios**: Based on actual airline booking situations

## Airline Functions Tested

The agent can call these booking functions:

- `get_user_profile` - Retrieve customer information
- `search_flights` - Find available flights
- `book_flight` - Create reservations
- `modify_reservation` - Change existing bookings
- `cancel_reservation` - Cancel flights
- `offer_compensation` - Provide refunds for issues

## Customization

**Add new personas**: Create customers with different needs and constraints

**Extend functions**: Add seat selection, meal preferences, or loyalty program features

**Add assertions**: Validate that the agent calls functions correctly and follows policies

**Compare models**: Test function calling across different AI providers

---

## Mock vs Real Function Calling

This example demonstrates **function calling interface testing** rather than real function execution:

- **Function Schemas**: Defined in `functions/*.json` files - these specify the interface
- **No Backend**: No actual airline booking system is connected
- **AI Simulation**: The AI continues conversations as if functions returned realistic data
- **Testing Focus**: Validates conversation flow, function selection, and parameter passing

To connect real functions, you'd need to implement a function execution backend that processes the structured calls and returns actual data.

**Technical Details**: This example uses `openai:responses:gpt-4.1-mini` with function definitions instead of text-based policies, enabling more structured and reliable testing of conversational AI agents. All function schemas are externalized into separate JSON files in the `functions/` directory for better maintainability.
