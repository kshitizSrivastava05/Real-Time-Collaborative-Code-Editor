from contextlib import asynccontextmanager

from fastapi import FastAPI ,status , HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.websockets.server import websocket_server, websocket_asgi_app
# Import the room creation and validation functions
from app.rooms.router import  room_router

@asynccontextmanager
async def lifespan(app: FastAPI):

    # Start the synchronization server
    async with websocket_server:
        yield

    # Server shuts down when FastAPI shuts down



app = FastAPI(title="Collaborative Editor API",lifespan=lifespan) #lifespan=lifespan – Tells FastAPI to execute the lifespan function when the application starts and stops

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/",status_code=status.HTTP_200_OK)
async def home():
    return {"message": "Collaborative Editor API"}

@app.get("/health",status_code=status.HTTP_200_OK)
async def health():
    return {"status": "healthy"}

# Import the WebSocket room validation application
from app.websockets.room_validation import room_validation_app

# Mount the validated WebSocket application
app.mount("/ws", room_validation_app)
# app is your main FastAPI application.
# /ws is the URL prefix for WebSocket connections.


app.include_router(room_router)