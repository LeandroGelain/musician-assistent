# API Reference

## Auth

### POST /api/auth/register
Create user and set JWT HttpOnly cookie.

Request body:
```json
{
  "name": "Leandro",
  "email": "leandro@email.com",
  "phone": "11999999999",
  "password": "secret123"
}
```

### POST /api/auth/login
Authenticate user and set JWT HttpOnly cookie.

### GET /api/auth/me
Get authenticated user profile from cookie token.

### POST /api/auth/logout
Clear authentication cookie.

## Metronomo

### GET /api/metronomo/settings
Returns user metronome settings.

### PUT /api/metronomo/settings
Updates metronome settings.

Request body:
```json
{
  "bpm": 120,
  "beats_per_bar": 4
}
```

## Afinador

### GET /api/afinador/settings
Returns user tuner settings.

### PUT /api/afinador/settings
Updates tuner settings.

Request body:
```json
{
  "reference_frequency": 440,
  "instrument": "Violao"
}
```

## Repertorio

### GET /api/repertorio
List all user repertorio items.

### POST /api/repertorio
Create a repertorio item.

Request body:
```json
{
  "title": "Song name",
  "artist": "Artist",
  "notes": "Capo 2"
}
```

### DELETE /api/repertorio/{item_id}
Delete a repertorio item.

## Audio

### WS /ws/audio
Realtime websocket channel placeholder for audio processing pipeline.

## Integration Tests

The backend test suite validates the main flows for:

- authentication lifecycle
- repertorio CRUD baseline
- metronomo default settings and update flow
- afinador default settings and update flow
