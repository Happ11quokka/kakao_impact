# 챗봇 단순기록 디바운스 + 다중 사진 버그 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단순기록 모드에서 3.5초 디바운스 후 "기록이 저장됐어요" 응답 전송, 여러 장 사진을 동시에 보낼 때 마지막 한 장만 저장되는 버그 수정.

**Architecture:** 단순기록 모드는 asyncio.create_task + useCallback 패턴으로 3.5초 비활동 후 일괄 저장한다. 다중 사진은 `pending_photo`의 `url` 필드를 `urls: list[str]`로 교체하고 `_safe_pending_photo` 반환값을 list로 바꾼다. 추가 사진은 텍스트 수신 시점에 background_tasks로 즉시 단순기록 저장한다.

**Tech Stack:** Python 3.12, FastAPI, asyncio, psycopg2-binary, Kakao useCallback 패턴

---

## File Map

| 파일 | 변경 내용 |
|------|---------|
| `2_Ulog/ai/chatbot/main.py` | asyncio import 추가, 디바운스 상태변수, `_flush_simple_records`, 단순기록 핸들러 2곳, `_safe_pending_photo`, 사진 수신 로직, webhook 콜사이트 |

---

### Task 1: asyncio 임포트 + 디바운스 상태 변수 추가

**Files:**
- Modify: `2_Ulog/ai/chatbot/main.py:1-14` (import 블록)
- Modify: `2_Ulog/ai/chatbot/main.py:54-62` (상태 변수 블록)

- [ ] **Step 1: `import asyncio` 추가**

`main.py` 14번째 줄 `import psycopg2` 다음에 추가:

```python
import asyncio
```

결과: line 15에 `import asyncio` 삽입

- [ ] **Step 2: 디바운스 상태 변수 4개 추가**

line 59 (`pending_reflection: dict = {}`) 다음, line 61 (`PHOTO_TIMEOUT`) 직전에 추가:

```python
SIMPLE_RECORD_DEBOUNCE_S = 3.5
pending_simple_buffer: dict[str, list[dict]] = {}  # {user_id: [{text,has_photo,image_url}]}
pending_simple_callback: dict[str, str] = {}        # {user_id: callback_url}
pending_simple_timer: dict[str, asyncio.Task] = {}  # {user_id: debounce task}
```

- [ ] **Step 3: 변경 확인**

```bash
grep -n "SIMPLE_RECORD_DEBOUNCE_S\|import asyncio" 2_Ulog/ai/chatbot/main.py
```

Expected:
```
15:import asyncio
60:SIMPLE_RECORD_DEBOUNCE_S = 3.5
```

- [ ] **Step 4: Commit**

```bash
git add 2_Ulog/ai/chatbot/main.py
git commit -m "|FEAT| 챗봇 단순기록 디바운스 상태 변수 및 asyncio 추가"
```

---

### Task 2: `_flush_simple_records` 비동기 함수 추가

**Files:**
- Modify: `2_Ulog/ai/chatbot/main.py:572` (save_gem 함수 끝 다음)

- [ ] **Step 1: `save_gem` 끝 위치 확인**

```bash
grep -n "^def save_gem\|^def _ensure_reflection" 2_Ulog/ai/chatbot/main.py
```

Expected: `save_gem`은 535, `_ensure_reflection_schema`는 574 근처. 두 함수 사이 빈 줄에 삽입.

- [ ] **Step 2: `_flush_simple_records` 함수 추가**

`save_gem` 함수 끝(`conn.close()` 줄) 바로 뒤, `_ensure_reflection_schema` 앞에 삽입:

```python

async def _flush_simple_records(user_id: str) -> None:
    await asyncio.sleep(SIMPLE_RECORD_DEBOUNCE_S)
    entries = pending_simple_buffer.pop(user_id, [])
    cb_url = pending_simple_callback.pop(user_id, None)
    pending_simple_timer.pop(user_id, None)
    if not entries:
        return
    for entry in entries:
        save_gem(user_id, "단순기록", entry["text"], entry["has_photo"], entry.get("image_url"), None)
    if cb_url:
        response = kakao_response("기록이 저장됐어요 ", custom_replies=BASE_QUICK_REPLIES)
        try:
            requests.post(cb_url, json=response, timeout=5)
        except Exception as e:
            print(f"[simple_flush error] {e}")
```

