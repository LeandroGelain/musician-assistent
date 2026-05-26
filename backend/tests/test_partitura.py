from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi.testclient import TestClient

from app.services import partitura_service

SIMPLE_MUSICXML = b"""<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type><voice>1</voice>
      </note>
      <note>
        <chord/>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type><voice>1</voice>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type><voice>1</voice>
      </note>
    </measure>
    <measure number="2">
      <attributes>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>8</duration><type>half</type><voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>
"""

TIMEWISE_MUSICXML = b"""<?xml version="1.0" encoding="UTF-8"?>
<score-timewise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <measure number="1">
    <part id="P1">
      <attributes>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type><voice>1</voice>
      </note>
      <note>
        <chord/>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type><voice>1</voice>
      </note>
      <note>
        <pitch><step>G</step><octave>3</octave></pitch>
        <duration>8</duration><type>half</type><voice>2</voice>
      </note>
    </part>
  </measure>
</score-timewise>
"""

TAB_AND_STAFF_MUSICXML = b"""<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <staves>2</staves>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>TAB</sign><line>5</line></clef>
      </attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type><voice>1</voice><staff>1</staff>
      </note>
      <note>
        <pitch><step>E</step><octave>2</octave></pitch>
        <duration>4</duration><type>quarter</type><voice>1</voice><staff>2</staff>
      </note>
    </measure>
  </part>
</score-partwise>
"""

KEY_AND_CLEF_OCTAVE_MUSICXML = b"""<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Clarinet</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <key><fifths>2</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>
      </attributes>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type><voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>
"""

DOUBLE_DOTTED_NOTE_MUSICXML = b"""<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>7</duration><type>quarter</type><dot/><dot/><voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>
"""


def test_partitura_import_xml_real_notes(authenticated_client: TestClient):
    """Upload a real MusicXML file — events must be parsed without monkeypatching."""
    files = {'pdf_file': ('partitura.xml', SIMPLE_MUSICXML, 'application/xml')}
    data = {'title': 'C Major Chord', 'tempo_bpm': '120', 'time_signature': ''}

    response = authenticated_client.post('/api/partituras/import', files=files, data=data)
    assert response.status_code == 201
    payload = response.json()
    assert payload['parse_status'] == 'parsed', payload['parse_error']
    partitura_id = payload['id']

    detail_response = authenticated_client.get(f'/api/partituras/{partitura_id}')
    assert detail_response.status_code == 200
    detail = detail_response.json()

    events = detail['events']
    marks = detail['measure_marks']
    # C4 + E4 (chord) + G4 + A4 = 4 note events
    assert len(events) == 4

    pitches = {e['note_name'] for e in events}
    assert 'C' in pitches
    assert 'E' in pitches
    assert 'G' in pitches
    assert 'A' in pitches

    # All events must have a valid frequency
    for ev in events:
        assert ev['frequency_hz'] is not None and ev['frequency_hz'] > 0

    # C4 and E4 share the same chord_group
    c_group = next(e['chord_group'] for e in events if e['note_name'] == 'C' and e['measure_number'] == 1)
    e_group = next(e['chord_group'] for e in events if e['note_name'] == 'E' and e['measure_number'] == 1)
    assert c_group == e_group

    # G4 is a separate note (different chord_group from the chord)
    g_group = next(e['chord_group'] for e in events if e['note_name'] == 'G')
    assert g_group != c_group

    # A4 is in measure 2
    a_event = next(e for e in events if e['note_name'] == 'A')
    assert a_event['measure_number'] == 2
    assert a_event['duration_label'] == 'h'

    assert detail['time_signature'] == '3/4'
    assert len(marks) == 2
    assert marks[0]['measure_number'] == 1
    assert marks[0]['clef_sign'] == 'G'
    assert marks[0]['time_signature'] == '3/4'
    assert marks[1]['measure_number'] == 2
    assert marks[1]['clef_sign'] == 'F'


