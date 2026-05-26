"""Exercise generator service.

Generates random musical exercises based on a given scale (default: C major).
The algorithm produces stepwise-motion melodies exported as .mxl (compressed MusicXML).
"""
from __future__ import annotations

import io
import random
import zipfile
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.exercicio import Exercicio

# ---------------------------------------------------------------------------
# Music theory data
# ---------------------------------------------------------------------------

# Scale definitions: note name → list of (step_name, octave_offset) in order
_SCALE_STEPS: dict[str, list[str]] = {
    'C':  ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
    'D':  ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],
    'E':  ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'],
    'F':  ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'],
    'G':  ['G', 'A', 'B', 'C', 'D', 'E', 'F#'],
    'A':  ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'],
    'B':  ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'],
}

# Base octave for the scale (root starts here)
_BASE_OCTAVE = 4

# Range limits: how many scale degrees above/below the root are allowed
_MIN_SCALE_DEGREE = 0       # root
_MAX_SCALE_DEGREE = 13      # 2 octaves above root (7 steps * 2 - 1)


def _get_scale(scale_root: str) -> list[str]:
    return _SCALE_STEPS.get(scale_root, _SCALE_STEPS['C'])


def _scale_degree_to_note(steps: list[str], degree: int) -> tuple[str, int]:
    """Convert a scale degree (0-based, can exceed one octave) to (note_name, octave)."""
    octave_offset, step_index = divmod(degree, len(steps))
    note = steps[step_index]
    octave = _BASE_OCTAVE + octave_offset
    return note, octave


def _next_degree(current: int, rng: random.Random) -> int:
    """Choose next scale degree with mostly stepwise motion."""
    roll = rng.random()
    if roll < 0.70:
        # Stepwise: ±1
        delta = rng.choice([-1, 1])
    elif roll < 0.95:
        # 3rd: ±2
        delta = rng.choice([-2, 2])
    else:
        # 5th: ±3 or ±4
        delta = rng.choice([-4, -3, 3, 4])

    new_degree = current + delta
    new_degree = max(_MIN_SCALE_DEGREE, min(_MAX_SCALE_DEGREE, new_degree))
    return new_degree


# ---------------------------------------------------------------------------
# MusicXML generation
# ---------------------------------------------------------------------------

def _note_to_musicxml(note_name: str, octave: int, duration_type: str = 'quarter', divisions: int = 1) -> str:
    """Render a single note to MusicXML <note> element."""
    step = note_name[0]
    alter_map = {'#': '1', 'b': '-1', '##': '2', 'bb': '-2'}
    accidental_str = note_name[1:]
    alter = alter_map.get(accidental_str, '')

    alter_element = f'<alter>{alter}</alter>' if alter else ''

    return (
        f'<note>'
        f'<pitch><step>{step}</step>{alter_element}<octave>{octave}</octave></pitch>'
        f'<duration>{divisions}</duration>'
        f'<type>{duration_type}</type>'
        f'</note>'
    )


def _build_musicxml(
    notes: list[tuple[str, int]],
    tempo_bpm: int,
    time_signature: str,
    num_measures: int,
) -> str:
    """Build a complete MusicXML string for the exercise."""
    beats, beat_type = time_signature.split('/')
    beats_int = int(beats)
    notes_per_measure = beats_int  # one quarter note per beat

    divisions = 1

    measures_xml: list[str] = []
    note_index = 0

    for measure_num in range(1, num_measures + 1):
        attributes_xml = ''
        if measure_num == 1:
            attributes_xml = (
                f'<attributes>'
                f'<divisions>{divisions}</divisions>'
                f'<key><fifths>0</fifths></key>'
                f'<time><beats>{beats}</beats><beat-type>{beat_type}</beat-type></time>'
                f'<clef><sign>G</sign><line>2</line></clef>'
                f'</attributes>'
                f'<direction placement="above">'
                f'<direction-type><metronome parentheses="no">'
                f'<beat-unit>quarter</beat-unit><per-minute>{tempo_bpm}</per-minute>'
                f'</metronome></direction-type>'
                f'</direction>'
            )

        notes_xml = ''
        for _ in range(notes_per_measure):
            if note_index < len(notes):
                note_name, octave = notes[note_index]
                notes_xml += _note_to_musicxml(note_name, octave, 'quarter', divisions)
                note_index += 1

        measures_xml.append(
            f'<measure number="{measure_num}">{attributes_xml}{notes_xml}</measure>'
        )

    part_xml = ''.join(measures_xml)

    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN"'
        ' "http://www.musicxml.org/dtds/partwise.dtd">'
        '<score-partwise version="3.1">'
        '<part-list>'
        '<score-part id="P1"><part-name>Exercicio</part-name></score-part>'
        '</part-list>'
        f'<part id="P1">{part_xml}</part>'
        '</score-partwise>'
    )


