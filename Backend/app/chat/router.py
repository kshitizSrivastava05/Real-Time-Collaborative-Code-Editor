import re
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.rooms import controller
from app.chat.manager import chat_manager


chat_router = APIRouter(tags=["Room Chat"])

SAFE_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
MAX_MESSAGE_LENGTH = 2000


@chat_router.websocket("/ws/chat/{room_id}")
async def room_chat(
    websocket: WebSocket,
    room_id: str,
    guest_id: str = Query(..., min_length=8, max_length=128),
    display_name: str = Query(default="Guest", max_length=32),
    display_color: str = Query(default="#64748B", max_length=7),
):
    user_id = guest_id.strip()

    # This is a prototype membership check using the existing in-memory room
    # controller. Replace guest_id with authenticated identity after auth exists.
    if not controller.is_room_member(room_id, user_id):
        await websocket.close(code=1008, reason="Room membership required")
        return

    clean_name = " ".join(display_name.split()).strip()[:32] or "Guest"
    clean_color = (
        display_color
        if SAFE_COLOR.fullmatch(display_color)
        else "#64748B"
    )

    await chat_manager.connect(room_id, websocket)

    try:
        while True:
            payload = await websocket.receive_json()

            if not isinstance(payload, dict):
                await websocket.send_json({
                    "type": "error",
                    "message": "Invalid chat payload.",
                })
                continue

            if payload.get("type") != "message":
                continue

            content = payload.get("content")
            if not isinstance(content, str):
                await websocket.send_json({
                    "type": "error",
                    "message": "Message must be text.",
                })
                continue

            content = content.strip()
            if not content:
                continue

            if len(content) > MAX_MESSAGE_LENGTH:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Messages must be {MAX_MESSAGE_LENGTH} characters or fewer.",
                })
                continue

            # Re-check membership before accepting each message. This prevents
            # a client removed from the room from continuing to chat.
            if not controller.is_room_member(room_id, user_id):
                await websocket.send_json({
                    "type": "error",
                    "message": "You are no longer a member of this room.",
                })
                await websocket.close(code=1008, reason="Room membership revoked")
                return

            message = {
                "id": uuid4().hex,
                "room_id": room_id,
                "sender_id": user_id,
                "sender_name": clean_name,
                "sender_color": clean_color,
                "content": content,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

            await chat_manager.broadcast_message(room_id, message)

    except WebSocketDisconnect:
        pass
    finally:
        await chat_manager.disconnect(room_id, websocket)
