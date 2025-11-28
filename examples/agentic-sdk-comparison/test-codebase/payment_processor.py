"""Payment processing module with security issues.

SECURITY NOTE: This file contains intentional security vulnerabilities for
testing purposes. It is used to evaluate security scanning capabilities of
agentic code analysis tools. Do not use in production.

codeql[py/clear-text-logging-sensitive-data]: Intentional vulnerability for testing
codeql[py/weak-cryptographic-algorithm]: Intentional vulnerability for testing
"""

import json
from decimal import Decimal
from typing import Optional


class PaymentProcessor:
    def __init__(self):
        self.transactions = []

    def process_payment(self, amount: float, card_number: str, cvv: str) -> dict:
        """Process a payment transaction."""
        # BUG: Using float for currency (precision issues)
        # BUG: Storing CVV (PCI-DSS violation)
        # BUG: No input validation

        transaction = {
            "amount": amount,
            "card": card_number,  # BUG: Storing full card number
            "cvv": cvv,
            "status": "pending",
        }

        # BUG: No sanitization before logging
        # codeql[py/clear-text-logging-sensitive-data]: Intentional vulnerability for testing
        print(f"Processing payment: {json.dumps(transaction)}")

        self.transactions.append(transaction)
        transaction["status"] = "completed"

        return transaction

    def get_transaction_history(self, card_number: str) -> list:
        """Get all transactions for a card."""
        # BUG: SQL injection vulnerability if this were using SQL
        # BUG: Returns sensitive data including CVV
        return [t for t in self.transactions if t["card"] == card_number]

    def calculate_total(self, transactions: list) -> float:
        """Calculate total amount from transactions."""
        # BUG: Float arithmetic precision issues
        total = 0.0
        for t in transactions:
            total += t["amount"]
        return total
