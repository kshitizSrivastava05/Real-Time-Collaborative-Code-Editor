import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class RoomChatManager:
    def __init__(self, history_limit: int = 200):
        self.connections: dict[str, set[WebSocket]] = defaultdict(set)
        self.history: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.history_limit = history_limit
        self._lock = asyncio.Lock()

    async def connect(self, room_id: str, websocket: WebSocket) -> None:
        await websocket.accept()

        # Register and send history under the same lock so a newly arriving
        # message cannot overtake the initial history payload.
        async with self._lock:
            self.connections[room_id].add(websocket)
            await websocket.send_json({
                "type": "history",
                "messages": list(self.history[room_id]),
            })

    async def disconnect(self, room_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            room_connections = self.connections.get(room_id)
            if room_connections is not None:
                room_connections.discard(websocket)
                if not room_connections:
                    self.connections.pop(room_id, None)

    async def broadcast_message(
        self,
        room_id: str,
        message: dict[str, Any],
    ) -> None:
        payload = {"type": "message", "message": message}

        async with self._lock:
            history = self.history[room_id]
            history.append(message)
            if len(history) > self.history_limit:
                del history[:-self.history_limit]

            recipients = list(self.connections.get(room_id, set()))

        stale_connections = []
        for connection in recipients:
            try:
                await connection.send_json(payload)
            except Exception:
                stale_connections.append(connection)

        for connection in stale_connections:
            await self.disconnect(room_id, connection)

    async def room_connection_count(self, room_id: str) -> int:
        async with self._lock:
            return len(self.connections.get(room_id, set()))


chat_manager = RoomChatManager(history_limit=200)
