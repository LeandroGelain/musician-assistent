from fastapi.testclient import TestClient


def test_afinador_default_and_update(authenticated_client: TestClient):
    first_response = authenticated_client.get('/api/afinador/settings')
    assert first_response.status_code == 200
    assert first_response.json() == {
        'reference_frequency': 440.0,
        'instrument': 'Violao',
    }

    update_payload = {
        'reference_frequency': 442.0,
        'instrument': 'Guitarra',
    }
    update_response = authenticated_client.put(
        '/api/afinador/settings',
        json=update_payload,
    )
    assert update_response.status_code == 200
    assert update_response.json() == update_payload

    second_response = authenticated_client.get('/api/afinador/settings')
    assert second_response.status_code == 200
    assert second_response.json() == update_payload
