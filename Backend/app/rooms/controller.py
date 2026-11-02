from datetime import datetime, timezone
from threading import RLock
from uuid import uuid4

active_rooms: dict[str, dict] = {}
_rooms_lock = RLock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize_room(room: dict, user_id: str) -> dict:
    return {
        "room_id": room["room_id"],
        "name": room["name"],
        "created_by": room["created_by"],
        "created_at": room["created_at"],
        "member_count": len(room["members"]),
        "role": "owner" if room["created_by"] == user_id else "member",
    }


def create_room(owner_id: str, name: str) -> dict:
    clean_name = name.strip()
    if not clean_name:
        raise ValueError("Room name cannot be empty.")

    room_id = uuid4().hex[:10]
    with _rooms_lock:
        room = {
            "room_id": room_id,
            "name": clean_name,
            "created_by": owner_id,
            "created_at": _now(),
            "members": {owner_id},
            "saved_by": set(),
        }
        active_rooms[room_id] = room
        return _serialize_room(room, owner_id)


def room_exists(room_id: str) -> bool:
    with _rooms_lock:
        return room_id in active_rooms


def get_room(room_id: str) -> dict | None:
    with _rooms_lock:
        room = active_rooms.get(room_id)
        if room is None:
            return None
        return {
            "room_id": room["room_id"],
            "name": room["name"],
            "created_by": room["created_by"],
            "created_at": room["created_at"],
            "member_count": len(room["members"]),
        }


def list_created_rooms(owner_id: str) -> list[dict]:
    with _rooms_lock:
        rooms = [
            _serialize_room(room, owner_id)
            for room in active_rooms.values()
            if room["created_by"] == owner_id
        ]
    return sorted(rooms, key=lambda item: item["created_at"], reverse=True)


def list_saved_rooms(user_id: str) -> list[dict]:
    with _rooms_lock:
        rooms = [
            _serialize_room(room, user_id)
            for room in active_rooms.values()
            if user_id in room["saved_by"]
        ]
    return sorted(rooms, key=lambda item: item["created_at"], reverse=True)


def join_room(room_id: str, user_id: str) -> dict | None:
    with _rooms_lock:
        room = active_rooms.get(room_id)
        if room is None:
            return None

        room["members"].add(user_id)
        if room["created_by"] != user_id:
            room["saved_by"].add(user_id)

        return _serialize_room(room, user_id)


def remove_saved_room(room_id: str, user_id: str) -> bool:
    with _rooms_lock:
        room = active_rooms.get(room_id)
        if room is None or user_id not in room["saved_by"]:
            return False

        room["saved_by"].discard(user_id)
        return True


def delete_room(room_id: str, requester_id: str) -> str:
    with _rooms_lock:
        room = active_rooms.get(room_id)
        if room is None:
            return "not_found"
        if room["created_by"] != requester_id:
            return "forbidden"

        del active_rooms[room_id]
        return "deleted"
