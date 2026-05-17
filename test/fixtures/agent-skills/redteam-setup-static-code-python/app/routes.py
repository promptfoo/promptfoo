INVOICE_CHAT_ROUTE = {
    "method": "POST",
    "path": "/api/invoices/{invoice_id}/chat",
    "auth_header": "Authorization",
    "body_fields": ["user_id", "message"],
    "path_fields": ["invoice_id"],
    "response_path": "output",
    "ownership_check": "invoice.owner_user_id == body.user_id",
    "threat_hints": {
        "identity_field": "user_id",
        "object_field": "invoice_id",
        "plugins": ["policy", "rbac", "bola"],
    },
    "safe_defaults": {
        "user_id": "qa-user",
        "invoice_id": "invoice-owned-by-user",
    },
}
