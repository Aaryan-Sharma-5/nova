from enum import Enum
from pydantic import BaseModel, EmailStr
from typing import Optional


class UserRole(str, Enum):
    """User roles for RBAC."""
    EMPLOYEE = "employee"
    MANAGER = "manager"
    HR = "hr"
    LEADERSHIP = "leadership"


class User(BaseModel):
    """User model."""
    email: EmailStr
    full_name: str
    role: UserRole
    disabled: bool = False
    avatar_url: Optional[str] = None


class UserInDB(User):
    """User model with hashed password."""
    hashed_password: str


class Token(BaseModel):
    """JWT token response."""
    access_token: str
    token_type: str


class TokenData(BaseModel):
    """Token payload data."""
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
