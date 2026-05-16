"""사진 EXIF 시간 추출 및 이벤트 그룹화 유틸.

- parse_photo_exif: URL에서 사진 다운로드 후 DateTimeOriginal 파싱
- group_photos_by_event: 시간 정렬 + 10분 간격으로 그룹화

EXIF에 시간 정보가 없거나 다운로드 실패 시 None 반환.
시간대 정보가 없는 EXIF는 naive datetime 그대로 사용한다.
"""

from __future__ import annotations

import io
from datetime import datetime, timedelta

import piexif
import requests


EVENT_GAP = timedelta(minutes=10)


def parse_photo_exif(url: str, timeout: float = 5.0) -> datetime | None:
    """카카오 CDN URL에서 사진을 다운로드하고 EXIF 촬영 시간 추출.

    실패 시 None 반환 (네트워크 오류, EXIF 없음, 형식 오류 등).
    """
    try:
        resp = requests.get(url, timeout=timeout, stream=False)
        if resp.status_code != 200:
            return None
        exif_dict = piexif.load(resp.content)
    except Exception:
        return None

    date_bytes = exif_dict.get("Exif", {}).get(piexif.ExifIFD.DateTimeOriginal)
    if not date_bytes:
        date_bytes = exif_dict.get("0th", {}).get(piexif.ImageIFD.DateTime)
    if not date_bytes:
        return None

    try:
        date_str = date_bytes.decode("utf-8") if isinstance(date_bytes, bytes) else str(date_bytes)
        return datetime.strptime(date_str, "%Y:%m:%d %H:%M:%S")
    except (ValueError, UnicodeDecodeError):
        return None


def group_photos_by_event(photos: list[dict]) -> list[dict]:
    """사진 리스트를 시간 순 정렬 후 10분 간격으로 이벤트 그룹화.

    Args:
        photos: [{"url": str, "exif_time": datetime | None, "received_time": datetime}]

    Returns:
        [{"start_time": datetime, "end_time": datetime, "photo_urls": list[str]}]
    """
    if not photos:
        return []

    enriched = [
        {"url": p["url"], "time": p.get("exif_time") or p["received_time"]}
        for p in photos
    ]
    enriched.sort(key=lambda x: x["time"])

    events: list[dict] = []
    current: list[dict] = [enriched[0]]
    for p in enriched[1:]:
        if p["time"] - current[-1]["time"] <= EVENT_GAP:
            current.append(p)
        else:
            events.append(_finalize_event(current))
            current = [p]
    events.append(_finalize_event(current))
    return events


def _finalize_event(group: list[dict]) -> dict:
    return {
        "start_time": group[0]["time"],
        "end_time": group[-1]["time"],
        "photo_urls": [p["url"] for p in group],
    }


if __name__ == "__main__":
    _t0 = datetime(2026, 5, 17, 11, 0, 0)
    _t1 = datetime(2026, 5, 17, 11, 5, 0)
    _t2 = datetime(2026, 5, 17, 11, 15, 0)
    _t3 = datetime(2026, 5, 17, 18, 0, 0)

    _photos = [
        {"url": "u1", "exif_time": _t0, "received_time": datetime.now()},
        {"url": "u2", "exif_time": _t1, "received_time": datetime.now()},
        {"url": "u3", "exif_time": _t2, "received_time": datetime.now()},
        {"url": "u4", "exif_time": _t3, "received_time": datetime.now()},
        {"url": "u5", "exif_time": None, "received_time": _t3 + timedelta(minutes=2)},
    ]
    _events = group_photos_by_event(_photos)
    assert len(_events) == 3, f"expected 3 events, got {len(_events)}"
    assert _events[0]["photo_urls"] == ["u1", "u2"], _events[0]
    assert _events[1]["photo_urls"] == ["u3"], _events[1]
    assert _events[2]["photo_urls"] == ["u4", "u5"], _events[2]

    assert group_photos_by_event([]) == []

    _base = datetime(2026, 5, 17, 12, 0, 0)
    _no_exif = [
        {"url": "a", "exif_time": None, "received_time": _base},
        {"url": "b", "exif_time": None, "received_time": _base + timedelta(minutes=3)},
    ]
    _events = group_photos_by_event(_no_exif)
    assert len(_events) == 1 and _events[0]["photo_urls"] == ["a", "b"]

    print("exif_grouping self-test OK")
