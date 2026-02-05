"""
JWT Authentication Module with Database Login

Supports:
- Username/password login against SQLite database
- JWT token generation and validation
- Password hashing with SHA256 (use bcrypt in production)
"""

import hashlib
import sqlite3
from datetime import datetime, timedelta
from typing import Optional

import jwt
from fastapi import Header, HTTPException
from pydantic import BaseModel

from .config import JWT_ALGORITHM, JWT_SECRET, SECURITY_AUTH, SWAG_DB_PATH


class TokenPayload(BaseModel):
    """JWT token payload structure."""

    sub: str  # user_id - CRITICAL for database scoping
    name: str
    email: Optional[str] = None
    department: Optional[str] = None
    office_location: Optional[str] = None
    exp: Optional[int] = None


class UserContext(BaseModel):
    """User context extracted from JWT for use in chat."""

    user_id: str
    name: str
    email: Optional[str] = None
    department: Optional[str] = None
    office_location: Optional[str] = None


class LoginRequest(BaseModel):
    """Login request body."""

    username: str
    password: str


class LoginResponse(BaseModel):
    """Login response with JWT token."""

    token: str
    user_id: str
    name: str
    email: str
    department: Optional[str] = None
    office_location: Optional[str] = None
    swag_points: int


class UserProfile(BaseModel):
    """Full user profile."""

    user_id: str
    username: str
    email: str
    full_name: str
    department: Optional[str] = None
    office_location: Optional[str] = None
    swag_points: int


def hash_password(password: str) -> str:
    """Hash password using SHA256 (use bcrypt in production)."""
    return hashlib.sha256(password.encode()).hexdigest()


def get_db_connection():
    """Get SQLite database connection."""
    return sqlite3.connect(SWAG_DB_PATH)


def authenticate_user(username: str, password: str) -> Optional[dict]:
    """
    Authenticate user against database.

    Returns user dict if credentials are valid, None otherwise.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            """SELECT user_id, email, username, password_hash, full_name,
                      department, office_location, swag_points
               FROM users WHERE username = ?""",
            (username.lower(),),
        )
        row = cursor.fetchone()

        if not row:
            return None

        (
            user_id,
            email,
            db_username,
            password_hash,
            full_name,
            department,
            office_location,
            swag_points,
        ) = row

        # Verify password
        if hash_password(password) != password_hash:
            return None

        return {
            "user_id": user_id,
            "email": email,
            "username": db_username,
            "full_name": full_name,
            "department": department,
            "office_location": office_location,
            "swag_points": swag_points,
        }
    finally:
        conn.close()


def get_user_by_id(user_id: str) -> Optional[dict]:
    """Get user by user_id."""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            """SELECT user_id, email, username, full_name,
                      department, office_location, swag_points
               FROM users WHERE user_id = ?""",
            (user_id,),
        )
        row = cursor.fetchone()

        if not row:
            return None

        return {
            "user_id": row[0],
            "email": row[1],
            "username": row[2],
            "full_name": row[3],
            "department": row[4],
            "office_location": row[5],
            "swag_points": row[6],
        }
    finally:
        conn.close()


def create_token(user: dict, hours_valid: int = 24) -> str:
    """
    Create a JWT token for a user.

    Args:
        user: User dict from database
        hours_valid: How long the token is valid for

    Returns:
        JWT token string
    """
    payload = {
        "sub": user["user_id"],
        "name": user["full_name"],
        "email": user.get("email"),
        "department": user.get("department"),
        "office_location": user.get("office_location"),
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=hours_valid),
    }

    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def validate_token(token: str) -> UserContext:
    """
    Validate JWT token and return user context.

    Security levels (SECURITY_AUTH):
    - Level 1 (Weak): Accept alg:none tokens (no signature required)
    - Level 2 (Medium): Verify signature but ignore expiration; user_id_override in chat allowed
    - Level 3 (Strong): Full signature and expiration verification; no overrides
    """
    if not token:
        raise HTTPException(status_code=401, detail="Token required")

    token = token.strip()

    # Remove "Bearer " prefix if present
    if token.startswith("Bearer "):
        token = token[7:]

    try:
        if SECURITY_AUTH == 1:
            # Level 1: VULNERABLE - Accept alg:none tokens
            # This allows forged tokens with no signature!
            # Try decoding without verification first
            try:
                # Decode without verification to check for alg:none
                unverified = jwt.decode(token, options={"verify_signature": False})

                # Check if this is an alg:none token (no signature)
                # PyJWT doesn't directly expose header, so we check if token has empty signature
                parts = token.split(".")
                if len(parts) == 3 and parts[2] == "":
                    # alg:none token - accept it!
                    return UserContext(
                        user_id=unverified["sub"],
                        name=unverified.get("name", "Unknown"),
                        email=unverified.get("email"),
                        department=unverified.get("department"),
                        office_location=unverified.get("office_location"),
                    )

                # Also accept tokens even without proper signature verification
                payload = jwt.decode(
                    token, JWT_SECRET, algorithms=[JWT_ALGORITHM, "none"]
                )

            except jwt.InvalidTokenError:
                # Fall back to standard decode
                payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

        elif SECURITY_AUTH == 2:
            # Level 2: Verify signature but ignore expiration
            payload = jwt.decode(
                token,
                JWT_SECRET,
                algorithms=[JWT_ALGORITHM],
                options={"verify_exp": False},  # Don't check expiration
            )
        else:
            # Level 3: Full verification (secure)
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

        return UserContext(
            user_id=payload["sub"],
            name=payload.get("name", "Unknown"),
            email=payload.get("email"),
            department=payload.get("department"),
            office_location=payload.get("office_location"),
        )

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


def login(username: str, password: str) -> LoginResponse:
    """
    Authenticate user and return JWT token.

    Raises HTTPException if credentials are invalid.
    """
    user = authenticate_user(username, password)

    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_token(user)

    return LoginResponse(
        token=token,
        user_id=user["user_id"],
        name=user["full_name"],
        email=user["email"],
        department=user.get("department"),
        office_location=user.get("office_location"),
        swag_points=user["swag_points"],
    )


# FastAPI dependency for token validation
async def get_current_user(
    authorization: str = Header(None, alias="Authorization"),
) -> UserContext:
    """
    FastAPI dependency to extract user from Authorization header.

    Usage:
        @app.get("/protected")
        async def protected_route(user: UserContext = Depends(get_current_user)):
            return {"user_id": user.user_id}
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")

    # Handle "Bearer <token>" format
    if authorization.startswith("Bearer "):
        token = authorization[7:]
    else:
        token = authorization

    return validate_token(token)
