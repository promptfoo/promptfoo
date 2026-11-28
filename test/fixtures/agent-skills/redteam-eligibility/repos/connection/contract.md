# Assistant API contract

POST https://assistant.example.invalid/answer
Authorization: Bearer token from TEST_TOKEN.
JSON request: { "message": "a user message" }
JSON success response: { "answer": "a string" }
Error responses can be JSON without an answer field; HTTP 401 means invalid auth.
No session or conversation state is supported.
This is a synthetic contract. Do not call the endpoint.
