# EXIF 사진 이벤트 그룹화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사진의 EXIF 촬영 시간을 추출해 10분 간격으로 이벤트 그룹화한 뒤 감정분류 모드는 이벤트별 순차 질문, 단순기록 모드는 공통 텍스트로 일괄 저장한다.

**Architecture:** 순수 함수(parse_photo_exif, group_photos_by_event)는 별도 모듈 `exif_grouping.py`로 분리해 테스트 가능하게 만든다. webhook 측은 main.py의 기존 핸들러에 hook을 추가해 다중 이벤트일 때 새 상태(`pending_event_groups`)로 분기한다. 단순기록 모드에서는 사진을 즉시 저장하지 않고 `pending_simple_photo_buffer`에 누적했다가 텍스트 트리거 시 그룹화한다.

**Tech Stack:** Python 3.12, FastAPI, piexif 1.1.3, requests, psycopg2-binary

---

## File Map

| 파일 | 변경 내용 |
|------|----|
| `2_avoha/ai/chatbot/requirements.txt` | `piexif==1.1.3` 추가 |
| `2_avoha/ai/chatbot/exif_grouping.py` (신규) | `parse_photo_exif`, `group_photos_by_event` 순수 함수 |
| `2_avoha/ai/chatbot/main.py` | 상태 변수 + 단순기록/감정분류 핸들러 변경 + 다중 이벤트 진행 로직 |

---

### Task 1: piexif 추가 + exif_grouping.py 신규 생성 + parse_photo_exif 구현

**Files:**
- Modify: `2_avoha/ai/chatbot/requirements.txt`
- Create: `2_avoha/ai/chatbot/exif_grouping.py`

- [ ] **Step 1: piexif를 requirements.txt에 추가**

`2_avoha/ai/chatbot/requirements.txt` 마지막 줄 다음에 추가:
```
piexif==1.1.3
```

- [ ] **Step 2: 새 모듈 파일 생성**

`2_avoha/ai/chatbot/exif_grouping.py` 신규 생성, 아래 내용으로:

```python
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
        효과적인 시간(exif_time 우선, 없으면 received_time)으로 정렬됨.
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
    # 자체 검증 (실행: python exif_grouping.py)
    _t0 = datetime(2026, 5, 17, 11, 0, 0)
    _t1 = datetime(2026, 5, 17, 11, 5, 0)
    _t2 = datetime(2026, 5, 17, 11, 15, 0)  # 10분 초과 -> 새 이벤트
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

    # 빈 입력
    assert group_photos_by_event([]) == []

    # 모두 EXIF 없음 (received_time 폴백)
    _base = datetime(2026, 5, 17, 12, 0, 0)
    _no_exif = [
        {"url": "a", "exif_time": None, "received_time": _base},
        {"url": "b", "exif_time": None, "received_time": _base + timedelta(minutes=3)},
    ]
    _events = group_photos_by_event(_no_exif)
    assert len(_events) == 1 and _events[0]["photo_urls"] == ["a", "b"]

    print("exif_grouping self-test OK")
```

- [ ] **Step 3: piexif 로컬 설치 (가능한 경우)**

```bash
cd /Users/imdonghyeon/kakaoimpact/2_avoha/ai/chatbot
pip install piexif==1.1.3
```
설치 실패해도 코드 작성에는 문제 없음 (Railway 배포 환경에서 설치됨).

- [ ] **Step 4: 자체 검증 실행**

```bash
cd /Users/imdonghyeon/kakaoimpact/2_avoha/ai/chatbot
python exif_grouping.py
```
Expected: `exif_grouping self-test OK`

(piexif 설치 안 됐으면 import 단계에서 ModuleNotFoundError 발생할 수 있음. 그 경우 Step 5의 syntax 검증만 통과해도 OK)

- [ ] **Step 5: 구문 검증**

```bash
cd /Users/imdonghyeon/kakaoimpact
python -c "
import ast
for fp in ['2_avoha/ai/chatbot/main.py', '2_avoha/ai/chatbot/exif_grouping.py']:
    with open(fp) as f:
        ast.parse(f.read())
print('syntax OK')
"
```
Expected: `syntax OK`