> `kakao_response`와 `BASE_QUICK_REPLIES`는 main.py 878번째 줄 이후에 정의되어 있어 순서상 문제 없음. `_flush_simple_records`는 asyncio 이벤트 루프에서만 호출되므로 forward reference 없음.

- [ ] **Step 3: 확인**

```bash
grep -n "_flush_simple_records" 2_Ulog/ai/chatbot/main.py
```

Expected: 함수 정의 줄 1개 표시.

- [ ] **Step 4: Commit**

```bash
git add 2_Ulog/ai/chatbot/main.py
git commit -m "|FEAT| 챗봇 단순기록 디바운스 flush 함수 추가"
```

---

### Task 3: 단순기록 모드 — 사진 핸들러 디바운스 적용

**Files:**
- Modify: `2_Ulog/ai/chatbot/main.py:1655-1660`

현재 코드 (line 1655-1660):
```python
        if pending_simple_record.get(user_id):
            background_tasks.add_task(save_gem, user_id, "단순기록", "", True, utterance, None)
            return JSONResponse(kakao_response(
                "사진이 바로 저장됐어요! ",
                custom_replies=BASE_QUICK_REPLIES
            ))
```

- [ ] **Step 1: 사진 핸들러를 디바운스 방식으로 교체**

위 6줄을 다음으로 교체:

```python
        if pending_simple_record.get(user_id):
            pending_simple_buffer.setdefault(user_id, []).append(
                {"text": "", "has_photo": True, "image_url": utterance}
            )
            if callback_url:
                pending_simple_callback[user_id] = callback_url
            existing = pending_simple_timer.pop(user_id, None)
            if existing and not existing.done():
                existing.cancel()
            pending_simple_timer[user_id] = asyncio.create_task(_flush_simple_records(user_id))
            if callback_url:
                return JSONResponse({"version": "2.0", "useCallback": True})
            background_tasks.add_task(save_gem, user_id, "단순기록", "", True, utterance, None)
            return JSONResponse(kakao_response("사진이 바로 저장됐어요! ", custom_replies=BASE_QUICK_REPLIES))
```

> callback_url이 없는 경우(테스트/개발 환경) 기존 즉시 저장 방식으로 폴백.

- [ ] **Step 2: 확인**

```bash
grep -n "pending_simple_buffer\|pending_simple_timer" 2_Ulog/ai/chatbot/main.py | head -20
```

Expected: Task 1에서 추가한 선언 + 지금 추가한 사진 핸들러 2곳.

- [ ] **Step 3: Commit**

```bash
git add 2_Ulog/ai/chatbot/main.py
git commit -m "|FEAT| 챗봇 단순기록 사진 핸들러 디바운스 적용"
```

---

### Task 4: 단순기록 모드 — 텍스트 핸들러 디바운스 적용

**Files:**
- Modify: `2_Ulog/ai/chatbot/main.py` — `"기록됐어요! "` 가 있는 단순기록 블록

- [ ] **Step 1: 현재 텍스트 핸들러 위치 확인**

```bash
grep -n '"기록됐어요' 2_Ulog/ai/chatbot/main.py
```

Expected: `"기록됐어요! "` 가 있는 줄 번호 확인. (Task 3 적용 후 줄 번호가 +6 이동함)

현재 코드:
```python
    if pending_simple_record.get(user_id):
        background_tasks.add_task(save_gem, user_id, "단순기록", utterance, False, None, None)
        return JSONResponse(kakao_response(
            "기록됐어요! ",
            custom_replies=BASE_QUICK_REPLIES
        ))
```

- [ ] **Step 2: 텍스트 핸들러를 디바운스 방식으로 교체**

위 6줄을 다음으로 교체:

```python
    if pending_simple_record.get(user_id):
        pending_simple_buffer.setdefault(user_id, []).append(
            {"text": utterance, "has_photo": False, "image_url": None}
        )
        if callback_url:
            pending_simple_callback[user_id] = callback_url
        existing = pending_simple_timer.pop(user_id, None)
        if existing and not existing.done():
            existing.cancel()
        pending_simple_timer[user_id] = asyncio.create_task(_flush_simple_records(user_id))
        if callback_url:
            return JSONResponse({"version": "2.0", "useCallback": True})
        background_tasks.add_task(save_gem, user_id, "단순기록", utterance, False, None, None)
        return JSONResponse(kakao_response("기록됐어요! ", custom_replies=BASE_QUICK_REPLIES))
```

