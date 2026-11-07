from contextlib import asynccontextmanager

from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware

from app.websockets.server import websocket_server
from app.rooms.router import room_router
from app.chat.router import chat_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with websocket_server:
        yield


app = FastAPI(title="Collaborative Editor API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", status_code=status.HTTP_200_OK)
async def home():
    return {"message": "Collaborative Editor API"}


@app.get("/health", status_code=status.HTTP_200_OK)
async def health():
    return {"status": "healthy"}


# Register these routes before the Yjs ASGI mount.
app.include_router(room_router)
app.include_router(chat_router)


# Only Yjs room connections should reach this mount.
from app.websockets.room_validation import room_validation_app

app.mount("/ws", room_validation_app)

# Code execution is intentionally not registered yet (Docker is deferred).
