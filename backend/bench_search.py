"""Bench manual de latencia por fonte. Nao faz parte da suite; rodar a mao.

Bate na rede de verdade, entao fica fora do pytest: mede quanto cada adapter
demora e quantos resultados devolve, que e o dado por tras do interleave em
`services/catalog.py` — as scans PT-BR tem catalogo pequeno e se esgotam antes
do limite, enquanto o MangaDex enche o corte sozinho.

    cd backend && python bench_search.py
"""

import asyncio
import time

from app.core import http
from app.sources.registry import default_registry


async def main() -> None:
    await http.startup()
    registry = default_registry()

    for query in ("one piece", "solo leveling", "dragon ball"):
        print(f"\n=== query: {query!r} ===")

        async def one(adapter):
            started = time.perf_counter()
            try:
                found = await adapter.search(query, 60)
                return adapter.info.id, len(found), time.perf_counter() - started, None
            except Exception as exc:
                return adapter.info.id, 0, time.perf_counter() - started, type(exc).__name__

        t0 = time.perf_counter()
        results = await asyncio.gather(*[one(a) for a in registry.all()])
        total = time.perf_counter() - t0

        for sid, count, elapsed, err in sorted(results, key=lambda item: -item[2]):
            print(f"  {sid:12} {count:3} resultados  {elapsed:6.2f}s  {err or ''}")
        print(f"  TOTAL AGREGADO: {total:.2f}s")

    await http.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
