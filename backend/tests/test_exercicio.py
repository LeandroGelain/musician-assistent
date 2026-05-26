import zipfile

import pytest
from fastapi.testclient import TestClient


def test_generate_exercicio(authenticated_client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr('app.core.config.get_settings', lambda: type('S', (), {
        'score_storage_dir': str(tmp_path),
        'database_url': 'sqlite:///./test.db',
        'secret_key': 'test',
        'access_token_expire_minutes': 60,
        'cors_origins': 'http://localhost',
    })()
)

    payload = {
        'scale': 'C',
        'tempo_bpm': 90,
        'num_measures': 4,
        'time_signature': '4/4',
    }

    response = authenticated_client.post('/api/exercicios/generate', json=payload)
    assert response.status_code == 201

    data = response.json()
    assert data['scale'] == 'C'
    assert data['tempo_bpm'] == 90
    assert data['num_measures'] == 4
    assert data['time_signature'] == '4/4'
    assert 'id' in data


def test_generate_and_list_exercicios(authenticated_client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr('app.core.config.get_settings', lambda: type('S', (), {
        'score_storage_dir': str(tmp_path),
        'database_url': 'sqlite:///./test.db',
        'secret_key': 'test',
        'access_token_expire_minutes': 60,
        'cors_origins': 'http://localhost',
    })()
)

    for _ in range(3):
        authenticated_client.post('/api/exercicios/generate', json={
            'scale': 'C', 'tempo_bpm': 80, 'num_measures': 2, 'time_signature': '4/4',
        })

    list_response = authenticated_client.get('/api/exercicios')
    assert list_response.status_code == 200
    items = list_response.json()
    assert len(items) == 3


def test_get_exercicio_detail(authenticated_client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr('app.core.config.get_settings', lambda: type('S', (), {
        'score_storage_dir': str(tmp_path),
        'database_url': 'sqlite:///./test.db',
        'secret_key': 'test',
        'access_token_expire_minutes': 60,
        'cors_origins': 'http://localhost',
    })()
)

    create_resp = authenticated_client.post('/api/exercicios/generate', json={
        'scale': 'G', 'tempo_bpm': 100, 'num_measures': 4, 'time_signature': '4/4',
    })
    assert create_resp.status_code == 201
    exercicio_id = create_resp.json()['id']

    get_resp = authenticated_client.get(f'/api/exercicios/{exercicio_id}')
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data['id'] == exercicio_id
    assert data['scale'] == 'G'

    not_found = authenticated_client.get('/api/exercicios/99999')
    assert not_found.status_code == 404


def test_exercicio_source_download(authenticated_client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr('app.core.config.get_settings', lambda: type('S', (), {
        'score_storage_dir': str(tmp_path),
        'database_url': 'sqlite:///./test.db',
        'secret_key': 'test',
        'access_token_expire_minutes': 60,
        'cors_origins': 'http://localhost',
    })()
)

    create_resp = authenticated_client.post('/api/exercicios/generate', json={
        'scale': 'C', 'tempo_bpm': 80, 'num_measures': 4, 'time_signature': '4/4',
    })
    exercicio_id = create_resp.json()['id']

    source_resp = authenticated_client.get(f'/api/exercicios/{exercicio_id}/source')
    assert source_resp.status_code == 200
    content = source_resp.content
    assert len(content) > 0
    # MXL is a ZIP — verify it contains valid MusicXML
    import io
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        names = zf.namelist()
        assert any(name.endswith('.xml') for name in names)
        xml_name = next(n for n in names if n.endswith('.xml'))
        xml_bytes = zf.read(xml_name)
        assert b'score-partwise' in xml_bytes
        assert b'<step>C</step>' in xml_bytes


def test_delete_exercicio(authenticated_client: TestClient, tmp_path, monkeypatch):
    monkeypatch.setattr('app.core.config.get_settings', lambda: type('S', (), {
        'score_storage_dir': str(tmp_path),
        'database_url': 'sqlite:///./test.db',
        'secret_key': 'test',
        'access_token_expire_minutes': 60,
        'cors_origins': 'http://localhost',
    })()
)

    create_resp = authenticated_client.post('/api/exercicios/generate', json={
        'scale': 'C', 'tempo_bpm': 80, 'num_measures': 4, 'time_signature': '4/4',
    })
    exercicio_id = create_resp.json()['id']

    delete_resp = authenticated_client.delete(f'/api/exercicios/{exercicio_id}')
    assert delete_resp.status_code == 204

    get_resp = authenticated_client.get(f'/api/exercicios/{exercicio_id}')
    assert get_resp.status_code == 404

    # Deleting again should 404
    delete_again = authenticated_client.delete(f'/api/exercicios/{exercicio_id}')
    assert delete_again.status_code == 404


def test_generate_mxl_structure():
    """Unit test: verify MXL byte structure without HTTP."""
    from app.services.exercicio_service import _build_mxl_bytes, _build_musicxml

    notes = [('C', 4), ('D', 4), ('E', 4), ('F', 4)]
    xml = _build_musicxml(notes, 80, '4/4', 1)
    assert '<score-partwise' in xml
    assert '<step>C</step>' in xml

    mxl = _build_mxl_bytes(xml)
    import io
    with zipfile.ZipFile(io.BytesIO(mxl)) as zf:
        assert 'META-INF/container.xml' in zf.namelist()
        container = zf.read('META-INF/container.xml').decode()
        assert 'rootfile' in container
