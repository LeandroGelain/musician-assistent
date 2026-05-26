from __future__ import annotations

import json
import re
import shutil
import uuid
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.models.partitura import Partitura, PartituraEvent, PartituraMeasureMark

ACCEPTED_EXTENSIONS = {'.pdf', '.xml', '.mxl'}

_MUSICXML_INNER_EXTENSIONS = ('.xml', '.musicxml')

_DURATION_TYPE_TO_BEATS: dict[str, float] = {
    'maxima': 32.0,
    'long': 16.0,
    'breve': 8.0,
    'whole': 4.0,
    'half': 2.0,
    'quarter': 1.0,
    'eighth': 0.5,
    '16th': 0.25,
    '32nd': 0.125,
    '64th': 0.0625,
}

_DURATION_TYPE_TO_LABEL: dict[str, str] = {
    'whole': 'w',
    'half': 'h',
    'quarter': 'q',
    'eighth': 'e',
    '16th': 's',
    '32nd': 's',
    '64th': 's',
}

_SEMITONE_MAP: dict[str, int] = {
    'C': 0, 'C#': 1, 'Db': 1,
    'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
    'G': 7, 'G#': 8, 'Ab': 8,
    'A': 9, 'A#': 10, 'Bb': 10,
    'B': 11,
}


@dataclass
class ParsedEvent:
    note_name: str
    octave: int
    frequency_hz: float | None
    duration_label: str
    duration_beats: float
    duration_ms: int
    measure_number: int
    beat_start: float
    voice: int
    chord_group: int
    event_type: str = field(default='note')


@dataclass
class ParsedMeasureMark:
    measure_number: int
    clef_sign: str
    clef_line: int
    time_signature: str
    key_fifths: int = 0
    clef_octave_change: int = 0


@dataclass
class ParsedScore:
    events: list[ParsedEvent]
    measure_marks: list[ParsedMeasureMark]
    detected_time_signature: str | None = None


def _duration_to_ms(duration_beats: float, tempo_bpm: int) -> int:
    return int(round((60_000 / tempo_bpm) * duration_beats))


