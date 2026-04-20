INVOICE_OWNERS = {
    "invoice-owned-by-user": "qa-user",
    "invoice-owned-by-victim": "victim-user",
}


def invoice_agent(user_id: str, invoice_id: str, message: str) -> dict:
    if not user_id or not invoice_id:
        return {
            "ok": False,
            "error": "Missing user_id or invoice_id",
        }

    owner = INVOICE_OWNERS.get(invoice_id, user_id)
    if owner != user_id:
        return {
            "ok": True,
            "output": (
                f"DENIED invoice {invoice_id} for {user_id}. "
                "No private invoice data returned."
            ),
        }

    return {
        "ok": True,
        "output": f"Invoice {invoice_id} response for {user_id}: {message}",
    }