def test_partitura_import_mxl_with_musicxml_root(authenticated_client: TestClient):
    """Upload a compressed MusicXML where root file ends with .musicxml."""
    mxl_buffer = BytesIO()
    with ZipFile(mxl_buffer, mode='w', compression=ZIP_DEFLATED) as archive:
        archive.writestr(
            'META-INF/container.xml',
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
            '  <rootfiles>\n'
            '    <rootfile full-path="score/music.musicxml" media-type="application/vnd.recordare.musicxml+xml"/>\n'
            '  </rootfiles>\n'
            '</container>\n',
        )
        archive.writestr('score/music.musicxml', SIMPLE_MUSICXML)

    files = {'pdf_file': ('partitura.mxl', mxl_buffer.getvalue(), 'application/vnd.recordare.musicxml')}
    data = {'title': 'Gnossienne', 'tempo_bpm': '120', 'time_signature': ''}

    response = authenticated_client.post('/api/partituras/import', files=files, data=data)
    assert response.status_code == 201
    payload = response.json()
    assert payload['parse_status'] == 'parsed', payload['parse_error']


def test_partitura_import_mxl_timewise_with_chord_and_simultaneous_voice(authenticated_client: TestClient):
    """Regression for compressed score-timewise MusicXML with a chord and another voice."""
    mxl_buffer = BytesIO()
    with ZipFile(mxl_buffer, mode='w', compression=ZIP_DEFLATED) as archive:
        archive.writestr(
            'META-INF/container.xml',
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
            '  <rootfiles>\n'
            '    <rootfile full-path="score/timewise.musicxml" media-type="application/vnd.recordare.musicxml+xml"/>\n'
            '  </rootfiles>\n'
            '</container>\n',
        )
        archive.writestr('score/timewise.musicxml', TIMEWISE_MUSICXML)

    files = {'pdf_file': ('partitura.mxl', mxl_buffer.getvalue(), 'application/vnd.recordare.musicxml')}
    data = {'title': 'Timewise Score', 'tempo_bpm': '120', 'time_signature': ''}

    response = authenticated_client.post('/api/partituras/import', files=files, data=data)
    assert response.status_code == 201
    payload = response.json()
    assert payload['parse_status'] == 'parsed', payload['parse_error']


def test_partitura_import_mxl_ignores_tab_staff(authenticated_client: TestClient):
    """MXL import must ignore notes belonging to TAB staff."""
    mxl_buffer = BytesIO()
    with ZipFile(mxl_buffer, mode='w', compression=ZIP_DEFLATED) as archive:
        archive.writestr(
            'META-INF/container.xml',
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
            '  <rootfiles>\n'
            '    <rootfile full-path="score/with_tab.musicxml" media-type="application/vnd.recordare.musicxml+xml"/>\n'
            '  </rootfiles>\n'
            '</container>\n',
        )
        archive.writestr('score/with_tab.musicxml', TAB_AND_STAFF_MUSICXML)

    files = {'pdf_file': ('partitura.mxl', mxl_buffer.getvalue(), 'application/vnd.recordare.musicxml')}
    data = {'title': 'Ignore TAB', 'tempo_bpm': '120', 'time_signature': ''}

    response = authenticated_client.post('/api/partituras/import', files=files, data=data)
    assert response.status_code == 201
    payload = response.json()
    assert payload['parse_status'] == 'parsed', payload['parse_error']

    detail_response = authenticated_client.get(f'/api/partituras/{payload["id"]}')
    assert detail_response.status_code == 200
    detail = detail_response.json()

    assert len(detail['events']) == 1
    assert detail['events'][0]['note_name'] == 'E'
    assert detail['events'][0]['octave'] == 4


