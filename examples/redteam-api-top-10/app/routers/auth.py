"""
Auth Router - Login and user profile endpoints
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import (
    LoginRequest,
    LoginResponse,
    UserContext,
    get_current_user,
    get_user_by_id,
    login,
    validate_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class ValidateResponse(BaseModel):
    """Response from token validation."""

    valid: bool
    user: Optional[UserContext] = None
    error: Optional[str] = None


@router.post("/login", response_model=LoginResponse)
async def login_endpoint(request: LoginRequest):
    """
    Login with username and password.

    Returns JWT token and user info.

    Demo credentials:
    - alice / password123
    - bob / password123
    - charlie / password123
    - diana / password123
    - eve / password123

    Example:
        POST /auth/login
        {"username": "alice", "password": "password123"}
    """
    return login(request.username, request.password)


@router.post("/validate", response_model=ValidateResponse)
async def validate_token_endpoint(token: str):
    """
    Validate a JWT token and return user info.

    Example:
        POST /auth/validate?token=eyJ...
    """
    try:
        user = validate_token(token)
        return ValidateResponse(valid=True, user=user)
    except HTTPException as e:
        return ValidateResponse(valid=False, error=e.detail)


@router.get("/me")
async def get_current_user_profile(user: UserContext = Depends(get_current_user)):
    """
    Get current user's profile.

    Requires Authorization header with JWT token.
    """
    # Get fresh data from database
    db_user = get_user_by_id(user.user_id)

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "user_id": db_user["user_id"],
        "username": db_user["username"],
        "email": db_user["email"],
        "full_name": db_user["full_name"],
        "department": db_user["department"],
        "office_location": db_user["office_location"],
        "swag_points": db_user["swag_points"],
    }


@router.get("/demo-credentials")
async def get_demo_credentials():
    """
    Get demo login credentials for testing.
    """
    return {
        "message": "Use any of these credentials to login",
        "credentials": [
            {
                "username": "alice",
                "password": "password123",
                "department": "Engineering",
            },
            {"username": "bob", "password": "password123", "department": "Marketing"},
            {"username": "charlie", "password": "password123", "department": "Sales"},
            {"username": "diana", "password": "password123", "department": "HR"},
            {"username": "eve", "password": "password123", "department": "Finance"},
        ],
    }
