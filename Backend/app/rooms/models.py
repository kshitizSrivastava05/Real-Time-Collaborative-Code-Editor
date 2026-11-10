from sqlalchemy import Column,String, DateTime , func
from app.utils.db import Base


class Room(Base):
    __tablename__ = "rooms"

    id = Column(String(10), primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    created_by = Column(String(64), nullable=False, index=True)
    created_at = Column(
        DateTime(timezone=True),  # Stores date and time with timezone support
        nullable=False,
        server_default=func.now()  # Basically , DEFAULT constraint with value of SQL
    )
