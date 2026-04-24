from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mqtt_broker: str = "localhost"
    mqtt_port: int = 1883
    mqtt_user: str = "smartcity"
    mqtt_password: str = "password"

    influxdb_url: str = "http://localhost:8086"
    influxdb_token: str = "smartcity-super-secret-token"
    influxdb_org: str = "smartcity"
    influxdb_bucket: str = "waste_monitoring"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