def _build_mxl_bytes(xml_content: str, inner_filename: str = 'exercicio.xml') -> bytes:
    """Wrap MusicXML in a .mxl ZIP container."""
    container_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<container>'
        '<rootfiles>'
        f'<rootfile full-path="{inner_filename}" media-type="application/vnd.recordare.musicxml+xml"/>'
        '</rootfiles>'
        '</container>'
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('META-INF/container.xml', container_xml)
        zf.writestr(inner_filename, xml_content)

    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------

def generate_exercise(
    db: Session,
    user_id: int,
    scale: str = 'C',
    tempo_bpm: int = 80,
    num_measures: int = 4,
    time_signature: str = '4/4',
    seed: int | None = None,
) -> Exercicio:
    """Generate a random scale exercise, save MXL to disk and persist in DB."""
    beats_int = int(time_signature.split('/')[0])
    total_notes = num_measures * beats_int

    rng = random.Random(seed)
    steps = _get_scale(scale)

    # Start near the middle of the range (degree 0 = root C4)
    current_degree = rng.randint(0, 2)
    note_sequence: list[tuple[str, int]] = []

    for i in range(total_notes - 1):
        note, octave = _scale_degree_to_note(steps, current_degree)
        note_sequence.append((note, octave))
        current_degree = _next_degree(current_degree, rng)

    # Always end on the root (tonic)
    root_note, root_octave = _scale_degree_to_note(steps, 0)
    note_sequence.append((root_note, root_octave))

    xml_content = _build_musicxml(note_sequence, tempo_bpm, time_signature, num_measures)
    mxl_bytes = _build_mxl_bytes(xml_content)

    settings = get_settings()
    storage_dir = Path(settings.score_storage_dir) / 'exercicios' / str(user_id)
    storage_dir.mkdir(parents=True, exist_ok=True)

    import uuid
    filename = f'exercicio_{uuid.uuid4().hex}.mxl'
    file_path = storage_dir / filename
    file_path.write_bytes(mxl_bytes)

    title = f'Escala de {scale} maior — {num_measures} compassos @ {tempo_bpm} BPM'

    exercicio = Exercicio(
        title=title,
        scale=scale,
        generated_mxl_path=str(file_path),
        tempo_bpm=tempo_bpm,
        time_signature=time_signature,
        num_measures=num_measures,
        user_id=user_id,
    )
    db.add(exercicio)
    db.commit()
    db.refresh(exercicio)
    return exercicio


def list_exercicios(db: Session, user_id: int) -> list[Exercicio]:
    from sqlalchemy import select
    stmt = select(Exercicio).where(Exercicio.user_id == user_id).order_by(Exercicio.created_at.desc())
    return list(db.execute(stmt).scalars().all())


def get_exercicio(db: Session, user_id: int, exercicio_id: int) -> Exercicio | None:
    from sqlalchemy import select
    stmt = select(Exercicio).where(Exercicio.id == exercicio_id, Exercicio.user_id == user_id)
    return db.execute(stmt).scalar_one_or_none()


def get_exercicio_mxl_path(db: Session, user_id: int, exercicio_id: int) -> Path | None:
    exercicio = get_exercicio(db, user_id, exercicio_id)
    if not exercicio:
        return None
    return Path(exercicio.generated_mxl_path)


def delete_exercicio(db: Session, user_id: int, exercicio_id: int) -> bool:
    exercicio = get_exercicio(db, user_id, exercicio_id)
    if not exercicio:
        return False

    mxl_path = Path(exercicio.generated_mxl_path)
    if mxl_path.exists():
        mxl_path.unlink(missing_ok=True)

    db.delete(exercicio)
    db.commit()
    return True
