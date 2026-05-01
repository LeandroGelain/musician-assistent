from fastapi.testclient import TestClient


def test_auth_flow_register_me_logout(client: TestClient):
    payload = {
        'name': 'Leandro',
        'email': 'leandro@example.com',
        'phone': '11988887777',
        'password': 'secret123',
    }

    register_response = client.post('/api/auth/register', json=payload)
    assert register_response.status_code == 200
    assert register_response.json()['email'] == payload['email']

    me_response = client.get('/api/auth/me')
    assert me_response.status_code == 200
    assert me_response.json()['name'] == payload['name']

    logout_response = client.post('/api/auth/logout')
    assert logout_response.status_code == 204

    unauthorized_me = client.get('/api/auth/me')
    assert unauthorized_me.status_code == 401
