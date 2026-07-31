from app.sources.mangadex import MangaDexSource


def test_primary_title_match_beats_alias_match() -> None:
    source = MangaDexSource()

    exact = source._map_manga(
        {
            "id": "one-piece",
            "attributes": {"title": {"en": "One Piece"}, "altTitles": [], "description": {}},
            "relationships": [],
        },
        "one piece",
    )
    spin_off = source._map_manga(
        {
            "id": "academy",
            "attributes": {
                "title": {"en": "One Piece Academy"},
                "altTitles": [{"en": "One Piece"}],
                "description": {},
            },
            "relationships": [],
        },
        "one piece",
    )

    assert exact.score > spin_off.score
