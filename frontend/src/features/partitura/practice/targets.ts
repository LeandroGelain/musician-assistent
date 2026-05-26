import type { PartituraEvent } from '../partituraController'
import { normalizeNoteToken, noteNameToPitchClass } from './noteUtils'
import type { PracticeTarget } from './types'

export function buildPracticeTargets(events: PartituraEvent[]): PracticeTarget[] {
  const noteEvents = [...events]
    .filter((event) => event.event_type === 'note')
    .sort(
      (a, b) => a.measure_number - b.measure_number
        || a.beat_start - b.beat_start
        || a.voice - b.voice
        || a.order_index - b.order_index
        || a.id - b.id,
    )

  const groupedByChord = new Map<number, PartituraEvent[]>()
  for (const event of noteEvents) {
    if (event.chord_group > 0) {
      if (!groupedByChord.has(event.chord_group)) {
        groupedByChord.set(event.chord_group, [])
      }
      groupedByChord.get(event.chord_group)?.push(event)
    }
  }

  const targets: PracticeTarget[] = []
  const seenChordGroups = new Set<number>()

  for (const event of noteEvents) {
    if (event.chord_group > 0) {
      if (seenChordGroups.has(event.chord_group)) {
        continue
      }
      seenChordGroups.add(event.chord_group)

      const groupedEvents = groupedByChord.get(event.chord_group) ?? [event]
      const sorted = [...groupedEvents].sort((a, b) => a.order_index - b.order_index || a.id - b.id)
      const expectedPitchClasses = Array.from(
        new Set(
          sorted
            .map((item) => noteNameToPitchClass(item.note_name))
            .filter((item): item is number => item !== null),
        ),
      ).sort((a, b) => a - b)

      targets.push({
        id: `chord-${event.chord_group}`,
        eventIds: sorted.map((item) => item.id),
        orderIndex: sorted[0].order_index,
        expectedPitchClasses,
        expectedTokens: sorted.map((item) => normalizeNoteToken(item.note_name, item.octave)),
        kind: sorted.length > 1 ? 'chord' : 'note',
        events: sorted,
      })
      continue
    }

    const pitchClass = noteNameToPitchClass(event.note_name)
    targets.push({
      id: `note-${event.id}`,
      eventIds: [event.id],
      orderIndex: event.order_index,
      expectedPitchClasses: pitchClass === null ? [] : [pitchClass],
      expectedTokens: [normalizeNoteToken(event.note_name, event.octave)],
      kind: 'note',
      events: [event],
    })
  }

  return targets
}
