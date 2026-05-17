"""챗봇 영구 로깅 헬퍼.

설계: docs/superpowers/specs/2026-05-17-chatbot-full-text-log-and-s3-design.md

원칙
- 모든 write 는 try/except 로 감싼다. 로깅 실패가 사용자 응답을 깨지 않게.
- DB 가 없거나 RAILWAY_DATABASE_URL 미설정이면 stdout 으로 fallback.
- 호출자는 trace_id 를 webhook 진입부에서 1회 생성해서 모든 helper 에 전달.
"""

from __future__ import annotations

import os
import traceback as _tb
import uuid
from typing import Any

import psycopg2
from psycopg2.extras import Json

RAILWAY_DATABASE_URL = os.getenv("RAILWAY_DATABASE_URL")


def new_trace_id() -> uuid.UUID:
    return uuid.uuid4()


def _connect():
    if not RAILWAY_DATABASE_URL:
        return None
    return psycopg2.connect(RAILWAY_DATABASE_URL)


def log_message(
    *,
    trace_id: uuid.UUID,
    user_id: str,
    direction: str,
    utterance: str | None = None,
    raw_body: Any | None = None,
    callback_url: str | None = None,
    mode: str | None = None,
    pending_state: Any | None = None,
) -> None:
    """webhook in/out 메시지 1건 저장."""
    conn = None
    try:
        conn = _connect()
        if conn is None:
            return
        with conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO chatbot_messages
                  (user_id, trace_id, direction, utterance, raw_body,
                   callback_url, mode, pending_state)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    str(trace_id),
                    direction,
                    utterance,
                    Json(raw_body) if raw_body is not None else None,
                    callback_url,
                    mode,
                    Json(pending_state) if pending_state is not None else None,
                ),
            )
    except Exception as e:  # noqa: BLE001
        print(f"[persist.log_message error] {e}")
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass


def log_llm_call(
    *,
    trace_id: uuid.UUID,
    user_id: str | None,
    call_type: str,
    model: str,
    prompt: str,
    raw_response: Any | None,
    parsed_result: str | None,
    status: str,
    status_code: int | None = None,
    error_text: str | None = None,
    latency_ms: int | None = None,
    attempt: int = 1,
) -> None:
    """OpenAI 호출 1건 저장. call_type: classify|supervisor|emotion_analysis."""
    conn = None
    try:
        conn = _connect()
        if conn is None:
            return
        with conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO chatbot_llm_calls
                  (trace_id, user_id, call_type, model, prompt, raw_response,
                   parsed_result, status, status_code, error_text, latency_ms, attempt)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(trace_id),
                    user_id,
                    call_type,
                    model,
                    prompt,
                    Json(raw_response) if raw_response is not None else None,
                    parsed_result,
                    status,
                    status_code,
                    error_text,
                    latency_ms,
                    attempt,
                ),
            )
    except Exception as e:  # noqa: BLE001
        print(f"[persist.log_llm_call error] {e}")
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass


def log_error(
    *,
    source: str,
    message: str,
    trace_id: uuid.UUID | None = None,
    user_id: str | None = None,
    exc: BaseException | None = None,
    context: Any | None = None,
) -> None:
    """잡힌 예외 1건 저장. exc 가 있으면 traceback 자동 추출."""
    tb_text: str | None = None
    if exc is not None:
        try:
            tb_text = "".join(_tb.format_exception(type(exc), exc, exc.__traceback__))
        except Exception:  # noqa: BLE001
            tb_text = None

    conn = None
    try:
        conn = _connect()
        if conn is None:
            print(f"[persist.log_error fallback] source={source} message={message}")
            return
        with conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO chatbot_errors
                  (trace_id, user_id, source, message, traceback, context)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    str(trace_id) if trace_id else None,
                    user_id,
                    source,
                    message,
                    tb_text,
                    Json(context) if context is not None else None,
                ),
            )
    except Exception as e:  # noqa: BLE001
        print(f"[persist.log_error error] {e}")
        print(f"[persist.log_error original] source={source} message={message}")
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass


