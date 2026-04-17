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
    ORG_SECTOR: str = "IT Services"
    STARTUP_DNS_CHECK_TIMEOUT_SECONDS: float = 1.5
    SCHEDULER_RUN_JOBS_ON_STARTUP: bool = False

    # JIRA Integration
    JIRA_BASE_URL: str = ""
    JIRA_EMAIL: str = ""
    JIRA_API_TOKEN: str = ""

    # Optional ML feature explainability source configuration
    ML_FEATURE_TABLE: str = ""
    ML_FEATURE_EMPLOYEE_KEY: str = "employee_id"
    ML_FEATURE_COLUMN_MAP_JSON: str = ""

    # Composio Integration
    COMPOSIO_API_KEY: str = ""
    COMPOSIO_WEBHOOK_SECRET: str = ""
    COMPOSIO_CONNECT_TIMEOUT_SECONDS: int = 45
    COMPOSIO_CONNECT_MAX_ATTEMPTS: int = 2

    # Slack Native Integration
    SLACK_SIGNING_SECRET: str = ""
    SLACK_BOT_TOKEN: str = ""
    
    class Config:
        env_file = str(Path(__file__).resolve().parents[1] / ".env")
        case_sensitive = True
        extra = "ignore"  # Ignore extra fields in .env

    def get_cors_origins(self) -> List[str]:
        """Build deduplicated CORS origin list from defaults and env settings."""
        origins: List[str] = [
            self.FRONTEND_URL,
            "http://localhost:8080",
            "http://localhost:8081",
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:8080",
            "http://127.0.0.1:8081",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
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
