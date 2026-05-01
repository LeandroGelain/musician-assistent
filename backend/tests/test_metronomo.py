from fastapi.testclient import TestClient


def test_metronomo_default_and_update(authenticated_client: TestClient):
    first_response = authenticated_client.get('/api/metronomo/settings')
    assert first_response.status_code == 200
    assert first_response.json() == {'bpm': 90, 'beats_per_bar': 4}

    update_payload = {'bpm': 132, 'beats_per_bar': 3}
    update_response = authenticated_client.put(
        '/api/metronomo/settings',
        json=update_payload,
    )
    assert update_response.status_code == 200
    assert update_response.json() == update_payload

    second_response = authenticated_client.get('/api/metronomo/settings')
    assert second_response.status_code == 200
    assert second_response.json() == update_payload
