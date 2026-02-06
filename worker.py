from rq import Worker

from app.database.rq_queue import ANALYSIS_QUEUE, get_redis_connection
from app.logging_config import configure_logging


def main() -> None:
    configure_logging()

    redis_connection = get_redis_connection()
    worker = Worker([ANALYSIS_QUEUE], connection=redis_connection)
    worker.work(with_scheduler=False)


if __name__ == "__main__":
    main()
