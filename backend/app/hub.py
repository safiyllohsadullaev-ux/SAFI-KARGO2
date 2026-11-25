import asyncio
from collections import defaultdict

from fastapi import WebSocket

main_loop: asyncio.AbstractEventLoop | None = None


class Hub:
    def __init__(self) -> None:
        self.sockets: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect(self, user_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self.sockets[user_id].add(ws)

    def disconnect(self, user_id: int, ws: WebSocket) -> None:
        self.sockets[user_id].discard(ws)
        if not self.sockets[user_id]:
            self.sockets.pop(user_id, None)

    def online_ids(self) -> set[int]:
        return {user_id for user_id, socks in self.sockets.items() if socks}

    async def send_user(self, user_id: int, payload: dict) -> None:
        dead: list[WebSocket] = []
        for ws in list(self.sockets.get(user_id, set())):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

    async def send_many(self, user_ids: set[int], payload: dict) -> None:
        for user_id in user_ids:
            await self.send_user(user_id, payload)


hub = Hub()


def push(user_id: int, payload: dict) -> None:
    if main_loop is None:
        return
    asyncio.run_coroutine_threadsafe(hub.send_user(user_id, payload), main_loop)


def push_many(user_ids: set[int], payload: dict) -> None:
    if main_loop is None or not user_ids:
        return
    asyncio.run_coroutine_threadsafe(hub.send_many(user_ids, payload), main_loop)
