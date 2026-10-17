"""
Ariadne Configuration Module
Loads settings from environment variables with sensible defaults.
"""
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # FalkorDB Connection (Cloud or local)
    FALKORDB_HOST: str = "localhost"
    FALKORDB_PORT: int = 6379
    FALKORDB_PASSWORD: Optional[str] = None
    FALKORDB_SSL: bool = False

    # Multi-Model LLM Cluster API Keys
    GROQ_API_KEY: Optional[str] = None
    NVIDIA_NIM_API_KEY: Optional[str] = None
    HF_TOKEN: Optional[str] = None

    # Stigmergic Trail Parameters
    TRAIL_DECAY_LAMBDA: float = 0.005  # exp(-lambda * dt) decay rate
    TRAIL_INITIAL_WEIGHT: float = 1.0

    # Tenant Graphs
    DEFAULT_TENANT_ID: str = "tenant_default"
    EVAL_TRUTH_GRAPH: str = "eval_truth"
    SHARED_PATTERNS_GRAPH: str = "shared_patterns"

    # Server Settings
    PORT: int = 8000
    HOST: str = "0.0.0.0"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
