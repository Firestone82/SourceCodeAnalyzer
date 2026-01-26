from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Submit(Base):
    __tablename__ = "submit"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    source_path: Mapped[str] = mapped_column(String(512), nullable=False)
    prompt_name: Mapped[str] = mapped_column(String(512), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now())

    issues: Mapped[list["Issue"]] = relationship(back_populates="submit", cascade="all, delete-orphan")


class Issue(Base):
    __tablename__ = "issue"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    submit_id: Mapped[int] = mapped_column(ForeignKey("submit.id", ondelete="CASCADE"), nullable=False)
    file: Mapped[str] = mapped_column(String(512), nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    line: Mapped[int] = mapped_column(Integer, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)

    submit: Mapped["Submit"] = relationship(back_populates="issues")
    ratings: Mapped[list["IssueRating"]] = relationship(back_populates="issue", cascade="all, delete-orphan")


class Rater(Base):
    __tablename__ = "rater"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    key: Mapped[str] = mapped_column(String(256), nullable=False, unique=True)
    admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    ratings: Mapped[list["IssueRating"]] = relationship(back_populates="rater", cascade="all, delete-orphan")


class IssueRating(Base):
    __tablename__ = "issue_rating"
    __table_args__ = (UniqueConstraint("issue_id", "rater_id", name="uq_issue_rater"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issue_id: Mapped[int] = mapped_column(ForeignKey("issue.id"), nullable=False)
    rater_id: Mapped[int] = mapped_column(ForeignKey("rater.id"), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now())

    issue: Mapped["Issue"] = relationship(back_populates="ratings")
    rater: Mapped["Rater"] = relationship(back_populates="ratings")
