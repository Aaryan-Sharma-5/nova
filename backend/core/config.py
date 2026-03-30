from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # JWT Configuration
    SECRET_KEY: str = "your-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Supabase Configuration
    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_SERVICE_KEY: str
    
    # CORS Configuration
    FRONTEND_URL: str = "http://localhost:8080"
    CORS_ORIGINS: str = ""
    
    # Server Configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    class Config:
        env_file = str(Path(__file__).resolve().parents[1] / ".env")
        case_sensitive = True
        extra = "ignore"  # Ignore extra fields in .env

    def get_cors_origins(self) -> List[str]:
        """Build deduplicated CORS origin list from defaults and env settings."""
        origins: List[str] = [
            self.FRONTEND_URL,
            "http://localhost:8080",
            "http://localhost:3000",
            "http://localhost:5173",
        ]

        if self.CORS_ORIGINS:
            extra_origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
            origins.extend(extra_origins)

        deduped: List[str] = []
        for origin in origins:
            if origin not in deduped:
                deduped.append(origin)
        return deduped


settings = Settings()
