from datetime import datetime

from sqlalchemy.orm import Session

from app.database.models import RaterLoginEvent


def touch_last_login(session: Session, rater_id: int) -> None:
    login_event = session.query(RaterLoginEvent).filter(RaterLoginEvent.rater_id == rater_id).one_or_none()
    if login_event is None:
        login_event = RaterLoginEvent(rater_id=rater_id, last_login_at=datetime.now())
    else:
        login_event.last_login_at = datetime.now()

    session.add(login_event)
    session.commit()
