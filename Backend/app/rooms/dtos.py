
from pydantic import BaseModel, Field
from datetime import datetime


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class RoomResponse(BaseModel):
    id: str
    name: str
    created_by: str
    created_at: datetime