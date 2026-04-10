import socket
from urllib.parse import urlparse
from supabase import create_client, Client
from core.config import settings

# Initialize Supabase client
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

# Service role client for admin operations (bypasses RLS)
supabase_admin: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def get_supabase() -> Client:
    """Get Supabase client for user operations."""
    return supabase


def get_supabase_admin() -> Client:
    """Get Supabase admin client for privileged operations."""
    return supabase_admin


def get_supabase_hostname() -> str:
    """Extract hostname from SUPABASE_URL for diagnostics."""
    parsed = urlparse(settings.SUPABASE_URL)
    if parsed.hostname:
        return parsed.hostname
    # Fallback for malformed URLs to avoid raising at startup.
    return settings.SUPABASE_URL.split("/")[0]


def is_supabase_host_resolvable() -> bool:
    """Check whether Supabase hostname resolves in DNS."""
    host = get_supabase_hostname()
    if not host:
        return False
    try:
        socket.getaddrinfo(host, 443)
        return True
    except OSError:
        return False


def get_supabase_oauth_user(access_token: str) -> dict | None:
    """Resolve a Supabase OAuth access token into core user metadata."""
    auth_client = supabase_admin.auth
    user_payload = None

    for resolver in (
        lambda: auth_client.get_user(access_token),
        lambda: auth_client.get_user(jwt=access_token),
    ):
        try:
            user_payload = resolver()
            if user_payload:
                break
        except Exception:
            continue

    if not user_payload:
        return None

    user_obj = getattr(user_payload, "user", None)
    if not user_obj:
        return None

    email = getattr(user_obj, "email", None)
    user_metadata = getattr(user_obj, "user_metadata", None) or {}
    app_metadata = getattr(user_obj, "app_metadata", None) or {}

    if not email:
        return None

    full_name = (
        user_metadata.get("full_name")
        or user_metadata.get("name")
        or email.split("@")[0]
    )
    return {
        "email": str(email).strip().lower(),
        "full_name": str(full_name),
        "avatar_url": user_metadata.get("avatar_url"),
        "provider": app_metadata.get("provider") or "oauth",
    }
