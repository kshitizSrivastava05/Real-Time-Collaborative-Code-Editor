# Database Session:
# Provides a temporary connection/workspace to interact with the database.
# It is used for operations like add, get, update, and delete.


# Import create_engine from SQLAlchemy.
# It is responsible for creating the connection between our FastAPI application and PostgreSQL.
from sqlalchemy import create_engine


# sessionmaker is used to create database sessions.
# declarative_base is used to create the Base class from which our database models will inherit.
# In simple terms:
# ORM (Object-Relational Mapping) lets you work with database tables using programming-language objects instead of writing SQL queries directly.
from sqlalchemy.orm import sessionmaker, declarative_base

from utils.setting import settings

DATABASE_URL = settings.DB_CONNECTION 



# Create the Base class.
# All our database models will inherit from this Base.
# Example:
# class Todo(Base):
#     ...
#
# SQLAlchemy uses Base to keep track of our database tables.
Base = declarative_base()

# create_engine() creates the SQLAlchemy engine.
# The engine is responsible for communicating with the PostgreSQL database using the DATABASE_URL.
engine1 = create_engine(DATABASE_URL)

# LocalSession = sessionmaker(bind=engine1) # In simple , sessionmaker creates a factory that can create database sessions whenever we need them.

# OR

# In Detail :
# sessionmaker creates a factory that can create database sessions whenever we need them.
# A session is basically our working connection with the database for operations like: INSERT, SELECT, UPDATE and DELETE.
LocalSession = sessionmaker(
    autocommit=False,   # We manually decide when changes are saved using db.commit()
    autoflush=False,    # SQLAlchemy will not automatically flush changes
    bind=engine1        # Use our PostgreSQL engine for these sessions
)

# This function creates a database session.
# FastAPI will use this function whenever an API route needs to communicate with PostgreSQL.
def get_db():
    # Create a new database session.
    session = LocalSession()
    try:
        # Give the database session to the FastAPI route.
        # 'yield' temporarily hands control to the route.
        yield session 
    finally:
        # After the API request is finished, close the database session.
        # This prevents unnecessary database connections from staying open.
        session.close()

