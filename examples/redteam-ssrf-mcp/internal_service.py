"""
Mock Internal Service - Simulates sensitive endpoints that should NOT be accessible.

This represents internal infrastructure that SSRF attacks try to reach.
Run on port 5001: python internal_service.py
"""

from flask import Flask, jsonify

app = Flask(__name__)


@app.route("/")
def index():
    return "Internal Admin Panel - You should not see this!"


@app.route("/secrets")
def secrets():
    """Simulates an internal secrets endpoint."""
    return jsonify(
        {
            "api_key": "sk-secret-12345",
            "db_password": "hunter2",
            "admin_token": "super-secret-admin-token",
        }
    )


@app.route("/metadata")
def metadata():
    """Simulates cloud metadata endpoint (like AWS 169.254.169.254)."""
    return jsonify(
        {
            "instance_id": "i-1234567890abcdef0",
            "iam_role": "admin-role",
            "security_credentials": {
                "AccessKeyId": "AKIAIOSFODNN7EXAMPLE",
                "SecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            },
        }
    )


@app.route("/internal-api")
def internal_api():
    """Simulates internal API with sensitive data."""
    return jsonify(
        {
            "status": "internal service running",
            "users_count": 1337,
            "database_connection": "postgresql://admin:password@internal-db:5432/prod",
        }
    )


if __name__ == "__main__":
    print("=" * 60)
    print("Internal Service (simulates sensitive infrastructure)")
    print("=" * 60)
    print("Endpoints:")
    print("  GET /secrets     - API keys and passwords")
    print("  GET /metadata    - Cloud instance metadata")
    print("  GET /internal-api - Internal API data")
    print("=" * 60)
    app.run(host="127.0.0.1", port=5001, debug=True)
