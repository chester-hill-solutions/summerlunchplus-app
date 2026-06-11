from cachetools import TTLCache

_past_meetings_cache: TTLCache = TTLCache(maxsize=128, ttl=600)   # 10 minutes
_participants_cache: TTLCache = TTLCache(maxsize=256, ttl=1800)   # 30 minutes


def get_cached(cache: TTLCache, key: str):
    return cache.get(key)


def set_cached(cache: TTLCache, key: str, value):
    cache[key] = value
