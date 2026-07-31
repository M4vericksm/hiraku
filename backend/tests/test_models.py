from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.models import Base, LibraryItem, ReadingProgress, User


def test_database_models_create_basic_library_graph() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        user = User(email="reader@example.com", password_hash="hash")
        item = LibraryItem(
            user=user,
            source="mangadex",
            source_manga_id="one-piece",
            title="One Piece",
            cover_url=None,
        )
        progress = ReadingProgress(
            library_item=item,
            source_chapter_id="chapter-1",
            page_index=12,
            total_pages=20,
        )
        session.add(progress)
        session.commit()

        saved = session.query(LibraryItem).one()
        assert saved.user.email == "reader@example.com"
        assert saved.progress_entries[0].page_index == 12