- [ ] **Step 3: 확인**

```bash
grep -n "pending_simple_buffer\|pending_simple_timer\|pending_simple_callback" 2_Ulog/ai/chatbot/main.py | wc -l
```

Expected: 12줄 이상 (선언 4줄 + 사진 핸들러 4줄 + 텍스트 핸들러 4줄).

- [ ] **Step 4: Commit**

```bash
git add 2_Ulog/ai/chatbot/main.py
git commit -m "|FEAT| 챗봇 단순기록 텍스트 핸들러 디바운스 적용"
```

---

### Task 5: 다중 사진 버그 수정 — `pending_photo` 구조 변경

**Files:**
- Modify: `2_Ulog/ai/chatbot/main.py:935-951` (`_safe_pending_photo`)
- Modify: `2_Ulog/ai/chatbot/main.py` (사진 수신 저장 로직 — `print(f"[image detected]")` 이후 블록)

- [ ] **Step 1: `_safe_pending_photo` 반환값 list로 변경**

현재 코드 (line 935-951):
```python
def _safe_pending_photo(user_id: str) -> tuple[bool, str | None, datetime | None]:
    data = pending_photo.get(user_id)
    if not isinstance(data, dict):
        pending_photo.pop(user_id, None)
        return False, None, None

    photo_time = data.get("time")
    photo_url = data.get("url")
    if not isinstance(photo_time, datetime) or not photo_url:
        pending_photo.pop(user_id, None)
        return False, None, None

    if datetime.now() - photo_time > PHOTO_TIMEOUT:
        pending_photo.pop(user_id, None)
        return False, None, None

    return True, str(photo_url), photo_time
```

다음으로 교체:

```python
def _safe_pending_photo(user_id: str) -> tuple[bool, list[str], datetime | None]:
    data = pending_photo.get(user_id)
    if not isinstance(data, dict):
        pending_photo.pop(user_id, None)
        return False, [], None

    photo_time = data.get("time")
    # "urls" 필드(신규) 또는 "url" 필드(이전 형식 하위 호환)
    urls: list[str] = data.get("urls") or ([data["url"]] if data.get("url") else [])
    if not isinstance(photo_time, datetime) or not urls:
        pending_photo.pop(user_id, None)
        return False, [], None

    if datetime.now() - photo_time > PHOTO_TIMEOUT:
        pending_photo.pop(user_id, None)
        return False, [], None

    return True, [str(u) for u in urls], photo_time
```

- [ ] **Step 2: 사진 수신 로직 — 단일 URL 덮어쓰기 → 누적 저장**

현재 사진 수신 블록:
```python
        print(f"[image detected] user={user_id}, utterance={utterance}")
        pending_photo[user_id] = {"time": datetime.now(), "url": utterance}
        return JSONResponse(kakao_response(
            "사진으로 오늘을 담아주셨네요.\n\n"
            "이 순간, 어떤 마음이었나요?\n"
            "한 줄만 더 적어주시면 감정 원석을 찾아드려요.\n"
            "10분 안에 적어주시면 사진과 함께 저장돼요! ⏰\n\n"
            "그냥 일상으로 남겨도 괜찮아요.",
            custom_replies=PHOTO_QUICK_REPLIES
        ))
```

다음으로 교체:

```python
        print(f"[image detected] user={user_id}, utterance={utterance}")
        existing = pending_photo.get(user_id, {})
        if (
            isinstance(existing.get("urls"), list)
            and isinstance(existing.get("time"), datetime)
            and datetime.now() - existing["time"] <= PHOTO_TIMEOUT
        ):
            existing["urls"].append(utterance)
            existing["time"] = datetime.now()
            pending_photo[user_id] = existing
            count = len(existing["urls"])
            return JSONResponse(kakao_response(
                f"사진 {count}장이 모였어요! ✨\n"
                "텍스트도 함께 보내주시면 감정 원석을 찾아드려요.",
                custom_replies=PHOTO_QUICK_REPLIES
            ))
        else:
            pending_photo[user_id] = {"time": datetime.now(), "urls": [utterance]}
            return JSONResponse(kakao_response(
                "사진으로 오늘을 담아주셨네요.\n\n"
                "이 순간, 어떤 마음이었나요?\n"
                "한 줄만 더 적어주시면 감정 원석을 찾아드려요.\n"
                "10분 안에 적어주시면 사진과 함께 저장돼요! ⏰\n\n"
                "그냥 일상으로 남겨도 괜찮아요.",
                custom_replies=PHOTO_QUICK_REPLIES
            ))
```

