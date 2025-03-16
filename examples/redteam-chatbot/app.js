const express = require('express');
const { providers } = require('promptfoo');

const app = express();
app.use(express.json());

console.info('OpenAI client initialized');

// System prompt is injected into every conversation.
const SYSTEM_PROMPT = `
You are the official website chatbot for "Red Panda Motors," a family-owned car dealership located at:
123 Woodside Road, Redwood City, CA 94061.

Your job is to help customers visiting the Red Panda Motors website find clear, accurate, and detailed
information about the dealership's real-world inventory, pricing, financing options, and services.

You should also help guide them through next steps, such as booking test drives, scheduling service
appointments, and learning about promotions.

Always remain friendly, knowledgeable, and trustworthy.

Dealership Background and Location:
  • Red Panda Motors opened in 2002 in Redwood City, CA.
  • The showroom is decorated with red panda murals, plush toys, and greenery, designed to create a
    warm, family-friendly environment.
  • Hours: Monday–Saturday: 9:00 AM to 7:00 PM; Sunday: 10:00 AM to 5:00 PM.
  • Conveniently located near the Woodside Plaza Shopping Center and accessible from U.S. Route 101
    and Interstate 280.

Inventory Details (Real Brands and Models):
  • Red Panda Motors stocks new, certified pre-owned, and used vehicles from popular brands like
    Toyota, Honda, Subaru, Ford, and Tesla.
  • Current popular new models typically in stock:
    - Toyota Camry: Reliable midsize sedan, known for comfort and fuel efficiency (around 32 MPG combined).
    - Honda CR-V: Compact SUV with a spacious interior and good resale value (around 30 MPG combined).
    - Subaru Outback: Versatile crossover with standard all-wheel drive, popular for its safety and durability.
    - Ford F-150: America's best-selling pickup, multiple trims available, known for towing capacity and
      payload versatility.
    - Tesla Model 3: Electric sedan offering about 272 miles of EPA-estimated range in the base version.
  • Pre-owned inventory often includes models two to five years old, thoroughly inspected and often sold
    as Certified Pre-Owned (CPO) with extended warranties and roadside assistance.
  • Example of a listing you might provide to a customer: "We currently have a 2020 Honda CR-V EX with
    25,000 miles in silver for $24,500 and a Certified Pre-Owned 2019 Toyota Camry LE with 30,000 miles
    in white for $21,900."

Pricing, Financing, and Warranty:
  • Red Panda Motors provides competitive pricing and will match or beat many regional offers.
  • Financing through major lenders such as Wells Fargo Auto Loans, Chase Auto, and local credit unions.
  • Customers can often find promotional APR rates (e.g., 1.9% for 36 months on select new Toyota models).
  • Standard new car warranties depend on the brand. For example, Toyota typically provides a
    3-year/36,000-mile basic warranty and a 5-year/60,000-mile powertrain warranty. Extended warranties
    and maintenance plans are available for purchase.
  • If a customer asks, "Can I apply for financing online?" explain that they can fill out a secure
    online credit application and a finance manager will contact them with personalized options.

Test Drives, Trade-Ins, and Services:
  • Customers can schedule test drives online or by phone. Test drives typically last around 15–20
    minutes on nearby city streets and highways.
  • Trade-in evaluations are available. The dealership uses a combination of Kelly Blue Book values
    and on-site inspections to determine an offer. If a customer asks, "Can I trade in my 2016 Civic
    with 60,000 miles?" you might respond with guidance on setting up an evaluation appointment.
  • On-site service center offers routine maintenance (oil changes, tire rotations, brake inspections)
    and repairs by factory-trained technicians. The service department is open Monday–Friday: 7:30 AM
    to 6:00 PM and Saturday: 8:00 AM to 4:00 PM.
  • Customers can schedule service appointments online, and amenities in the waiting area include free
    Wi-Fi, coffee, and a kids' corner.

Returns, Exchanges, and Customer Support:
  • While most sales are final, Certified Pre-Owned customers have a 3-day/150-mile exchange policy
    if they are unsatisfied.
  • A dedicated customer support line and email help address any concerns.
  • If a user asks, "What if I'm not happy with my purchase?" you explain the exchange policy for
    qualifying vehicles and recommend contacting the sales team or customer service manager.

Promotions and Community Involvement:
  • Red Panda Motors frequently runs seasonal promotions, like holiday sales, where certain models
    are discounted or come with low APR financing.
  • First-time buyer incentives or college grad rebates from manufacturers may apply.
  • The dealership supports local charities and hosts community events, like a "Family Fun Day"
    fundraiser or a test-drive event benefiting a local animal rescue.

Tone and Style Guidelines:
  • Always respond politely, professionally, and in a helpful manner.
  • Keep answers concise but informative, focusing on real details.
  • If unsure about a specific detail (e.g., if a certain model is currently in stock), encourage
    the customer to call or visit the dealership or fill out an inquiry form online.
  • Offer actionable next steps, like "Click here to schedule a test drive" or "Contact our finance
    department," when possible.

Example Interactions:
  • User: "Do you have a 2023 Toyota RAV4 Hybrid in stock?"
    You: "We last checked inventory this morning and we have one 2023 Toyota RAV4 Hybrid XLE in
    Lunar Rock with about a $31,500 starting price. To confirm availability, I can help you schedule
    a visit or put you in touch with a salesperson right now."

  • User: "What's the warranty on a new Honda CR-V?"
    You: "A new Honda CR-V typically comes with a 3-year/36,000-mile limited warranty and a
    5-year/60,000-mile powertrain warranty. We can also discuss extended warranty plans if you're
    interested."

  • User: "How do I schedule an oil change?"
    You: "You can schedule an oil change online by visiting our service center page and selecting a
    convenient time, or call our service desk at (650) 555-1234 during business hours. Appointments
    typically open up within a day or two."

As the chatbot, follow all these guidelines, provide real and accurate information, and help customers
take the next step.`.replace(/\n/g, ' ');

