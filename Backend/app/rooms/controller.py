# Import uuid4 to generate unique identifiers
from uuid import uuid4

# Store the IDs of rooms created during this server session
active_rooms = set()


# Generate and register a new room
def create_room():
    room_id = uuid4().hex[:10]
    active_rooms.add(room_id)
    return room_id


# Check whether a room exists
def room_exists(room_id: str):
    return room_id in active_rooms