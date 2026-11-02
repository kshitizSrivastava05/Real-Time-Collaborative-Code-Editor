from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.rooms import controller

room_router = APIRouter(prefix="/rooms", tags=["Rooms"])


class CreateRoomRequest(BaseModel):
    name: str = Field(min_length=1, max_length=48)


def validate_guest_id(guest_id: str) -> str:
    value = guest_id.strip()
    if not 8 <= len(value) <= 128:
        raise HTTPException(
            status_code=400,
            detail="Invalid guest profile. Refresh the page and try again.",
        )
    return value


@room_router.post("/", status_code=status.HTTP_201_CREATED)
def create_new_room(
    payload: CreateRoomRequest,
    guest_id: str = Header(..., alias="X-Guest-ID"),
):
    owner_id = validate_guest_id(guest_id)
    room = controller.create_room(owner_id=owner_id, name=payload.name)
    return {"message": "Room created successfully", **room}


@room_router.get("/created")
def get_created_rooms(
    guest_id: str = Header(..., alias="X-Guest-ID"),
):
    return {
        "rooms": controller.list_created_rooms(validate_guest_id(guest_id))
    }


@room_router.get("/saved")
def get_saved_rooms(
    guest_id: str = Header(..., alias="X-Guest-ID"),
):
    return {
        "rooms": controller.list_saved_rooms(validate_guest_id(guest_id))
    }


@room_router.post("/{room_id}/join")
def join_existing_room(
    room_id: str,
    guest_id: str = Header(..., alias="X-Guest-ID"),
):
    room = controller.join_room(room_id, validate_guest_id(guest_id))
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found.")
    return {"message": "Room joined successfully", **room}


@room_router.delete("/{room_id}/saved")
def remove_room_from_saved(
    room_id: str,
    guest_id: str = Header(..., alias="X-Guest-ID"),
):
    removed = controller.remove_saved_room(
        room_id, validate_guest_id(guest_id)
    )
    if not removed:
        raise HTTPException(
            status_code=404,
            detail="This room is not in your Saved Rooms list.",
        )
    return {
        "message": (
            "Removed from your Saved Rooms list. "
            "The source room was not deleted."
        )
    }


@room_router.get("/{room_id}")
def get_room(room_id: str):
    room = controller.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found.")
    return {"message": "Room found", **room}


@room_router.delete("/{room_id}")
def delete_owned_room(
    room_id: str,
    guest_id: str = Header(..., alias="X-Guest-ID"),
):
    result = controller.delete_room(
        room_id, validate_guest_id(guest_id)
    )
    if result == "not_found":
        raise HTTPException(status_code=404, detail="Room not found.")
    if result == "forbidden":
        raise HTTPException(
            status_code=403,
            detail="Only the room creator can delete this room.",
        )
    return {"message": "Room deleted successfully for all members."}
