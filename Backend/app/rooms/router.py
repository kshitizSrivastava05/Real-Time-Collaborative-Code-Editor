
from fastapi import APIRouter, HTTPException, status
from app.rooms import controller

# Create a router for room-related endpoints
room_router = APIRouter(
    prefix="/rooms",
    tags=["Rooms"] #tags=["rooms"] in an API router groups and categorizes those specific endpoints in the automatically generated Swagger UI documentation.
)


# Create a new collaborative room
@room_router.post("/")
def create_new_room():
    room_id = controller.create_room()

    return {
        "message": "Room created successfully",
        "room_id": room_id
    }


# Check whether a room exists
@room_router.get("/{room_id}")
def get_room(room_id: str):
    if not controller.room_exists(room_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )

    return {
        "message": "Room found",
        "room_id": room_id
    }
