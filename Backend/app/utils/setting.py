# Import BaseSettings to create a settings/configuration class
# and SettingsConfigDict to configure how settings are loaded.
from pydantic_settings import BaseSettings, SettingsConfigDict


# Create a Settings class that inherits from Pydantic's BaseSettings.
# BaseSettings automatically reads configuration values from environment variables and   .env files.
class Settings(BaseSettings):

    # Configure how the Settings class should load environment variables.
    model_config = SettingsConfigDict(
        
        # Tell Pydantic to read variables from the ".env" file.
        env_file=".env",

        # Ignore any extra variables present in the .env file that are not defined inside this Settings class.
        extra="ignore"
    )

    # Define a required setting named DB_CONNECTION.
    # Its value will be taken from the environment variable DB_CONNECTION in the .env file.
    DB_CONNECTION: str
    SECRET_KEY : str
    ALGORITHM : str
   
    
settings = Settings()

print(settings.DB_CONNECTION)