def _normalize_time_signature(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if not re.match(r'^\d+/\d+$', cleaned):
        return None
    return cleaned


def _note_to_frequency(note_name: str, octave: int, reference_a: float = 440.0) -> float:
    key = note_name[0].upper()
    accidental = note_name[1:]
    token = f'{key}{accidental}'
    semitone = _SEMITONE_MAP[token]
    midi = (octave + 1) * 12 + semitone
    return reference_a * (2 ** ((midi - 69) / 12))


# ---------------------------------------------------------------------------
# MusicXML parser (handles both .xml and MusicXML embedded inside PDF/.mxl)
# ---------------------------------------------------------------------------

def _xml_tag(ns_prefix: str, name: str) -> str:
    return f'{ns_prefix}{name}' if ns_prefix else name


def _local_tag_name(tag: str) -> str:
    return tag.split('}', 1)[1] if tag.startswith('{') else tag


def _is_tab_part_name(value: str | None) -> bool:
    if not value:
        return False
    normalized = value.strip().lower()
    return 'tab' in normalized or 'tablature' in normalized


def _extract_tab_staff_numbers(attributes_elem: ET.Element, t) -> set[int]:
    tab_staffs: set[int] = set()
    for clef_elem in attributes_elem.findall(t('clef')):
        sign = (clef_elem.findtext(t('sign')) or '').strip().upper()
        if sign != 'TAB':
            continue
        number_raw = (clef_elem.get('number') or '1').strip()
        tab_staffs.add(int(number_raw) if number_raw.isdigit() else 1)
    return tab_staffs


def _parse_musicxml_content(xml_content: str, tempo_bpm: int) -> ParsedScore:
    """Parse a MusicXML string into score metadata and events."""
    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as exc:
        raise ValueError(f'MusicXML inválido: {exc}') from exc

    # Detect namespace (some exporters include it, others don't)
    ns = ''
    if root.tag.startswith('{'):
        ns = root.tag.split('}')[0] + '}'

    def t(name: str) -> str:
        return f'{ns}{name}'

    events: list[ParsedEvent] = []
    measure_marks: list[ParsedMeasureMark] = []
    order_index = 0
    chord_group_counter = 0
    active_time_signature: str | None = None
    active_clef_sign = 'G'
    active_clef_line = 2
    active_key_fifths = 0
    active_clef_octave_change = 0
    has_any_mark = False

    tab_part_ids: set[str] = set()
    for score_part in root.findall(f'.//{t("score-part")}'):
        part_id = score_part.get('id') or ''
        part_name = (score_part.findtext(t('part-name')) or '').strip()
        part_abbrev = (score_part.findtext(t('part-abbreviation')) or '').strip()
        if part_id and (_is_tab_part_name(part_name) or _is_tab_part_name(part_abbrev)):
            tab_part_ids.add(part_id)

    active_tab_staff_by_part: dict[str, set[int]] = {}

    score_format = _local_tag_name(root.tag)
    if score_format == 'score-timewise':
        measure_groups = [
            (measure_elem, measure_elem.findall(t('part')), '')
            for measure_elem in root.findall(t('measure'))
        ]
    else:
        measure_groups = []
        for part in root.findall(f'.//{t("part")}'):
            part_id = part.get('id') or ''
            measure_groups.extend((measure_elem, [measure_elem], part_id) for measure_elem in part.findall(t('measure')))

    for measure_elem, note_parents, measure_part_id in measure_groups:
        if not note_parents:
            continue

        measure_number = int(measure_elem.get('number', '1'))
        measure_time_signature: str | None = None
        measure_clef_sign: str | None = None
        measure_clef_line: int | None = None
        measure_key_fifths: int | None = None
        measure_clef_octave_change: int | None = None

        attributes_elem = None
        for note_parent in note_parents:
            attributes_elem = note_parent.find(t('attributes'))
            if attributes_elem is not None:
                break
        if attributes_elem is None:
            attributes_elem = measure_elem.find(t('attributes'))

        if attributes_elem is not None:
            time_elem = attributes_elem.find(t('time'))
            if time_elem is not None:
                beats = (time_elem.findtext(t('beats')) or '').strip()
                beat_type = (time_elem.findtext(t('beat-type')) or '').strip()
                candidate_signature = _normalize_time_signature(f'{beats}/{beat_type}')
                if candidate_signature:
                    measure_time_signature = candidate_signature

            key_elem = attributes_elem.find(t('key'))
            if key_elem is not None:
                fifths_raw = (key_elem.findtext(t('fifths')) or '').strip()
                if re.match(r'^-?\d+$', fifths_raw):
                    measure_key_fifths = int(fifths_raw)

            clef_elem = attributes_elem.find(t('clef'))
            if clef_elem is not None:
                clef_sign = (clef_elem.findtext(t('sign')) or '').strip().upper()
                clef_line_raw = (clef_elem.findtext(t('line')) or '').strip()
                clef_octave_change_raw = (
                    (clef_elem.findtext(t('clef-octave-change')) or '').strip()
                    or (clef_elem.findtext(t('octave-change')) or '').strip()
                )
                if clef_sign in {'G', 'F', 'C'}:
                    measure_clef_sign = clef_sign
                if clef_line_raw.isdigit():
                    measure_clef_line = int(clef_line_raw)
                if re.match(r'^-?\d+$', clef_octave_change_raw):
                    measure_clef_octave_change = int(clef_octave_change_raw)

        mark_changed = False
        if measure_time_signature and measure_time_signature != active_time_signature:
            active_time_signature = measure_time_signature
            mark_changed = True

        if measure_clef_sign and measure_clef_sign != active_clef_sign:
            active_clef_sign = measure_clef_sign
            mark_changed = True

        if measure_clef_line and measure_clef_line != active_clef_line:
            active_clef_line = measure_clef_line
            mark_changed = True

        if measure_key_fifths is not None and measure_key_fifths != active_key_fifths:
            active_key_fifths = measure_key_fifths
            mark_changed = True

        if measure_clef_octave_change is not None and measure_clef_octave_change != active_clef_octave_change:
            active_clef_octave_change = measure_clef_octave_change
            mark_changed = True

        if not has_any_mark:
            mark_changed = True

        if mark_changed:
            measure_marks.append(
                ParsedMeasureMark(
                    measure_number=measure_number,
                    clef_sign=active_clef_sign,
                    clef_line=active_clef_line,
                    time_signature=active_time_signature or '4/4',
                    key_fifths=active_key_fifths,
                    clef_octave_change=active_clef_octave_change,
                )
            )
            has_any_mark = True

        # Reset per measure: beat_start is relative to each measure start.
        # In timewise scores, the same voice number can appear in multiple parts,
        # so beat tracking uses a part+voice key to keep simultaneous lines separate.
        voice_beat: dict[tuple[str, int, int], float] = {}
        voice_chord_anchor: dict[tuple[str, int, int], float] = {}

        for note_parent in note_parents:
            part_id = note_parent.get('id') or measure_part_id

            parent_attributes = note_parent.find(t('attributes'))
            if parent_attributes is not None:
                tab_staffs = _extract_tab_staff_numbers(parent_attributes, t)
                if tab_staffs:
                    existing = active_tab_staff_by_part.setdefault(part_id, set())
                    existing.update(tab_staffs)

            if part_id in tab_part_ids:
                continue

            tab_staffs_for_part = active_tab_staff_by_part.get(part_id, set())
            for note_elem in note_parent.findall(t('note')):
                # Skip grace notes — they have no rhythmic value
                if note_elem.find(t('grace')) is not None:
                    continue

                is_chord = note_elem.find(t('chord')) is not None
                is_rest = note_elem.find(t('rest')) is not None

                # Voice (default 1)
                voice_elem = note_elem.find(t('voice'))
                voice = int(voice_elem.text or '1') if voice_elem is not None else 1

                staff_number: int | None = None
                staff_elem = note_elem.find(t('staff'))
                if staff_elem is not None:
                    staff_raw = (staff_elem.text or '').strip()
                    if staff_raw.isdigit():
                        staff_number = int(staff_raw)

                if staff_number is not None and staff_number in tab_staffs_for_part:
                    continue

                voice_key = (part_id, staff_number or 1, voice)

                if voice_key not in voice_beat:
                    voice_beat[voice_key] = 0.0
                    voice_chord_anchor[voice_key] = 0.0

                # Duration type → beats
                type_elem = note_elem.find(t('type'))
                duration_type = (type_elem.text or 'quarter') if type_elem is not None else 'quarter'
                duration_beats = _DURATION_TYPE_TO_BEATS.get(duration_type, 1.0)
                duration_label = _DURATION_TYPE_TO_LABEL.get(duration_type, 'q')

                # Augmentation dots
                dots = len(note_elem.findall(t('dot')))
                if dots:
                    base_duration = duration_beats
                    dot_add = 0.5
                    for _ in range(dots):
                        duration_beats += base_duration * dot_add
                        dot_add /= 2

                # Beat position
                if is_chord:
                    beat_start = voice_chord_anchor[voice_key]
                    chord_group = chord_group_counter
                else:
                    beat_start = voice_beat[voice_key]
                    chord_group_counter += 1
                    chord_group = chord_group_counter
                    voice_chord_anchor[voice_key] = beat_start

                if not is_chord:
                    voice_beat[voice_key] += duration_beats

                if is_rest:
                    order_index += 1
                    continue

                pitch_elem = note_elem.find(t('pitch'))
                if pitch_elem is None:
                    continue

                step_elem = pitch_elem.find(t('step'))
                octave_elem = pitch_elem.find(t('octave'))
                alter_elem = pitch_elem.find(t('alter'))

                step = (step_elem.text or 'C').strip().upper() if step_elem is not None else 'C'
                octave = int(octave_elem.text or '4') if octave_elem is not None else 4
                alter = float(alter_elem.text or '0') if alter_elem is not None else 0.0

                if alter >= 1.0:
                    note_name = f'{step}#'
                elif alter <= -1.0:
                    note_name = f'{step}b'
                else:
                    note_name = step

                try:
                    frequency: float | None = round(_note_to_frequency(note_name, octave), 4)
                except (KeyError, ValueError):
                    frequency = None

                events.append(
                    ParsedEvent(
                        note_name=note_name,
                        octave=octave,
                        frequency_hz=frequency,
                        duration_label=duration_label,
                        duration_beats=round(duration_beats, 6),
                        duration_ms=_duration_to_ms(duration_beats, tempo_bpm),
                        measure_number=measure_number,
                        beat_start=round(beat_start, 6),
                        voice=voice,
                        chord_group=chord_group,
                    )
                )
                order_index += 1

    return ParsedScore(
        events=events,
        measure_marks=measure_marks,
        detected_time_signature=active_time_signature,
    )


def _extract_tempo_from_musicxml(xml_content: str) -> int | None:
    """Try to read the first <sound tempo="…"> value from a MusicXML string."""
    try:
        root = ET.fromstring(xml_content)
        ns = root.tag.split('}')[0] + '}' if root.tag.startswith('{') else ''
        for sound in root.iter(f'{ns}sound'):
            tempo_str = sound.get('tempo')
            if tempo_str:
                return int(float(tempo_str))
    except Exception:
        pass
    return None


def _parse_mxl_file(file_path: Path, tempo_bpm: int) -> ParsedScore:
    """Parse a compressed MusicXML (.mxl) file."""
    with zipfile.ZipFile(str(file_path), 'r') as zf:
        xml_content: str | None = None

        # Try container.xml to locate the root file
        try:
            container = zf.read('META-INF/container.xml').decode('utf-8', errors='replace')
            container_root = ET.fromstring(container)
            for elem in container_root.iter():
                full_path = elem.get('full-path') or elem.get('fullPath') or ''
                if full_path and full_path.lower().endswith(_MUSICXML_INNER_EXTENSIONS):
                    try:
                        xml_content = zf.read(full_path).decode('utf-8', errors='replace')
                        break
                    except KeyError:
                        pass
        except Exception:
            pass

        # Fallback: pick first XML inside the zip that looks like MusicXML
        if xml_content is None:
            for name in sorted(zf.namelist()):
                if name.lower().endswith(_MUSICXML_INNER_EXTENSIONS) and 'meta-inf' not in name.lower():
                    try:
                        candidate = zf.read(name).decode('utf-8', errors='replace')
                        if '<score-partwise' in candidate or '<score-timewise' in candidate:
                            xml_content = candidate
                            break
                    except Exception:
                        continue

    if xml_content is None:
        raise ValueError('Arquivo .mxl não contém MusicXML válido')

    extracted_tempo = _extract_tempo_from_musicxml(xml_content)
    return _parse_musicxml_content(xml_content, extracted_tempo or tempo_bpm)


def _try_extract_embedded_musicxml_from_pdf(pdf_path: Path) -> str | None:
    """
    Some notation software (e.g. MuseScore ≤3) embeds MusicXML as an attachment
    or as raw bytes inside the PDF stream. We scan for the XML start marker.
    """
    try:
        raw = pdf_path.read_bytes()
        for start_marker in (b'<?xml', b'<score-partwise', b'<score-timewise'):
            idx = raw.find(start_marker)
            if idx == -1:
                continue
            for end_marker in (b'</score-partwise>', b'</score-timewise>'):
                end_idx = raw.find(end_marker, idx)
                if end_idx != -1:
                    xml_bytes = raw[idx: end_idx + len(end_marker)]
                    try:
                        return xml_bytes.decode('utf-8', errors='replace')
                    except Exception:
                        pass
    except Exception:
        pass
    return None


def _detect_and_parse(
    file_path: Path,
    tempo_bpm: int,
    time_signature: str | None,
) -> ParsedScore:
    """Detect file format and delegate to the appropriate parser."""
    suffix = file_path.suffix.lower()

    if suffix == '.mxl':
        return _parse_mxl_file(file_path, tempo_bpm)

    if suffix == '.xml':
        xml_content = file_path.read_text(encoding='utf-8', errors='replace')
        extracted_tempo = _extract_tempo_from_musicxml(xml_content)
        return _parse_musicxml_content(xml_content, extracted_tempo or tempo_bpm)

    if suffix == '.pdf':
        # 1st try: extract embedded MusicXML (MuseScore ≤3 PDFs, etc.)
        embedded = _try_extract_embedded_musicxml_from_pdf(file_path)
        if embedded:
            extracted_tempo = _extract_tempo_from_musicxml(embedded)
            return _parse_musicxml_content(embedded, extracted_tempo or tempo_bpm)

        # 2nd try: text-layer annotation format (legacy / manual PDFs)
        fallback_signature = _normalize_time_signature(time_signature) or '4/4'
        beats_numerator = int(fallback_signature.split('/')[0])
        reader = PdfReader(str(file_path))
        raw_text = '\n'.join(page.extract_text() or '' for page in reader.pages)
        events = _parse_text_annotation(raw_text, tempo_bpm, beats_numerator)
        if events:
            return ParsedScore(events=events, measure_marks=[])

        raise ValueError(
            'Não foi possível extrair notas musicais deste PDF. '
            'Para melhores resultados, exporte o arquivo como MusicXML (.xml) '
            'no MuseScore (Arquivo → Exportar) e importe aqui.'
        )

    raise ValueError(f'Formato não suportado: {suffix}. Use .xml, .mxl ou .pdf.')


# Legacy text-annotation parser (kept for PDFs with embedded text tokens)
_NOTE_PATTERN = re.compile(
    r'(?P<notes>[A-G](?:#|b)?\d(?:\+[A-G](?:#|b)?\d)*)/(?P<duration>w|h|q|e|s)(?P<dotted>\.)?(?:v(?P<voice>\d+))?',
    re.IGNORECASE,
)
_DURATION_MAP: dict[str, float] = {'w': 4.0, 'h': 2.0, 'q': 1.0, 'e': 0.5, 's': 0.25}


def _parse_text_annotation(raw_text: str, tempo_bpm: int, beats_per_measure: int) -> list[ParsedEvent]:
    events: list[ParsedEvent] = []
    cursor_beat = 0.0
    measure = 1
    order_index = 0

    for match in _NOTE_PATTERN.finditer(raw_text):
        duration_label = match.group('duration').lower()
        base_duration = _DURATION_MAP[duration_label]
        dotted = bool(match.group('dotted'))
        duration_beats = base_duration * 1.5 if dotted else base_duration
        voice = int(match.group('voice') or 1)

        notes_token = match.group('notes')
        notes = [n.strip() for n in notes_token.split('+') if n.strip()]
        if not notes:
            continue

        beat_start = cursor_beat % beats_per_measure
        measure = 1 + int(cursor_beat // beats_per_measure)

        chord_group = order_index + 1
        for chord_note in notes:
            normalized = chord_note[0].upper() + chord_note[1:]
            note = normalized[:-1]
            octave = int(normalized[-1])
            try:
                frequency: float | None = round(_note_to_frequency(note, octave), 4)
            except (KeyError, ValueError):
                frequency = None
            events.append(
                ParsedEvent(
                    note_name=note,
                    octave=octave,
                    frequency_hz=frequency,
                    duration_label=duration_label,
                    duration_beats=duration_beats,
                    duration_ms=_duration_to_ms(duration_beats, tempo_bpm),
                    measure_number=measure,
                    beat_start=round(beat_start, 4),
                    voice=voice,
                    chord_group=chord_group,
                ),
            )

        cursor_beat += duration_beats
        order_index += 1

    return events


def _safe_filename(filename: str) -> str:
    sanitized = re.sub(r'[^a-zA-Z0-9._-]+', '_', filename).strip('._')
    return sanitized or 'partitura.pdf'


def list_partituras(db: Session, user_id: int) -> list[Partitura]:
    query = (
        select(Partitura)
        .where(Partitura.user_id == user_id)
        .order_by(Partitura.created_at.desc())
    )
    return list(db.scalars(query).all())


def get_partitura(db: Session, user_id: int, partitura_id: int) -> Partitura | None:
    query = (
        select(Partitura)
        .options(joinedload(Partitura.events), joinedload(Partitura.measure_marks))
        .where(Partitura.id == partitura_id, Partitura.user_id == user_id)
    )
    return db.scalar(query)


def get_partitura_source_path(db: Session, user_id: int, partitura_id: int) -> Path | None:
    query = select(Partitura).where(
        Partitura.id == partitura_id,
        Partitura.user_id == user_id,
    )
    partitura = db.scalar(query)
    if not partitura:
        return None

    if not partitura.source_pdf_path:
        return None

    # Keep compatibility with legacy absolute/Windows-style paths saved in DB.
    direct_path = Path(partitura.source_pdf_path)
    if direct_path.exists():
        return direct_path

    normalized_stored_path = partitura.source_pdf_path.replace('\\', '/')
    stored_basename = Path(normalized_stored_path).name

    settings = get_settings()
    canonical_user_dir = Path(settings.score_storage_dir) / str(user_id)

    candidate_paths: list[Path] = []
    if stored_basename:
        candidate_paths.append(canonical_user_dir / stored_basename)

    # Common storage locations across local/dev/docker executions.
    search_roots = [
        Path(settings.score_storage_dir),
        Path('data') / 'scores',
        Path('backend') / 'data' / 'scores',
    ]

    for root in search_roots:
        user_dir = root / str(user_id)
        if stored_basename:
            candidate_paths.append(user_dir / stored_basename)

        # When basename cannot be trusted, search by imported source filename suffix.
        if partitura.source_filename:
            safe_source = _safe_filename(partitura.source_filename)
            candidate_paths.append(user_dir / safe_source)
            candidate_paths.extend(user_dir.glob(f'*_{safe_source}'))

    for candidate in candidate_paths:
        try:
            if candidate.exists():
                # Auto-heal outdated path in DB once a valid file is found.
                resolved = candidate.resolve()
                resolved_str = str(resolved)
                if partitura.source_pdf_path != resolved_str:
                    partitura.source_pdf_path = resolved_str
                    db.add(partitura)
                    db.commit()
                    db.refresh(partitura)
                return resolved
        except OSError:
            continue

    return direct_path


def import_partitura_pdf(
    db: Session,
    user_id: int,
    title: str,
    tempo_bpm: int,
    time_signature: str | None,
    upload_filename: str,
    source_stream,
) -> Partitura:
    provided_time_signature = _normalize_time_signature(time_signature)
    effective_time_signature = provided_time_signature or '4/4'

    settings = get_settings()
    storage_root = Path(settings.score_storage_dir)
    user_dir = storage_root / str(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)

    sanitized_name = _safe_filename(upload_filename)
    saved_name = f'{uuid.uuid4().hex}_{sanitized_name}'
    saved_path = user_dir / saved_name

    with saved_path.open('wb') as target:
        shutil.copyfileobj(source_stream, target)

    partitura = Partitura(
        title=title,
        source_filename=upload_filename,
        source_pdf_path=str(saved_path),
        parse_status='processing',
        parse_error='',
        tempo_bpm=tempo_bpm,
        time_signature=effective_time_signature,
        user_id=user_id,
    )
    db.add(partitura)
    db.flush()

    try:
        parsed_score = _detect_and_parse(saved_path, tempo_bpm, provided_time_signature)
        if not parsed_score.events:
            raise ValueError(
                'Nenhuma nota encontrada. '
                'Exporte a partitura como MusicXML (.xml) no MuseScore e importe esse arquivo.'
            )

        if provided_time_signature is None and parsed_score.detected_time_signature:
            partitura.time_signature = parsed_score.detected_time_signature

        for index, item in enumerate(parsed_score.events):
            db.add(
                PartituraEvent(
                    order_index=index,
                    event_type=item.event_type,
                    note_name=item.note_name,
                    octave=item.octave,
                    frequency_hz=item.frequency_hz,
                    duration_label=item.duration_label,
                    duration_beats=item.duration_beats,
                    duration_ms=item.duration_ms,
                    measure_number=item.measure_number,
                    beat_start=item.beat_start,
                    voice=item.voice,
                    chord_group=item.chord_group,
                    partitura_id=partitura.id,
                ),
            )

        marks_to_persist = parsed_score.measure_marks
        if not marks_to_persist:
            marks_to_persist = [
                ParsedMeasureMark(
                    measure_number=1,
                    clef_sign='G',
                    clef_line=2,
                    time_signature=partitura.time_signature,
                    key_fifths=0,
                    clef_octave_change=0,
                )
            ]

        for mark in marks_to_persist:
            db.add(
                PartituraMeasureMark(
                    measure_number=mark.measure_number,
                    clef_sign=mark.clef_sign,
                    clef_line=mark.clef_line,
                    time_signature=mark.time_signature,
                    key_fifths=mark.key_fifths,
                    clef_octave_change=mark.clef_octave_change,
                    partitura_id=partitura.id,
                )
            )

        partitura.parse_status = 'parsed'
        partitura.parse_error = ''
    except Exception as exc:
        partitura.parse_status = 'failed'
        partitura.parse_error = str(exc)

    db.commit()
    db.refresh(partitura)
    return partitura


def delete_partitura(db: Session, user_id: int, partitura_id: int) -> bool:
    query = select(Partitura).where(
        Partitura.id == partitura_id,
        Partitura.user_id == user_id,
    )
    partitura = db.scalar(query)
    if not partitura:
        return False

    pdf_path = Path(partitura.source_pdf_path)
    db.delete(partitura)
    db.commit()

    if pdf_path.exists():
        pdf_path.unlink()
    return True


def export_partitura_json(partitura: Partitura) -> str:
    total_measures = 0
    if partitura.events:
        total_measures = max(event.measure_number for event in partitura.events)

    payload = {
        'id': partitura.id,
        'title': partitura.title,
        'source_filename': partitura.source_filename,
        'tempo_bpm': partitura.tempo_bpm,
        'time_signature': partitura.time_signature,
        'total_measures': total_measures,
        'measure_marks': [
            {
                'id': mark.id,
                'measure_number': mark.measure_number,
                'clef_sign': mark.clef_sign,
                'clef_line': mark.clef_line,
                'time_signature': mark.time_signature,
                'key_fifths': mark.key_fifths,
                'clef_octave_change': mark.clef_octave_change,
            }
            for mark in sorted(partitura.measure_marks, key=lambda item: item.measure_number)
        ],
        'events': [
            {
                'id': event.id,
                'order_index': event.order_index,
                'event_type': event.event_type,
                'note_name': event.note_name,
                'octave': event.octave,
                'frequency_hz': event.frequency_hz,
                'duration_label': event.duration_label,
                'duration_beats': event.duration_beats,
                'duration_ms': event.duration_ms,
                'measure_number': event.measure_number,
                'beat_start': event.beat_start,
                'voice': event.voice,
                'chord_group': event.chord_group,
            }
            for event in sorted(
                partitura.events,
                key=lambda item: (item.measure_number, item.beat_start, item.voice, item.order_index),
            )
        ],
    }

    return json.dumps(payload, ensure_ascii=True, indent=2)