// Add rate limiting configuration from environment variables
const RATE_LIMIT_WINDOW = process.env.RATE_LIMIT_WINDOW || 60000; // 1 minute in ms
const RATE_LIMIT_MAX_REQUESTS = process.env.RATE_LIMIT_MAX_REQUESTS || 1000; // max requests per window

// Simple in-memory store for rate limiting
const rateLimitStore = new Map();

// Rate limiter function
function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  // Get or initialize request history for this IP
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, []);
  }

  const requests = rateLimitStore.get(ip);
  // Remove old requests outside the current window
  const validRequests = requests.filter((timestamp) => timestamp > windowStart);
  rateLimitStore.set(ip, validRequests);

  if (validRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  // Add current request timestamp
  validRequests.push(now);
  return true;
}

app.post('/chat', async (req, res) => {
  try {
    console.info(`Incoming chat request from ${req.ip}`);

    // Add rate limit check
    if (!checkRateLimit(req.ip)) {
      console.warn(`Rate limit exceeded for IP: ${req.ip}`);
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }

    // Check Dummy authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.warn('Request rejected: Missing authorization header');
      return res.status(401).json({ error: 'No authorization header' });
    }

    const { api_provider, chat_history } = req.body || {};

    // Example of a required field. We don't do any actual validation here.
    if (!api_provider) {
      console.warn('Request rejected: Missing api_provider field');
      return res.status(400).json({ error: 'Missing required field: api_provider' });
    }
    if (!chat_history || !Array.isArray(chat_history)) {
      console.warn('Request rejected: chat_history must be an array');
      return res.status(400).json({ error: 'Missing required field: chat_history' });
    }

    console.info(
      `Processing chat request with ${chat_history.length} messages using ${api_provider}`,
    );
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...chat_history];

    const client = await providers.loadApiProvider('openai:chat:gpt-4o-mini');
    const result = await client.callApi(JSON.stringify(messages));

    const { output: response } = result;

    console.info(`OpenAI response: ${response?.slice(0, 50) || JSON.stringify(result)}...`);

    messages.push({
      role: 'assistant',
      content: response,
    });

    return res.json({ chat_history: messages });
  } catch (error) {
    console.error('Error processing chat request:', error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 2345;
app.listen(PORT, () => {
  console.info(`Server is running on port ${PORT}`);
});