- [ ] **Step 6: Commit**

```bash
cd /Users/imdonghyeon/kakaoimpact
git add 2_avoha/ai/chatbot/requirements.txt 2_avoha/ai/chatbot/exif_grouping.py
git commit -m "|FEAT| EXIF 사진 시간 파싱 및 이벤트 그룹화 유틸 추가"
```

---

### Task 2: pending_photo 구조 확장 — received_times 필드 추가

**Files:**
- Modify: `2_avoha/ai/chatbot/main.py`

기존 `pending_photo[user_id] = {"time": datetime, "urls": [str]}` 구조를 `received_times` 필드까지 가지도록 확장. 하위 호환은 유지한다.

- [ ] **Step 1: 사진 수신 블록 위치 확인**

```bash
grep -n 'pending_photo\[user_id\] = {"time":' /Users/imdonghyeon/kakaoimpact/2_avoha/ai/chatbot/main.py
```
2개 매치 예상 (else 분기의 새 생성 + 누적 분기는 `existing["urls"].append`).

- [ ] **Step 2: 사진 수신 블록 — `received_times` 필드 추가**

`print(f"[image detected]" ...)` 블록(현재 약 line 1655)을 찾아 아래로 교체:

```python
        print(f"[image detected] user={user_id}, utterance={utterance}")
        now = datetime.now()
        existing = pending_photo.get(user_id, {})
        if (
            isinstance(existing.get("urls"), list)
            and isinstance(existing.get("time"), datetime)
            and now - existing["time"] <= PHOTO_TIMEOUT
        ):
            existing["urls"].append(utterance)
            existing.setdefault("received_times", []).append(now)
            existing["time"] = now
            pending_photo[user_id] = existing
            count = len(existing["urls"])
            return JSONResponse(kakao_response(
                f"사진 {count}장이 모였어요! ✨\n"
                "텍스트도 함께 보내주시면 감정 원석을 찾아드려요.",
                custom_replies=PHOTO_QUICK_REPLIES
            ))
        else:
            pending_photo[user_id] = {
                "time": now,
                "urls": [utterance],
                "received_times": [now],
            }
            return JSONResponse(kakao_response(
                "사진으로 오늘을 담아주셨네요.\n\n"
                "이 순간, 어떤 마음이었나요?\n"
                "한 줄만 더 적어주시면 감정 원석을 찾아드려요.\n"
                "10분 안에 적어주시면 사진과 함께 저장돼요! ⏰\n\n"
                "그냥 일상으로 남겨도 괜찮아요.",
                custom_replies=PHOTO_QUICK_REPLIES
            ))
```

- [ ] **Step 3: 구문 검증**

```bash
cd /Users/imdonghyeon/kakaoimpact && python -c "
import ast
with open('2_avoha/ai/chatbot/main.py') as f:
    ast.parse(f.read())
print('syntax OK')
"
```
Expected: `syntax OK`

- [ ] **Step 4: Commit**

```bash
cd /Users/imdonghyeon/kakaoimpact
git add 2_avoha/ai/chatbot/main.py
git commit -m "|FEAT| pending_photo에 사진별 수신 시간(received_times) 필드 추가"
```

---

### Task 3: 상태 변수 + 헬퍼 함수 추가

**Files:**
- Modify: `2_avoha/ai/chatbot/main.py` (import 블록, 상태 변수 블록, helper 함수)

- [ ] **Step 1: exif_grouping 모듈 import 추가**

`2_avoha/ai/chatbot/main.py` 상단의 `import psycopg2` 라인 다음에 추가:

```python
from exif_grouping import parse_photo_exif, group_photos_by_event
```

- [ ] **Step 2: 새 상태 변수 추가**

`pending_reflection: dict = {}` 라인 다음에 추가:

