from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    zoom_account_id: str
    zoom_client_id: str
    zoom_client_secret: str

    api_key: str

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