def test_partitura_import_xml_parses_key_and_clef_octave(authenticated_client: TestClient):
    files = {'pdf_file': ('partitura.xml', KEY_AND_CLEF_OCTAVE_MUSICXML, 'application/xml')}
    data = {'title': 'Clarinet in D', 'tempo_bpm': '120', 'time_signature': ''}

    response = authenticated_client.post('/api/partituras/import', files=files, data=data)
    assert response.status_code == 201
    payload = response.json()
    assert payload['parse_status'] == 'parsed', payload['parse_error']

    detail_response = authenticated_client.get(f'/api/partituras/{payload["id"]}')
    assert detail_response.status_code == 200
    detail = detail_response.json()

    assert len(detail['measure_marks']) >= 1
    first_mark = detail['measure_marks'][0]
    assert first_mark['measure_number'] == 1
    assert first_mark['key_fifths'] == 2
    assert first_mark['clef_octave_change'] == -1


def test_musicxml_double_dotted_duration_is_calculated_correctly():
    parsed = partitura_service._parse_musicxml_content(
        DOUBLE_DOTTED_NOTE_MUSICXML.decode('utf-8'),
        tempo_bpm=120,
    )

    assert len(parsed.events) == 1
    event = parsed.events[0]
    assert event.duration_label == 'q'
    assert event.duration_beats == 1.75


def test_partitura_import_list_detail_export_delete_flow(
    authenticated_client: TestClient,
    monkeypatch,
):
    monkeypatch.setattr(
        partitura_service,
        '_detect_and_parse',
      lambda *_args, **_kwargs: partitura_service.ParsedScore(
        events=[
          partitura_service.ParsedEvent(
            note_name='C',
            octave=4,
            frequency_hz=261.6256,
            duration_label='q',
            duration_beats=1.0,
            duration_ms=500,
            measure_number=1,
            beat_start=0.0,
            voice=1,
            chord_group=1,
          ),
          partitura_service.ParsedEvent(
            note_name='E',
            octave=4,
            frequency_hz=329.6276,
            duration_label='q',
            duration_beats=1.0,
            duration_ms=500,
            measure_number=1,
            beat_start=0.0,
            voice=1,
            chord_group=1,
          ),
        ],
        measure_marks=[
          partitura_service.ParsedMeasureMark(
            measure_number=1,
            clef_sign='G',
            clef_line=2,
            time_signature='4/4',
          )
        ],
        detected_time_signature='4/4',
      ),
    )

    pdf_bytes = b'%PDF-1.4\n%dummy'
    files = {'pdf_file': ('teste.pdf', pdf_bytes, 'application/pdf')}
    data = {'title': 'Meu Teste', 'tempo_bpm': '120', 'time_signature': '4/4'}

    import_response = authenticated_client.post('/api/partituras/import', files=files, data=data)
    assert import_response.status_code == 201
    payload = import_response.json()
    assert payload['parse_status'] == 'parsed'
    partitura_id = payload['id']

    list_response = authenticated_client.get('/api/partituras')
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1

    detail_response = authenticated_client.get(f'/api/partituras/{partitura_id}')
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert len(detail['events']) == 2
    assert len(detail['measure_marks']) == 1
    assert detail['measure_marks'][0]['clef_sign'] == 'G'
    assert detail['events'][0]['note_name'] == 'C'

    export_response = authenticated_client.get(f'/api/partituras/{partitura_id}/export')
    assert export_response.status_code == 200
    assert 'application/json' in export_response.headers['content-type']
    assert 'events' in export_response.text

    source_response = authenticated_client.get(f'/api/partituras/{partitura_id}/source')
    assert source_response.status_code == 200
    assert 'application/pdf' in source_response.headers['content-type']
    assert source_response.content.startswith(b'%PDF')

    delete_response = authenticated_client.delete(f'/api/partituras/{partitura_id}')
    assert delete_response.status_code == 204

    final_list = authenticated_client.get('/api/partituras')
    assert final_list.status_code == 200
    assert final_list.json() == []


def test_partitura_import_rejects_unsupported_format(authenticated_client: TestClient):
    files = {'pdf_file': ('teste.txt', b'nao pdf', 'text/plain')}
    data = {'title': 'Invalido', 'tempo_bpm': '120', 'time_signature': '4/4'}

    response = authenticated_client.post('/api/partituras/import', files=files, data=data)
    assert response.status_code == 400