```python
# 단순기록 모드 사진 누적 버퍼 (텍스트 트리거 시까지 모음)
# {user_id: [{"url": str, "received_time": datetime}]}
pending_simple_photo_buffer: dict[str, list[dict]] = {}

# 다중 이벤트로 그룹화된 후 순차 처리 상태
# {user_id: {
#     "mode": "emotion" | "simple",
#     "events": [{"start_time": datetime, "photo_urls": [str]}],
#     "current_index": int,
#     "shared_text": str | None,  # 단순기록 모드 공통 텍스트
# }}
pending_event_groups: dict[str, dict] = {}
```

- [ ] **Step 3: 헬퍼 함수 추가 (`save_gem` 다음)**

`save_gem` 함수 마지막 줄(`conn.close()`) 다음, `_ensure_reflection_schema` 함수 직전에 추가:

```python


def _clear_event_state(user_id: str) -> None:
    """다중 이벤트 진행 상태를 클리어. 사용자가 흐름을 이탈할 때 호출."""
    pending_event_groups.pop(user_id, None)
    pending_simple_photo_buffer.pop(user_id, None)


def _build_event_label(event: dict, index: int, total: int) -> str:
    """이벤트 라벨 문자열 빌드. 예: '이벤트 1/2 (오전 11:00 · 3장)'."""
    start = event["start_time"]
    hour = start.hour
    if hour < 12:
        period = "오전"
        display_hour = hour if hour != 0 else 12
    elif hour == 12:
        period = "오후"
        display_hour = 12
    else:
        period = "오후"
        display_hour = hour - 12
    time_str = f"{period} {display_hour}:{start.minute:02d}"
    count = len(event["photo_urls"])
    return f"이벤트 {index + 1}/{total} ({time_str} · 사진 {count}장)"


def _build_event_photo_dicts_for_emotion(user_id: str) -> list[dict]:
    """감정분류 모드 — pending_photo에서 EXIF 분석용 dict 리스트 생성."""
    data = pending_photo.get(user_id) or {}
    urls = data.get("urls") or []
    received_times = data.get("received_times") or [data.get("time") or datetime.now()] * len(urls)
    if len(received_times) != len(urls):
        # 길이 불일치 시 보정 (이전 형식 호환)
        received_times = [data.get("time") or datetime.now()] * len(urls)
    out = []
    for url, rt in zip(urls, received_times):
        out.append({
            "url": url,
            "exif_time": parse_photo_exif(url),
            "received_time": rt,
        })
    return out


def _build_event_photo_dicts_for_simple(user_id: str) -> list[dict]:
    """단순기록 모드 — pending_simple_photo_buffer에서 EXIF 분석용 dict 리스트 생성."""
    buf = pending_simple_photo_buffer.get(user_id) or []
    return [
        {
            "url": item["url"],
            "exif_time": parse_photo_exif(item["url"]),
            "received_time": item["received_time"],
        }
        for item in buf
    ]
```

- [ ] **Step 4: 구문 검증**

```bash
cd /Users/imdonghyeon/kakaoimpact && python -c "
import ast
with open('2_avoha/ai/chatbot/main.py') as f:
    ast.parse(f.read())
print('syntax OK')
"
```
Expected: `syntax OK`

- [ ] **Step 5: Commit**

```bash
cd /Users/imdonghyeon/kakaoimpact
git add 2_avoha/ai/chatbot/main.py
git commit -m "|FEAT| 다중 이벤트 상태 변수 및 헬퍼 함수 추가"
```

---

### Task 4: 단순기록 모드 사진 핸들러 — 버퍼링으로 변경

**Files:**
- Modify: `2_avoha/ai/chatbot/main.py` (단순기록 모드 사진 핸들러)

기존 즉시 저장 → `pending_simple_photo_buffer`에 누적으로 변경.

- [ ] **Step 1: 핸들러 위치 확인**

```bash
grep -n "사진이 바로 저장됐어요" /Users/imdonghyeon/kakaoimpact/2_avoha/ai/chatbot/main.py
```

- [ ] **Step 2: 핸들러 교체**

