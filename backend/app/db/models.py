from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utc_now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    library_items: Mapped[list["LibraryItem"]] = relationship(back_populates="user")


class LibraryItem(Base):
    __tablename__ = "library_items"
    __table_args__ = (UniqueConstraint("user_id", "source", "source_manga_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    source: Mapped[str] = mapped_column(String(64), index=True)
    source_manga_id: Mapped[str] = mapped_column(String(128), index=True)
    title: Mapped[str] = mapped_column(String(500))
    cover_url: Mapped[str | None] = mapped_column(Text)
    preferred_language: Mapped[str] = mapped_column(String(16), default="pt-br")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped[User] = relationship(back_populates="library_items")
    progress_entries: Mapped[list["ReadingProgress"]] = relationship(back_populates="library_item")


class ReadingProgress(Base):
    __tablename__ = "reading_progress"
    __table_args__ = (UniqueConstraint("library_item_id", "source_chapter_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    library_item_id: Mapped[str] = mapped_column(ForeignKey("library_items.id"), index=True)
    source_chapter_id: Mapped[str] = mapped_column(String(128), index=True)
    page_index: Mapped[int] = mapped_column(Integer, default=0)
    total_pages: Mapped[int | None] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    library_item: Mapped[LibraryItem] = relationship(back_populates="progress_entries")


class DownloadedChapter(Base):
    __tablename__ = "downloaded_chapters"
    __table_args__ = (UniqueConstraint("library_item_id", "source_chapter_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    library_item_id: Mapped[str] = mapped_column(ForeignKey("library_items.id"), index=True)
    source_chapter_id: Mapped[str] = mapped_column(String(128), index=True)
    storage_path: Mapped[str] = mapped_column(Text)
    total_pages: Mapped[int] = mapped_column(Integer)
    bytes_used: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
