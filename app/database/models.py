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
    prompt_path: Mapped[str] = mapped_column(String(512), nullable=False)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("rater.id"), nullable=True)
    published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now())

    issues: Mapped[list["Issue"]] = relationship(back_populates="submit", cascade="all, delete-orphan")
    created_by: Mapped["Rater"] = relationship()


class Issue(Base):
    __tablename__ = "issue"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    submit_id: Mapped[int] = mapped_column(ForeignKey("submit.id", ondelete="CASCADE"), nullable=False)
    file: Mapped[str | None] = mapped_column(String(512), nullable=True)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    line: Mapped[int | None] = mapped_column(Integer, nullable=True)
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
    submit_ratings: Mapped[list["SubmitRating"]] = relationship(back_populates="rater", cascade="all, delete-orphan")
    login_event: Mapped["RaterLoginEvent | None"] = relationship(
        back_populates="rater",
        cascade="all, delete-orphan",
        uselist=False,
    )


class RaterLoginEvent(Base):
    __tablename__ = "rater_login_event"

    rater_id: Mapped[int] = mapped_column(ForeignKey("rater.id", ondelete="CASCADE"), primary_key=True)
    last_login_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now())

    rater: Mapped["Rater"] = relationship(back_populates="login_event")


class IssueRating(Base):
    __tablename__ = "issue_rating"
    __table_args__ = (
        UniqueConstraint("issue_id", "rater_id", name="uq_issue_rater"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issue_id: Mapped[int | None] = mapped_column(ForeignKey("issue.id"), nullable=True)
    rater_id: Mapped[int] = mapped_column(ForeignKey("rater.id"), nullable=False)
    relevance_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quality_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now())

    issue: Mapped["Issue"] = relationship(back_populates="ratings")
    rater: Mapped["Rater"] = relationship(back_populates="ratings")


class SubmitRating(Base):
    __tablename__ = "submit_rating"
    __table_args__ = (
        UniqueConstraint("submit_id", "rater_id", name="uq_submit_rater"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    submit_id: Mapped[int] = mapped_column(ForeignKey("submit.id", ondelete="CASCADE"), nullable=False)
    rater_id: Mapped[int] = mapped_column(ForeignKey("rater.id"), nullable=False)
    relevance_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quality_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now())

    submit: Mapped["Submit"] = relationship()
    rater: Mapped["Rater"] = relationship(back_populates="submit_ratings")




class SourceTag(Base):
    __tablename__ = "source_tag"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_path: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    tag: Mapped[str] = mapped_column(String(128), nullable=False)

class AnalysisJob(Base):
    __tablename__ = "analysis_job"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="running")
    job_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    prompt_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    submit_id: Mapped[int | None] = mapped_column(ForeignKey("submit.id"), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.now, onupdate=datetime.now
    )

    submit: Mapped["Submit"] = relationship()