현재 코드:
```python
        if pending_simple_record.get(user_id):
            background_tasks.add_task(save_gem, user_id, "단순기록", "", True, utterance, None)
            return JSONResponse(kakao_response(
                "사진이 바로 저장됐어요! ",
                custom_replies=BASE_QUICK_REPLIES
            ))
```

다음으로 교체:
```python
        if pending_simple_record.get(user_id):
            pending_simple_photo_buffer.setdefault(user_id, []).append({
                "url": utterance,
                "received_time": datetime.now(),
            })
            count = len(pending_simple_photo_buffer[user_id])
            return JSONResponse(kakao_response(
                f"사진 {count}장 모였어요! 📷\n텍스트나 다른 사진을 더 보내주세요.",
                custom_replies=BASE_QUICK_REPLIES
            ))
```

- [ ] **Step 3: 구문 검증**

```bash
cd /Users/imdonghyeon/kakaoimpact && python -c "
import ast
with open('2_avoha/ai/chatbot/main.py') as f:
    ast.parse(f.read())
print('syntax OK')
"
```

- [ ] **Step 4: Commit**

```bash
cd /Users/imdonghyeon/kakaoimpact
git add 2_avoha/ai/chatbot/main.py
git commit -m "|FEAT| 단순기록 사진 수신 시 즉시 저장 대신 버퍼 누적"
```

---

### Task 5: 단순기록 모드 텍스트 트리거 — 그룹화 + 이벤트별 저장

**Files:**
- Modify: `2_avoha/ai/chatbot/main.py` (단순기록 모드 텍스트 핸들러)

- [ ] **Step 1: 핸들러 위치 확인**

```bash
grep -n '"기록됐어요' /Users/imdonghyeon/kakaoimpact/2_avoha/ai/chatbot/main.py
```

- [ ] **Step 2: 핸들러 교체**

현재 코드:
```python
    # 단순기록 모드 텍스트 처리
    if pending_simple_record.get(user_id):
        background_tasks.add_task(save_gem, user_id, "단순기록", utterance, False, None, None)
        return JSONResponse(kakao_response(
            "기록됐어요! ",
            custom_replies=BASE_QUICK_REPLIES
        ))
```

다음으로 교체:
```python
    # 단순기록 모드 텍스트 처리 (버퍼된 사진들과 함께 이벤트 그룹화)
    if pending_simple_record.get(user_id):
        photo_dicts = _build_event_photo_dicts_for_simple(user_id)
        if not photo_dicts:
            # 사진 없이 텍스트만 → 기존 동작 (즉시 저장)
            background_tasks.add_task(save_gem, user_id, "단순기록", utterance, False, None, None)
            return JSONResponse(kakao_response(
                "기록됐어요! ",
                custom_replies=BASE_QUICK_REPLIES
            ))

        events = group_photos_by_event(photo_dicts)
        pending_simple_photo_buffer.pop(user_id, None)

        # 각 이벤트의 주 사진+텍스트를 1개의 단순기록으로, 추가 사진은 별도 단순기록으로 저장
        for event in events:
            urls = event["photo_urls"]
            if not urls:
                continue
            background_tasks.add_task(save_gem, user_id, "단순기록", utterance, True, urls[0], None)
            for extra in urls[1:]:
                background_tasks.add_task(save_gem, user_id, "단순기록", "", True, extra, None)

        if len(events) == 1:
            msg = "기록이 저장됐어요! 📝"
        else:
            lines = []
            for i, ev in enumerate(events):
                label = _build_event_label(ev, i, len(events))
                lines.append(f"- {label}")
            msg = f"{len(events)}개의 이벤트로 정리해서 저장했어요!\n" + "\n".join(lines)

        return JSONResponse(kakao_response(msg, custom_replies=BASE_QUICK_REPLIES))
```

- [ ] **Step 3: 구문 검증**

```bash
cd /Users/imdonghyeon/kakaoimpact && python -c "
import ast
with open('2_avoha/ai/chatbot/main.py') as f:
    ast.parse(f.read())
print('syntax OK')
"
```

