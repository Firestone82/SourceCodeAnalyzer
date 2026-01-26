from redis import Redis
from rq import Queue

from app.settings import settings

ANALYSIS_QUEUE = "analyzer"


def get_redis_connection() -> Redis:
    return Redis.from_url(settings.redis_url)


def get_analysis_queue() -> Queue:
    redis_connection: Redis = get_redis_connection()
    return Queue(name=ANALYSIS_QUEUE, connection=redis_connection)
