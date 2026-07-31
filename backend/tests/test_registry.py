import pytest

from app.sources.registry import SourceRegistry, UnknownSourceError, default_registry


def test_default_registry_exposes_mangadex() -> None:
    registry = default_registry()
    assert registry.get("mangadex").info.name == "MangaDex"


def test_registry_raises_for_unknown_source() -> None:
    registry = SourceRegistry()
    with pytest.raises(UnknownSourceError):
        registry.get("missing")
