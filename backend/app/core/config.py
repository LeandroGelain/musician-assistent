from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = 'Musician Assistant API'
    secret_key: str = 'trocar-esta-chave-em-producao'
    access_token_expire_minutes: int = 1440
    database_url: str = 'postgresql+psycopg://postgres:postgres@localhost:5432/musician_assistant'
    cors_origins: str = 'http://localhost:5173,http://frontend:5173'
    score_storage_dir: str = './data/scores'

    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8')


@lru_cache
def get_settings() -> Settings:
    return Settings()


def clear_settings_cache() -> None:
    get_settings.cache_clear()