- [ ] **Step 3: 구문 오류 확인**

```bash
python -c "
import ast
with open('2_Ulog/ai/chatbot/main.py') as f:
    src = f.read()
ast.parse(src)
print('syntax OK')
"
```

Expected: `syntax OK`

- [ ] **Step 4: Commit**

```bash
git add 2_Ulog/ai/chatbot/main.py
git commit -m "|FIX| 챗봇 사진 여러 장 전송 시 마지막만 저장되는 버그 수정"
```

---

### Task 6: webhook 콜사이트 — 다중 사진 처리

**Files:**
- Modify: `2_Ulog/ai/chatbot/main.py` — `_safe_pending_photo` 호출 직후 (webhook 함수 하단)

- [ ] **Step 1: 콜사이트 위치 확인**

```bash
grep -n "_safe_pending_photo" 2_Ulog/ai/chatbot/main.py
```

Expected: `_safe_pending_photo(user_id)` 호출 줄 1개 확인 (webhook 함수 내부).

- [ ] **Step 2: 언팩 구문 및 추가 사진 처리 추가**

현재:
```python
    has_photo, image_url, photo_time = _safe_pending_photo(user_id)
```

다음으로 교체 (4줄):
```python
    has_photo, image_urls, photo_time = _safe_pending_photo(user_id)
    image_url = image_urls[0] if image_urls else None
    for _extra_url in image_urls[1:]:
        background_tasks.add_task(save_gem, user_id, "단순기록", "", True, _extra_url, None)
```

> 주 사진(image_urls[0])은 기존 감정분류 흐름 유지. 추가 사진(image_urls[1:])은 단순기록으로 즉시 저장.

- [ ] **Step 3: 전체 구문 검증 + import 확인**

```bash
python -c "
import ast
with open('2_Ulog/ai/chatbot/main.py') as f:
    src = f.read()
ast.parse(src)
print('syntax OK')
"
```

Expected: `syntax OK`

```bash
cd 2_Ulog/ai/chatbot && python -c "from main import app; print('import OK')"
```

Expected: `import OK`

- [ ] **Step 4: Commit**

```bash
git add 2_Ulog/ai/chatbot/main.py
git commit -m "|FEAT| 챗봇 다중 사진 수신 시 추가 사진 단순기록 저장 처리"
```

---

## 검증 시나리오

### 단순기록 디바운스 검증
1. 카카오 챗봇에서 "단순기록 모드" 입력 → 모드 전환 메시지 확인
2. 텍스트 1개 입력 → 3.5초 내 응답 없음 확인
3. 3.5초 대기 → "기록이 저장됐어요 " 응답 수신 확인
4. 텍스트 2개를 1초 간격으로 빠르게 입력 → 마지막 입력 후 3.5초에 응답 **1번만** 수신 확인
5. DB 확인: `SELECT gem, record_text, created_at FROM chatbot ORDER BY created_at DESC LIMIT 5;`

### 다중 사진 버그 검증
1. 감정분류 모드에서 사진 1장 전송 → "사진으로 오늘을 담아주셨네요." 응답
2. 사진 1장 추가 전송 (10분 이내) → "사진 2장이 모였어요! ✨" 응답
3. 텍스트 입력 → 감정 분류 진행
4. "맞아요" 클릭 → 저장 완료
5. DB 확인: 주 사진이 포함된 감정 원석 레코드 1개 + 추가 사진 단순기록 1개 = 총 2개 존재

---

## 별도 플랜 예정: EXIF 이벤트 그룹화

다음 기능은 **별도 플랜 B**로 분리 작성 예정:
- 사진 EXIF 메타데이터 추출 (촬영 시간, GPS 좌표)
- 시간/위치 간격 기준으로 사진을 이벤트 단위로 그룹화
- 이벤트별 자동 감정 분석 (OpenAI Vision API 또는 메타데이터 기반)
- 필요 라이브러리: `piexif` 추가 (`2_Ulog/ai/chatbot/requirements.txt`)
