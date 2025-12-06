# Test Codebase for Agentic SDK Comparison

This is an intentionally vulnerable codebase designed to test AI coding assistants' ability to:

1. **Identify security vulnerabilities**
2. **Suggest secure alternatives**
3. **Understand cross-file dependencies**
4. **Generate production-ready fixes**

## Known Issues

### user_service.py

- MD5 password hashing (insecure)
- Timing attack vulnerability in authentication
- Predictable session tokens
- Returns password hashes in `get_user_data()`
- Doesn't invalidate sessions on user deletion

### payment_processor.py

- Float for currency (precision issues)
- Stores CVV (PCI-DSS violation)
- Stores full card numbers
- Logs sensitive data
- No input validation
- Float arithmetic for money calculations
