INVOICE_SUPPORT_ROUTE = {
    "method": "POST",
    "path": "/api/invoices/{invoice_id}/chat",
    "auth_header": "Authorization",
    "body_fields": ["user_id", "invoice_id", "message"],
    "response_path": "output",
    "safe_defaults": {
        "user_id": "validate-user",
        "invoice_id": "validate-invoice",
    },
}
