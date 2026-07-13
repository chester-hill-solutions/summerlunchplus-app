import os

os.environ.setdefault("ZOOM_ACCOUNT_ID", "test_account_id")
os.environ.setdefault("ZOOM_CLIENT_ID", "test_client_id")
os.environ.setdefault("ZOOM_CLIENT_SECRET", "test_client_secret")
os.environ.setdefault("API_KEY", "test-api-key")

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.main import app
from app import cache as cache_module

API_KEY = "test-api-key"


@pytest.fixture(autouse=True)
def clear_caches():
    cache_module._past_meetings_cache.clear()
    cache_module._participants_cache.clear()
    main_module._zoom_client = None
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def headers():
    return {"Authorization": f"Bearer {API_KEY}"}
