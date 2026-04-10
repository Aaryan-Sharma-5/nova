import logging
from typing import List, Optional
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from core.security import decode_access_token
from core.database import get_supabase_admin, get_supabase_oauth_user
from models.user import User, UserInDB, UserRole

logger = logging.getLogger(__name__)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# bcrypt hash for plaintext "secret" used by SQL seed/demo credentials.
DEMO_SECRET_HASH = "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW"


def _get_demo_user(email: str) -> Optional[UserInDB]:
    """Return a local demo user when Supabase is temporarily unreachable."""
    normalized_email = email.strip().lower()
    demo_directory = {
        "employee@company.com": ("John Doe", UserRole.EMPLOYEE),
        "manager@company.com": ("Jane Manager", UserRole.MANAGER),
        "hr.admin@company.com": ("HR Administrator", UserRole.HR),
        "ceo@company.com": ("CEO Leader", UserRole.LEADERSHIP),
    }

    entry = demo_directory.get(normalized_email)
    if not entry:
        return None

    full_name, role = entry
    return UserInDB(
        email=normalized_email,
        full_name=full_name,
        role=role,
        disabled=False,
        hashed_password=DEMO_SECRET_HASH,
    )


def get_user_by_email(email: str) -> Optional[UserInDB]:
    """Get user from Supabase database by email."""
    normalized_email = email.strip().lower()
    try:
        supabase = get_supabase_admin()
        response = supabase.table("users").select("*").eq("email", normalized_email).execute()
        
        if response.data and len(response.data) > 0:
            user_data = response.data[0]
            logger.debug("✓ User found in database by email: %s", normalized_email)
            return UserInDB(
                email=user_data["email"],
                full_name=user_data["full_name"],
                role=UserRole(user_data["role"]),
                disabled=user_data.get("disabled", False),
                hashed_password=user_data["hashed_password"]
            )
        logger.warning("✗ User not found by email: %s", normalized_email)
        return None
    except Exception as e:
        logger.error("❌ Error fetching user by email=%s: %s", normalized_email, e)
        demo_user = _get_demo_user(normalized_email)
        if demo_user:
            logger.warning("⚠️ Using local demo auth fallback for email=%s", normalized_email)
            return demo_user
        return None


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """
    Dependency to get the current authenticated user from JWT token.
    
    Args:
        token: JWT access token from Authorization header
        
    Returns:
        User: Current authenticated user
        
    Raises:
        HTTPException: If token is invalid or user not found
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    logger.debug("🔎 Validating access token")
    token_data = decode_access_token(token)
    oauth_payload = None
    if token_data is None or token_data.email is None:
        oauth_payload = get_supabase_oauth_user(token)
        if not oauth_payload or not oauth_payload.get("email"):
            logger.warning("❌ Token validation failed: missing or invalid token data")
            raise credentials_exception
    
    resolved_email = token_data.email if token_data and token_data.email else oauth_payload["email"]
    user = get_user_by_email(email=resolved_email)
    if user is None:
        logger.warning("❌ Token user not found in database: %s", resolved_email)
        raise credentials_exception

    logger.info("✅ Authenticated user from token: %s (role=%s)", user.email, user.role.value)

    avatar_url = None
    if token_data and token_data.avatar_url:
        avatar_url = token_data.avatar_url
    elif oauth_payload:
        avatar_url = oauth_payload.get("avatar_url")
    
    return User(**user.model_dump(exclude={"hashed_password"}), avatar_url=avatar_url)


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Dependency to ensure the current user is active (not disabled).
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        User: Active user
        
    Raises:
        HTTPException: If user is disabled
    """
    if current_user.disabled:
        logger.warning("⛔ Disabled user attempted access: %s", current_user.email)
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def require_role(allowed_roles: List[UserRole]):
    """
    Dependency factory to require specific roles for route access.
    
    This is the core RBAC implementation. Use this to protect routes
    by specifying which roles are allowed to access them.
    
    Usage:
        @router.get("/protected")
        async def protected_route(
            current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP]))
        ):
            return {"message": "Access granted"}
    
    Args:
        allowed_roles: List of roles that are allowed to access the route
        
    Returns:
        Dependency function that validates user role
    """
    async def role_checker(
        request: Request,
        current_user: User = Depends(get_current_active_user),
    ) -> User:
        route = f"{request.method} {request.url.path}"
        if current_user.role not in allowed_roles:
            logger.warning(
                f"🚫 [RBAC] Access denied - User: {current_user.email} "
                f"(Role: {current_user.role.value}) tried to access route requiring: "
                f"{[role.value for role in allowed_roles]} route={route}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {[role.value for role in allowed_roles]}"
            )
        logger.info(
            f"✅ [RBAC] Access granted - User: {current_user.email} "
            f"(Role: {current_user.role.value}) route={route}"
        )
        return current_user
    
    return role_checker


# Pre-defined role dependencies for common use cases
require_hr = require_role([UserRole.HR])
require_manager = require_role([UserRole.MANAGER])
require_leadership = require_role([UserRole.LEADERSHIP])
require_manager_or_above = require_role([UserRole.MANAGER, UserRole.HR, UserRole.LEADERSHIP])
require_hr_or_leadership = require_role([UserRole.HR, UserRole.LEADERSHIP])
# For routes that just need authentication without role check
require_any_authenticated = get_current_active_user


# Backward-compatible alias for any old imports.
get_user = get_user_by_email