- [ ] **Step 4: Commit**

```bash
cd /Users/imdonghyeon/kakaoimpact
git add 2_avoha/ai/chatbot/main.py
git commit -m "|FEAT| 단순기록 텍스트 입력 시 EXIF 그룹화 후 이벤트별 저장"
```

---

### Task 6: 감정분류 모드 텍스트 트리거 — 다중 이벤트 진입 분기

**Files:**
- Modify: `2_avoha/ai/chatbot/main.py` (메인 webhook 텍스트 처리부)

기존 `_safe_pending_photo` 호출 직후에 다중 이벤트 체크 hook을 추가한다.

- [ ] **Step 1: 콜사이트 위치 확인**

```bash
grep -n "has_photo, image_urls, photo_time = _safe_pending_photo" /Users/imdonghyeon/kakaoimpact/2_avoha/ai/chatbot/main.py
```

- [ ] **Step 2: 콜사이트 교체 + 다중 이벤트 진입 분기 추가**

현재 코드 (Plan A 완료 후 상태):
```python
    has_photo, image_urls, photo_time = _safe_pending_photo(user_id)
    image_url = image_urls[0] if image_urls else None
    for _extra_url in image_urls[1:]:
        background_tasks.add_task(save_gem, user_id, "단순기록", "", True, _extra_url, None)
```

다음으로 교체:
```python
    has_photo, image_urls, photo_time = _safe_pending_photo(user_id)
    image_url = image_urls[0] if image_urls else None

    # 사진 2장 이상이면 EXIF 그룹화 시도 → 다중 이벤트면 순차 모드 진입
    if has_photo and len(image_urls) >= 2:
        photo_dicts = _build_event_photo_dicts_for_emotion(user_id)
        events = group_photos_by_event(photo_dicts)
        if len(events) >= 2:
            pending_photo.pop(user_id, None)
            pending_event_groups[user_id] = {
                "mode": "emotion",
                "events": events,
                "current_index": 0,
                "shared_text": None,
            }
            first_label = _build_event_label(events[0], 0, len(events))
            return JSONResponse(kakao_response(
                f"오늘 {len(events)}개의 이벤트로 나뉘었어요. ✨\n\n"
                f"{first_label}\n이때 어떤 느낌이었나요?",
                hide_buttons=True,
            ))

    # 단일 이벤트(또는 사진 1장): 추가 사진은 단순기록으로 저장하고 기존 흐름 유지
    for _extra_url in image_urls[1:]:
        background_tasks.add_task(save_gem, user_id, "단순기록", "", True, _extra_url, None)
```

- [ ] **Step 3: 구문 검증**

```bash
cd /Users/imdonghyeon/kakaoimpact && python -c "
import ast
with open('2_avoha/ai/chatbot/main.py') as f:
    ast.parse(f.read())
print('syntax OK')
"
```

- [ ] **Step 4: Commit**

```bash
cd /Users/imdonghyeon/kakaoimpact
git add 2_avoha/ai/chatbot/main.py
git commit -m "|FEAT| 감정분류 모드에서 사진 다중 이벤트 자동 그룹화 진입"
```

---

### Task 7: 감정분류 다중 이벤트 — 이벤트별 답변 수신 핸들러

**Files:**
- Modify: `2_avoha/ai/chatbot/main.py` (webhook 함수 상단부, 특별 명령어 처리 이후)

`pending_event_groups`가 있고 mode=emotion이면, 사용자 텍스트를 현재 이벤트의 답변으로 처리한다. classify_emotion으로 분류 후 `pending_gem`을 세팅하여 기존 "맞아요/다시 찾을게요" 흐름과 합류시킨다.

- [ ] **Step 1: hook 삽입 위치 결정**

webhook 함수 내에서 사용자 명령어 분기들(`if utterance == ...`)을 지난 직후, 사진/텍스트 일반 처리 시작 전 위치에 hook을 추가한다. `if not utterance:` 라인 직전이 적절.

