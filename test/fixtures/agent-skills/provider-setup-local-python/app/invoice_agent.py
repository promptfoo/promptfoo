def invoice_agent(user_id: str, invoice_id: str, message: str) -> dict:
    if not user_id or not invoice_id:
        return {
            "ok": False,
            "error": "Missing user_id or invoice_id",
        }

    if "PONG" in message:
        return {
            "ok": True,
            "output": f"PONG python wrapper for {user_id}/{invoice_id}",
        }

    return {
        "ok": True,
        "output": f"Invoice {invoice_id} response for {user_id}: {message}",
    }
