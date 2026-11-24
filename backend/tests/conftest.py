"""Configuracao comum dos testes."""

import pytest

import app.services.images as images


@pytest.fixture(autouse=True)
def public_dns(monkeypatch):
    """Sem rede nos testes: todo host resolve para um IP publico qualquer.

    Os testes que verificam o bloqueio de rede interna trocam o resolvedor.
    """

    async def fake_resolve(host: str) -> list[str]:
        return ["93.184.216.34"]

    monkeypatch.setattr(images, "resolve_ips", fake_resolve)
