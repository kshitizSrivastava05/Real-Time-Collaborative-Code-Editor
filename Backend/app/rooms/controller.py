from uuid import uuid4

active_rooms = set()

def create_room():
    room_id = uuid4().hex[:10]
    active_rooms.add(room_id)
    return room_id

def room_exists(room_id: str):
    return room_id in active_rooms

def delete_room(room_id: str):
    if room_id in active_rooms:
        active_rooms.remove(room_id)
        return True
    return False