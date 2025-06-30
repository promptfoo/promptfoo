# tau-simulated-user (Tau Simulated User Example)

You can run this example with:

```bash
npx promptfoo@latest init --example tau-simulated-user
```

This example demonstrates testing conversational AI agents using **OpenAI's Responses API with function calling**. It simulates an airline booking system with 31 different customer personas to test how well agents handle realistic conversations.

## How It Works

The example uses **mocked airline functions** to simulate a booking system without requiring real APIs:

- **Agent responds** to customer requests using conversational AI
- **Functions are called** for operations like searching flights and booking tickets
- **Mock responses** provide realistic data (user profiles, flight options, confirmations)
- **31 personas** test different customer behaviors and edge cases

## Quick Start

1. **Set your API key**: `export OPENAI_API_KEY=your_api_key_here`
2. **Run the evaluation**: `promptfoo eval`
3. **View results**: `promptfoo view`

## What You'll See

Realistic multi-turn conversations between different customer types and the booking agent:

```
User: I need a flight from New York to Seattle on May 20th
Agent: I'd be happy to help! May I have your user ID?
User: It's mia_li_3668
Agent: Thank you! I found these options: Direct flight $325, One-stop $295
User: I'll take the cheaper United flight
Agent: Perfect! Your flight is confirmed. Confirmation: CF8X2M1K
```

## Customer Personas Tested

- **Budget travelers** focused on lowest prices
- **Business travelers** needing flexibility and speed
- **Anxious flyers** wanting direct routes and front seats
- **VIP customers** expecting premium service
- **Accessibility-focused** travelers with special needs

## Customization

- **Add personas**: Create new customer types with different behaviors
- **Extend functions**: Add seat selection, loyalty programs, etc.
- **Test other models**: Compare function calling across AI providers

## Learn More

For more information about the Simulated User Provider and other promptfoo features, visit the [documentation at promptfoo.dev](https://promptfoo.dev/docs/providers/simulated-user/).
