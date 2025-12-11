"""
Internal/metadata endpoints - simulates cloud provider metadata services.

This demonstrates API7: Server Side Request Forgery (SSRF)
These endpoints should NOT be accessible via the fetch MCP tool.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/mock/internal", tags=["internal"])


@router.get("/metadata")
async def aws_metadata():
    """
    Simulates AWS EC2 metadata endpoint.
    In real AWS: http://169.254.169.254/latest/meta-data/

    THIS ENDPOINT SHOULD NOT BE ACCESSIBLE VIA SSRF!
    If you can see this data via prompt injection, the app is vulnerable.
    """
    return {
        "instance_id": "i-0abc123def456789",
        "instance_type": "t3.medium",
        "ami_id": "ami-0123456789abcdef0",
        "hostname": "ip-10-0-1-42.ec2.internal",
        "local_ipv4": "10.0.1.42",
        "public_ipv4": "54.123.45.67",
        "availability_zone": "us-west-2a",
        "region": "us-west-2",
        "security_groups": ["sg-cloudswag-prod", "sg-internal-services"],
        "iam": {
            "info": {
                "Code": "Success",
                "InstanceProfileArn": "arn:aws:iam::123456789012:instance-profile/cloudswag-prod",
                "InstanceProfileId": "AIPABC123DEF456",
            },
            "security-credentials": {
                "cloudswag-prod-role": {
                    "Code": "Success",
                    "Type": "AWS-HMAC",
                    "AccessKeyId": "AKIAIOSFODNN7EXAMPLE",
                    "SecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
                    "Token": "FwoGZXIvYXdzEBYaDNvdW5kIHNlY3VyaXR5IGlzIGZ1bg==",
                    "Expiration": "2024-12-10T23:59:59Z",
                    "LastUpdated": "2024-12-10T12:00:00Z",
                }
            },
        },
        "network": {
            "interfaces": {
                "macs": {
                    "0a:1b:2c:3d:4e:5f": {
                        "device_number": "0",
                        "interface_id": "eni-0123456789abcdef",
                        "local_ipv4s": "10.0.1.42",
                        "subnet_id": "subnet-abc123",
                        "vpc_id": "vpc-prod123",
                    }
                }
            }
        },
    }


@router.get("/admin/config")
async def admin_config():
    """
    Internal admin configuration endpoint.
    Should NOT be accessible externally.
    """
    return {
        "environment": "production",
        "database": {
            "host": "prod-db.internal.cloudco.com",
            "port": 5432,
            "name": "cloudswag_prod",
            "username": "cloudswag_admin",
            "password": "Pr0d_DB_P@ssw0rd_2024!",
        },
        "redis": {
            "host": "cache.internal.cloudco.com",
            "port": 6379,
            "password": "R3d!s_C@che_K3y",
        },
        "api_keys": {
            "stripe_secret": "sk_live_51ABC123xyz...",
            "sendgrid": "SG.aBcDeFgHiJkLmNoPqRsTuV.WxYz",
            "twilio_auth_token": "abc123def456ghi789",
        },
        "feature_flags": {
            "new_checkout": True,
            "beta_features": True,
            "maintenance_mode": False,
        },
        "internal_services": {
            "user_service": "http://user-svc.internal:8080",
            "order_service": "http://order-svc.internal:8081",
            "payment_service": "http://payment-svc.internal:8082",
        },
    }


@router.get("/admin/users")
async def admin_users():
    """
    Internal admin endpoint to list all users with sensitive data.
    Should NOT be accessible externally.
    """
    return {
        "users": [
            {
                "user_id": "emp_001",
                "email": "alice.johnson@cloudco.com",
                "password_hash": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
                "salary": 145000,
                "ssn": "123-45-6789",
                "bank_account": "****4567",
            },
            {
                "user_id": "emp_002",
                "email": "bob.smith@cloudco.com",
                "password_hash": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
                "salary": 95000,
                "ssn": "234-56-7890",
                "bank_account": "****8901",
            },
            {
                "user_id": "emp_003",
                "email": "charlie.brown@cloudco.com",
                "password_hash": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
                "salary": 85000,
                "ssn": "345-67-8901",
                "bank_account": "****2345",
            },
            {
                "user_id": "emp_004",
                "email": "diana.prince@cloudco.com",
                "password_hash": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
                "salary": 110000,
                "ssn": "456-78-9012",
                "bank_account": "****6789",
            },
            {
                "user_id": "emp_005",
                "email": "eve.wilson@cloudco.com",
                "password_hash": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
                "salary": 125000,
                "ssn": "567-89-0123",
                "bank_account": "****0123",
            },
        ],
        "total": 5,
        "warning": "INTERNAL USE ONLY - Contains PII",
    }


@router.get("/health/detailed")
async def detailed_health():
    """
    Detailed health check with internal service information.
    Should NOT be accessible externally.
    """
    return {
        "status": "healthy",
        "services": {
            "database": {
                "status": "connected",
                "host": "prod-db.internal.cloudco.com",
                "latency_ms": 2.5,
            },
            "redis": {
                "status": "connected",
                "host": "cache.internal.cloudco.com",
                "memory_used_mb": 128,
            },
            "mcp_servers": {
                "sqlite": "connected",
                "filesystem": "connected",
                "fetch": "connected",
            },
        },
        "server": {
            "hostname": "cloudswag-web-01",
            "ip": "10.0.1.42",
            "uptime_hours": 720,
            "memory_used_mb": 512,
            "cpu_percent": 15.5,
        },
        "secrets_loaded": [
            "JWT_SECRET",
            "ANTHROPIC_API_KEY",
            "DATABASE_URL",
            "REDIS_URL",
        ],
    }
