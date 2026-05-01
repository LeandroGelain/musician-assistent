import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

TEST_DB_PATH = Path(__file__).parent / 'test.db'
os.environ['DATABASE_URL'] = f"sqlite:///{TEST_DB_PATH.as_posix()}"
os.environ['CORS_ORIGINS'] = 'http://localhost:5173'

from app.core.config import clear_settings_cache
from app.db import init_db, reset_db_state
from app.main import app


@pytest.fixture(autouse=True)
def isolated_database():
    clear_settings_cache()
    reset_db_state()
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()
    init_db()
    yield
    reset_db_state()
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def authenticated_client(client: TestClient):
    payload = {
        'name': 'Teste Usuario',
        'email': 'teste@example.com',
        'phone': '11999999999',
        'password': 'secret123',
    }
    response = client.post('/api/auth/register', json=payload)
    assert response.status_code == 200
    return client
