from app.sources.normalization import chapter_sort_key, normalize_title, parse_chapter_number, title_score


def test_normalize_title_removes_noise() -> None:
    assert normalize_title("One Piece (PT-BR)") == "one piece pt br"
    assert normalize_title("ワンピース") == ""


def test_title_score_prefers_exact_match() -> None:
    assert title_score("One Piece", ["One Piece"]) == 1
    assert title_score("One Piece", ["One Piece Color"]) > 0.8
    assert title_score("One Piece", ["Berserk"]) == 0


def test_parse_chapter_number_handles_decimal_and_titles() -> None:
    assert parse_chapter_number("10.5") == 10.5
    assert parse_chapter_number(None, "Capitulo 0,5 Extra") == 0.5
    assert parse_chapter_number("Especial") is None


def test_chapter_sort_key_orders_numbers_before_specials() -> None:
    values = [
        ("Extra", None),
        ("10", None),
        ("0.5", None),
        ("1", None),
        (None, "Especial"),
    ]
    ordered = sorted(values, key=lambda item: chapter_sort_key(item[0], item[1]))
    assert ordered[:3] == [("0.5", None), ("1", None), ("10", None)]
    assert set(ordered[3:]) == {("Extra", None), (None, "Especial")}
