from fastapi import APIRouter, WebSocket

router = APIRouter(tags=['audio'])


@router.websocket('/ws/audio')
async def audio_stream(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_json(
        {
            'type': 'info',
            'message': 'Canal websocket ativo para processamento de audio em tempo real.',
        },
    )

    try:
        while True:
            message = await websocket.receive_text()
            await websocket.send_text(f'echo:{message}')
    except Exception:
        await websocket.close()
