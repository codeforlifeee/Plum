"""
OWNER    : Tejas
DUE      : D2 12:00
TASK     :
  PutEvents forecast.published on bus plumetrace-<stage> with detail built from summary.json, validated by pydantic ForecastPublishedDetail.
DONE WHEN: AC2: the event triggers both gov autoDraft and fleet dose handler.
GUIDE    : docs/team/TEJAS.md  |  brief: docs/PROJECT_BRIEF.md
STATUS   : WIP
  Detail construction (brief §8.3) + local-mode emit are complete and unit-tested
  (tests/engine/test_publish_event.py). AC2 (the event actually triggering gov
  autoDraft + fleet dose) verifies only on the real EventBridge bus after EngineStack
  is deployed. pydantic validation is a soft no-op until contracts freeze.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from plumetrace_engine.common import s3io

log = logging.getLogger(__name__)

SOURCE = "plumetrace.engine"
DETAIL_TYPE = "forecast.published"


def _bus_name(stage: str) -> str:
    return os.environ.get("PT_EVENT_BUS") or f"plumetrace-{stage}"


def _summary_s3_uri(run_id: str) -> str:
    key = s3io.key_outputs_summary(run_id)
    # Always an s3:// URI (contract ForecastPublishedDetail.summary_s3). Offline
    # (no PT_BUCKET) use a placeholder bucket so the event still validates.
    bucket = os.environ.get("PT_BUCKET") or "plumetrace-local"
    return f"s3://{bucket}/{key}"


def build_detail(summary: dict, run_id: str, degraded: list[str] | None = None) -> dict:
    """
    Map summary.json -> the forecast.published `detail` (brief §8.3 + D-10 additions
    hotspot_villages[]/degraded[]). Unknown/missing summary keys fall back sensibly so
    a partial summary still produces a valid-shaped event.
    """
    degraded = degraded if degraded is not None else summary.get("degraded", [])
    detail = {
        "run_id": run_id,
        "issued_at": summary.get("issued_at") or _now_z(),
        "max_pm25": summary.get("max_pm25"),
        "peak_window_utc": summary.get("peak_window_utc") or summary.get("peak_window"),
        "delhi_fire_share_p50": summary.get("delhi_fire_share_p50"),
        "hotspot_districts": summary.get("hotspot_districts", []),
        "hotspot_villages": summary.get("hotspot_villages", []),  # D-10
        "degraded": degraded,  # D-10
        "summary_s3": summary.get("summary_s3") or _summary_s3_uri(run_id),
        "model_version": summary.get("model_version"),
    }
    return detail


def _now_z() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")


def _validate(detail: dict) -> None:
    try:
        from plumetrace_contracts import models  # type: ignore
    except Exception:
        return
    model = getattr(models, "ForecastPublishedDetail", None)
    if model is not None:
        model.model_validate(detail)


def build_envelope(detail: dict, stage: str) -> dict:
    """The full EventBridge PutEvents entry (source/detail-type/detail/bus)."""
    return {
        "Source": SOURCE,
        "DetailType": DETAIL_TYPE,
        "Detail": detail,
        "EventBusName": _bus_name(stage),
    }


def publish(run_id: str, stage: str, degraded: list[str] | None = None, summary: dict | None = None,
            events_client=None) -> dict:
    """
    Build and emit forecast.published. In local mode (PT_LOCAL=1) the event is written to
    outputs/run=<id>/forecast_published.event.json instead of hitting EventBridge, so the
    whole pipeline runs offline. Returns the envelope (with Detail as a dict).
    """
    if summary is None:
        summary = s3io.get_json(s3io.key_outputs_summary(run_id))
    detail = build_detail(summary, run_id, degraded)
    _validate(detail)
    envelope = build_envelope(detail, stage)

    # Write the outputs/latest.json pointer (D-10): the API resolves the newest run
    # from here (forecast.controllers.js latestPointer). Without it the real read
    # path has no way to find the current run_id.
    pointer = {
        "run_id": run_id,
        "issued_at": _now_z(),
        "summary_s3": _summary_s3_uri(run_id),
        "degraded": degraded or [],
    }
    try:
        s3io.put_json(s3io.key_latest_pointer(), pointer, indent=2)
        log.info("wrote latest pointer -> run %s", run_id)
    except Exception as exc:  # noqa: BLE001 - pointer must not block publish
        log.warning("failed to write latest pointer: %s", exc)

    if s3io.local_mode():
        key = s3io.key_outputs(run_id, "forecast_published.event.json")
        s3io.put_json(key, envelope, indent=2)
        log.info("local mode: wrote event to %s (no EventBridge)", key)
        return envelope

    import json
    import boto3  # lazy

    client = events_client or boto3.client("events")
    resp = client.put_events(
        Entries=[
            {
                "Source": SOURCE,
                "DetailType": DETAIL_TYPE,
                "Detail": json.dumps(detail, ensure_ascii=False),
                "EventBusName": _bus_name(stage),
            }
        ]
    )
    if resp.get("FailedEntryCount"):
        raise RuntimeError(f"PutEvents failed: {resp}")
    log.info("published %s for run %s on %s", DETAIL_TYPE, run_id, _bus_name(stage))
    return envelope