```bash
grep -n "    if not utterance:" /Users/imdonghyeon/kakaoimpact/2_avoha/ai/chatbot/main.py
```

- [ ] **Step 2: 다중 이벤트 답변 처리 hook 추가**

`if not utterance:` 라인 **직전**에 아래 블록 삽입:

```python
    # 다중 이벤트 흐름 진행 중인 경우 (감정분류 모드)
    ev_state = pending_event_groups.get(user_id)
    if ev_state and ev_state.get("mode") == "emotion" and utterance:
        idx = ev_state["current_index"]
        events = ev_state["events"]
        if 0 <= idx < len(events):
            current_event = events[idx]
            event_urls = current_event["photo_urls"]
            event_image_url = event_urls[0] if event_urls else None
            # 추가 사진은 단순기록으로 즉시 저장
            for _extra_url in event_urls[1:]:
                background_tasks.add_task(save_gem, user_id, "단순기록", "", True, _extra_url, None)
            # 현재 이벤트 분류 시도
            result = classify_emotion_with_supervisor(utterance)
            response = _build_ai_response(
                user_id, utterance, bool(event_image_url), event_image_url, result,
            )
            # pending_gem이 세팅되어 있으면 이벤트 진행 메타데이터를 추가로 저장
            if user_id in pending_gem:
                pending_gem[user_id]["event_flow"] = True
            return JSONResponse(response)
```

- [ ] **Step 3: 구문 검증**

```bash
cd /Users/imdonghyeon/kakaoimpact && python -c "
import ast
with open('2_avoha/ai/chatbot/main.py') as f:
    ast.parse(f.read())
print('syntax OK')
"
```

- [ ] **Step 4: Commit**

```bash
cd /Users/imdonghyeon/kakaoimpact
git add 2_avoha/ai/chatbot/main.py
git commit -m "|FEAT| 감정분류 다중 이벤트 답변 수신 핸들러 추가"
```

---

### Task 8: "맞아요" / "이대로 저장" 핸들러 hook — 다음 이벤트로 진행

**Files:**
- Modify: `2_avoha/ai/chatbot/main.py` ("맞아요" 핸들러 직후 응답 반환 전)

`pending_gem`에 `event_flow=True`가 있으면 저장 후 다음 이벤트로 진행하고 응답 메시지를 교체한다. 모든 이벤트 완료 시 완료 메시지를 반환하고 상태를 정리한다.

- [ ] **Step 1: "맞아요" 핸들러 위치 확인**

```bash
grep -n '    # 맞아요 (저장)' /Users/imdonghyeon/kakaoimpact/2_avoha/ai/chatbot/main.py
```

- [ ] **Step 2: "맞아요" 핸들러의 응답 부분 교체**

현재 "맞아요" 핸들러 (대략):
```python
    # 맞아요 (저장)
    if utterance == "맞아요":
        data = _safe_pending_gem(user_id, require_text=True)
        if not data:
            return JSONResponse(kakao_response("저장할 원석이 없어요. 일상을 먼저 보내주세요!"))
        if not data.get("gem"):
            return JSONResponse(kakao_response("감정을 먼저 선택해주세요!", show_emotion_buttons=True))
        gem_to_save = data["gem"]
        today_count = _db_get_today_count(user_id) + 1
        background_tasks.add_task(save_gem, user_id, gem_to_save, data["text"], bool(data.get("has_photo", False)), data.get("image_url"), data.get("ai_gems"))
        pending_gem.pop(user_id, None)
        alert_msg = check_negative_accumulation(user_id)
        response = kakao_save_complete(gem_to_save, today_count, user_id, alert_msg or "")
        response = _maybe_attach_reflection_invite(response, user_id, gem_to_save, data["text"])
        return JSONResponse(response)
```

`pending_gem.pop(user_id, None)` 직후, `alert_msg = ...` 라인 직전에 다중 이벤트 진행 분기를 추가하여 다음 형태로 교체:

