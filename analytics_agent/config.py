"""
Configuration management for the Analytics Agent.

Uses python-decouple for environment variable handling with sensible defaults.
"""
from decouple import config
from typing import Optional


class Config:
    """Application configuration with environment variable support."""

    APP_ENV: str = config('APP_ENV', default='development')

    # Database Configuration
    DATABASE_URL: str = config('DATABASE_URL', default='sqlite:///./analytics.db')
    DATABASE_ECHO: bool = config('DATABASE_ECHO', default=False, cast=bool)

    # AI Service Configuration
    GEMINI_API_KEY: Optional[str] = config('GEMINI_API_KEY', default=None)
    GEMINI_MODEL: str = config('GEMINI_MODEL', default='gemini-2.5-pro')

    # Logging Configuration
    LOG_LEVEL: str = config('LOG_LEVEL', default='INFO')
    LOG_FORMAT: str = config('LOG_FORMAT', default='json')  # 'json' or 'text'

    # Application Configuration
    APP_NAME: str = config('APP_NAME', default='Analytics Agent')
    APP_VERSION: str = config('APP_VERSION', default='1.0.0')
    DEBUG: bool = config('DEBUG', default=False, cast=bool)

    # API Configuration (for Phase 2)
    API_HOST: str = config('API_HOST', default='0.0.0.0')
    API_PORT: int = config('API_PORT', default=8000, cast=int)
    API_WORKERS: int = config('API_WORKERS', default=1, cast=int)

    # Security Configuration
    SECRET_KEY: str = config('SECRET_KEY', default='change-me-in-production')
    JWT_SECRET_KEY: str = config('JWT_SECRET_KEY', default='change-me-in-production')
    GOOGLE_CLIENT_ID: Optional[str] = config('GOOGLE_CLIENT_ID', default=None)
    CORS_ALLOWED_ORIGINS: str = config('CORS_ALLOWED_ORIGINS', default='http://localhost:5173')
    CORS_ALLOW_CREDENTIALS: bool = config('CORS_ALLOW_CREDENTIALS', default=True, cast=bool)
    ACCESS_TOKEN_TTL_SECONDS: int = config('ACCESS_TOKEN_TTL_SECONDS', default=900, cast=int)

    # Performance Configuration
    MAX_WORKERS: int = config('MAX_WORKERS', default=4, cast=int)
    REQUEST_TIMEOUT: int = config('REQUEST_TIMEOUT', default=30, cast=int)
    CONTEXT_SIZE: int = config('CONTEXT_SIZE', default=3, cast=int)

    # Feature Flags
    ENABLE_AI_SUMMARIES: bool = config('ENABLE_AI_SUMMARIES', default=True, cast=bool)
    ENABLE_DATABASE_PERSISTENCE: bool = config('ENABLE_DATABASE_PERSISTENCE', default=True, cast=bool)

    def get_cors_origins(self) -> list[str]:
        return [item.strip() for item in self.CORS_ALLOWED_ORIGINS.split(",") if item.strip()]

    def validate_security(self) -> None:
        env = (self.APP_ENV or "development").strip().lower()
        if env not in {"production", "prod"}:
            return

        if self.SECRET_KEY in {"", "change-me-in-production"}:
            raise ValueError("SECRET_KEY must be configured in production")
        if self.JWT_SECRET_KEY in {"", "change-me-in-production"}:
            raise ValueError("JWT_SECRET_KEY must be configured in production")
        if not (self.GOOGLE_CLIENT_ID or "").strip():
            raise ValueError("GOOGLE_CLIENT_ID must be configured in production")
        if self.DEBUG:
            raise ValueError("DEBUG must be disabled in production")

        origins = self.get_cors_origins()
        if not origins or "*" in origins:
            raise ValueError("CORS_ALLOWED_ORIGINS must contain explicit origins in production")
        if self.CORS_ALLOW_CREDENTIALS and "*" in origins:
            raise ValueError("Wildcard CORS origin is invalid when credentials are enabled")

        if self.DATABASE_URL.startswith("sqlite"):
            raise ValueError("SQLite is not allowed for production deployment")


# Global configuration instance
settings = Config()
