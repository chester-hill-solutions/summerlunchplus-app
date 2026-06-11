from app.transforms import transform_meetings, transform_participants


MEETINGS_DATA = {
    "meetings": [
        {"id": "111", "topic": "Standup", "duration": 30}
    ]
}

PARTICIPANTS_DATA = {
    "participants": [
        {"name": "Alice", "user_email": "alice@example.com", "duration": 1800}
    ]
}


def test_transform_meetings_passthrough():
    assert transform_meetings(MEETINGS_DATA) == MEETINGS_DATA


def test_transform_meetings_empty():
    assert transform_meetings({}) == {}


def test_transform_participants_passthrough():
    assert transform_participants(PARTICIPANTS_DATA) == PARTICIPANTS_DATA


def test_transform_participants_empty():
    assert transform_participants({}) == {}