```python
    # 맞아요 (저장)
    if utterance == "맞아요":
        data = _safe_pending_gem(user_id, require_text=True)
        if not data:
            return JSONResponse(kakao_response("저장할 원석이 없어요. 일상을 먼저 보내주세요!"))
        if not data.get("gem"):
            return JSONResponse(kakao_response("감정을 먼저 선택해주세요!", show_emotion_buttons=True))
        gem_to_save = data["gem"]
        today_count = _db_get_today_count(user_id) + 1
        background_tasks.add_task(save_gem, user_id, gem_to_save, data["text"], bool(data.get("has_photo", False)), data.get("image_url"), data.get("ai_gems"))
        was_event_flow = bool(data.get("event_flow"))
        pending_gem.pop(user_id, None)

        # 다중 이벤트 흐름이면 다음 이벤트로 진행
        if was_event_flow and user_id in pending_event_groups:
            ev_state = pending_event_groups[user_id]
            ev_state["current_index"] += 1
            idx = ev_state["current_index"]
            events = ev_state["events"]
            if idx < len(events):
                next_label = _build_event_label(events[idx], idx, len(events))
                return JSONResponse(kakao_response(
                    f"✨ 저장됐어요!\n\n{next_label}\n이때는 어떤 느낌이었나요?",
                    hide_buttons=True,
                ))
            # 모든 이벤트 완료
            total = len(events)
            pending_event_groups.pop(user_id, None)
            alert_msg = check_negative_accumulation(user_id)
            extra = f"\n{alert_msg}" if alert_msg else ""
            return JSONResponse(kakao_response(
                f"오늘 {total}개의 이벤트가 모두 저장됐어요! ✨\n"
                f"오늘 {today_count}번째 원석이에요! 🪨{extra}",
                custom_replies=BASE_QUICK_REPLIES,
            ))

        alert_msg = check_negative_accumulation(user_id)
        response = kakao_save_complete(gem_to_save, today_count, user_id, alert_msg or "")
        response = _maybe_attach_reflection_invite(response, user_id, gem_to_save, data["text"])
        return JSONResponse(response)
```

- [ ] **Step 3: 구문 검증**

```bash
cd /Users/imdonghyeon/kakaoimpact && python -c "
import ast
with open('2_avoha/ai/chatbot/main.py') as f:
    ast.parse(f.read())
print('syntax OK')
"
```

- [ ] **Step 4: Commit**

```bash
cd /Users/imdonghyeon/kakaoimpact
git add 2_avoha/ai/chatbot/main.py
git commit -m "|FEAT| 감정분류 다중 이벤트 - 다음 이벤트 자동 진행 및 완료 응답"
```

---

### Task 9: 명령어 이탈 시 상태 정리 + import 검증

**Files:**
- Modify: `2_avoha/ai/chatbot/main.py` (webhook 진입부 초반에 가드)

사용자가 다중 이벤트 흐름 중 "모드", "내 원석" 같은 명령어를 입력하면 `pending_event_groups`와 `pending_simple_photo_buffer`를 클리어해 깨끗한 상태로 진입한다.

- [ ] **Step 1: 가드 삽입 위치 확인**

webhook 함수에서 user_id, utterance가 추출된 직후 (위험 키워드 체크 등 이전)에 가드를 둔다.

```bash
grep -n "user_id, utterance, callback_url = _extract_kakao_request" /Users/imdonghyeon/kakaoimpact/2_avoha/ai/chatbot/main.py
```

- [ ] **Step 2: 명령어 이탈 가드 추가**

`_extract_kakao_request` 호출 결과 라인의 **다음 줄**에 아래 블록 삽입:

```python
    # 다중 이벤트 흐름 중에 특정 명령어가 들어오면 상태 클리어
    _exit_commands = {"모드", "내 원석", "도감", "감정분석", "채집 안내", "감정분류 모드", "단순기록 모드"}
    if utterance in _exit_commands and (user_id in pending_event_groups or user_id in pending_simple_photo_buffer):
        _clear_event_state(user_id)
```

