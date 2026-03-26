import json
import os
import time
import urllib.parse
import urllib.request


def get_auth(context):
    token_url = "https://example-app.promptfoo.app/oauth/token"
    vars = context.get("vars", {})
    client_id = os.environ.get("PROMPTFOO_TARGET_CLIENT_ID") or vars.get("clientId")
    client_secret = os.environ.get("PROMPTFOO_TARGET_CLIENT_SECRET") or vars.get(
        "clientSecret"
    )
    scopes = os.environ.get("PROMPTFOO_TARGET_SCOPES") or vars.get("scopes")

    body = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }
    if scopes:
        body["scope"] = scopes

    request = urllib.request.Request(
        token_url,
        data=urllib.parse.urlencode(body).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        data = json.loads(response.read().decode("utf-8"))

    return {
        "token": data["access_token"],
        "expiration": (
            int(data["expires_in"]) * 1000 + int(time.time() * 1000)
            if data.get("expires_in")
            else None
        ),
    }
