from fastapi.testclient import TestClient


def test_repertorio_crud_flow(authenticated_client: TestClient):
    create_payload = {
        'title': 'Autumn Leaves',
        'artist': 'Chet Baker',
        'notes': 'Tom de G menor',
    }

    create_response = authenticated_client.post('/api/repertorio', json=create_payload)
    assert create_response.status_code == 201
    item_id = create_response.json()['id']

    list_response = authenticated_client.get('/api/repertorio')
    assert list_response.status_code == 200
    items = list_response.json()
    assert len(items) == 1
    assert items[0]['title'] == 'Autumn Leaves'

    delete_response = authenticated_client.delete(f'/api/repertorio/{item_id}')
    assert delete_response.status_code == 204

    final_list = authenticated_client.get('/api/repertorio')
    assert final_list.status_code == 200
    assert final_list.json() == []