- [ ] **Step 3: 구문 검증 + import 검증**

```bash
cd /Users/imdonghyeon/kakaoimpact && python -c "
import ast
with open('2_avoha/ai/chatbot/main.py') as f:
    ast.parse(f.read())
print('main.py syntax OK')

import ast
with open('2_avoha/ai/chatbot/exif_grouping.py') as f:
    ast.parse(f.read())
print('exif_grouping.py syntax OK')
"
```

```bash
cd /Users/imdonghyeon/kakaoimpact/2_avoha/ai/chatbot && python -c "from main import app; print('import OK')" 2>&1 | tail -3
```
(piexif 미설치 시 ImportError 발생 가능 — Railway 배포 환경에서는 정상)

- [ ] **Step 4: Commit**

```bash
cd /Users/imdonghyeon/kakaoimpact
git add 2_avoha/ai/chatbot/main.py
git commit -m "|FEAT| 다중 이벤트 흐름 중 명령어 이탈 시 상태 클리어"
```

---

## 검증 시나리오

배포 후 카카오 챗봇에서 실제 테스트:

### 시나리오 1: 사진 1장 (기존 흐름 유지)
1. 감정분류 모드 → 사진 1장 → 기존 안내 메시지
2. 텍스트 입력 → 기존 감정 분류 흐름 진행

### 시나리오 2: 사진 다중장 같은 이벤트
1. 감정분류 모드 → 사진 3장 전송 (모두 같은 시간 근처 촬영)
2. 텍스트 입력 → EXIF 그룹화 → 1개 이벤트 → 기존 흐름

### 시나리오 3: 감정분류 다중 이벤트
1. 감정분류 모드 → 사진 5장 (오전 11시 3장 + 저녁 6시 2장)
2. 텍스트 "오늘 일과"
3. "오늘 2개의 이벤트로 나뉘었어요" 응답
4. "이벤트 1/2 (오전 11:00 · 사진 3장)" → 답변 → 감정 분류 → "맞아요"
5. "이벤트 2/2 (오후 6:00 · 사진 2장)" → 답변 → 감정 분류 → "맞아요"
6. "오늘 2개의 이벤트가 모두 저장됐어요!" 응답
7. DB 확인: 원석 2개 + 추가 사진 단순기록 N개

### 시나리오 4: 단순기록 다중 이벤트
1. 단순기록 모드 → 사진 5장 전송 (오전 3장 + 저녁 2장)
2. "사진 N장 모였어요!" 누적 응답
3. 텍스트 "오늘 일과"
4. "2개의 이벤트로 정리해서 저장했어요!" 응답
5. DB 확인: 각 이벤트마다 주 사진+텍스트 단순기록 + 추가 사진 단순기록

### 시나리오 5: EXIF 없는 사진
1. 스크린샷 3장 연속 전송 (EXIF 없음, 수신 시간 차이 < 10분)
2. 텍스트 입력
3. 1개 이벤트로 묶여 기존 흐름 진행

### 시나리오 6: 흐름 이탈
1. 다중 이벤트 진행 중 "모드" 입력
2. `pending_event_groups` 클리어 + 모드 메뉴 정상 표시

---

## 알려진 제약사항

- **Kakao 5초 타임아웃**: 사진 다운로드 + EXIF 파싱이 모두 5초 안에 끝나야 함. 사진 수가 많거나 네트워크가 느릴 경우 일부 사진의 exif_time이 None으로 fallback되어 received_time 기반 그룹화로 진입한다. (향후 useCallback 패턴 적용 검토 가능)
- **시간대**: EXIF에는 시간대 정보가 없으므로 KST/UTC를 가정하지 않고 naive datetime 그대로 비교한다. 사용자가 외국에서 촬영한 사진은 다를 수 있으나 그룹화 결과는 일관적임.
- **카카오 CDN URL 만료**: 일부 카카오 이미지 URL은 짧은 만료 시간을 가짐. 이 경우 다운로드 실패 → received_time fallback.
