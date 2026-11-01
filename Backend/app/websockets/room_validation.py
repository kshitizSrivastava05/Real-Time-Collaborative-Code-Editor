from app.websockets.server import websocket_asgi_app
from app.rooms.controller import room_exists, active_rooms


async def room_validation_app(scope, receive, send):

    if scope["type"] == "websocket":

        room_id = scope["path"].strip("/").split("/")[-1]

        print("WebSocket path:", scope["path"])
        print("Extracted room ID:", room_id)
        print("Active rooms:", active_rooms)

        if not room_exists(room_id):
            print("Room does not exist!")
            await send({
                "type": "websocket.close",
                "code": 1008
            })
            return

        print("Room exists. Allowing connection.")

    await websocket_asgi_app(scope, receive, send)