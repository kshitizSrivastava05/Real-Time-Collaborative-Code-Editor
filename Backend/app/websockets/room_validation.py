from app.websockets.server import websocket_asgi_app
from app.rooms.controller import room_exists


async def room_validation_app(scope, receive, send):
    """Validate and forward only Yjs WebSocket connections at /ws/{room_id}."""

    if scope["type"] != "websocket":
        await send({
            "type": "http.response.start",
            "status": 404,
            "headers": [(b"content-type", b"text/plain; charset=utf-8")],
        })
        await send({"type": "http.response.body", "body": b"Not Found"})
        return

    parts = [part for part in scope.get("path", "").split("/") if part]

    # Starlette may expose the full path or a mount-stripped path.
    if len(parts) == 2 and parts[0] == "ws":
        room_id = parts[1]
    elif (
        len(parts) == 1
        and scope.get("root_path", "").rstrip("/").endswith("/ws")
    ):
        room_id = parts[0]
    else:
        await send({
            "type": "websocket.close",
            "code": 1008,
            "reason": "Unsupported Yjs path. Expected /ws/{room_id}.",
        })
        return

    if not room_exists(room_id):
        await send({
            "type": "websocket.close",
            "code": 1008,
            "reason": "Room does not exist.",
        })
        return

    await websocket_asgi_app(scope, receive, send)
