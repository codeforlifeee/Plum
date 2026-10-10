"""
OWNER    : Tejas
DUE      : D2 12:00
TASK     :
  Thin Lambda entrypoints, one per Step Functions state: resolve_run, ingest_firms, ingest_gfs_hour, ingest_openaq, trajectories, attribution, forecast, gridding, summarize, publish, verify. Each takes/returns {run_id, degraded[]} and calls Yasho1's / Tejas's module functions — NO science logic here. Docker CMD selects the handler.
DONE WHEN: Each handler runs locally: `python -m plumetrace_engine.handlers <name> '{"run_id":...}'`.
GUIDE    : docs/team/TEJAS.md  |  brief: docs/PROJECT_BRIEF.md
STATUS   : DONE
  Dispatch + the {run_id, degraded[]} envelope are unit-tested (tests/engine/test_handlers.py),
  and `python -m plumetrace_engine.handlers resolve_run '{"run_id":"2026-10-09T00Z"}'` runs
  offline. Ingest handlers call my real functions (need keys/network for live data); the
  science handlers (trajectories/forecast/gridding/summarize/verify) dispatch to Yasho1's
  module functions (YASHO1 §7) and report "module not ready yet" until those land —
  no science logic lives here.

Envelope: every handler takes and returns {"run_id": str, "degraded": [str], ...}.
Lambda event shape: {"handler": "<name>", "payload": {...}} OR the payload directly when
the Docker CMD already selects the handler (`plumetrace_engine.handlers.<name>`).
"""
from __future__ import annotations

import json
import logging
import os
import sys
from typing import Callable

log = logging.getLogger(__name__)

HANDLERS: dict[str, Callable[[dict], dict]] = {}


def handler(name: str):
    def register(fn: Callable[[dict], dict]) -> Callable[[dict], dict]:
        HANDLERS[name] = fn
        return fn
    return register


def _env(payload: dict) -> dict:
    """Ensure the standard envelope keys exist."""
    payload.setdefault("degraded", [])
    return payload


def _degrade(payload: dict, tag: str) -> None:
    if tag not in payload["degraded"]:
        payload["degraded"].append(tag)


def _secret(secret_name: str, env_var: str) -> str:
    """Secret value from an env var (local/dev) or Secrets Manager (cloud)."""
    val = os.environ.get(env_var)
    if val:
        return val
    import boto3  # lazy

    return boto3.client("secretsmanager").get_secret_value(SecretId=secret_name)["SecretString"]


def _not_ready(module: str, fn: str, err: Exception) -> dict:
    """Uniform 'teammate module not available yet' signal (keeps the handler runnable)."""
    log.warning("%s.%s not available yet: %s", module, fn, err)
    return {"status": "pending", "reason": f"{module}.{fn} not implemented yet", "detail": str(err)}


# --------------------------------------------------------------------------- ingest (mine)

@handler("resolve_run")
def resolve_run(payload: dict) -> dict:
    from plumetrace_engine.ingest.resolve_run import resolve_run as _resolve

    payload = _env(payload)
    r = _resolve(run_id=payload.get("run_id"))
    payload.update(r)
    return payload


@handler("ingest_firms")
def ingest_firms(payload: dict) -> dict:
    from plumetrace_engine.ingest import firms

    payload = _env(payload)
    try:
        key = firms.ingest(_secret("plumetrace/firms_map_key", "FIRMS_MAP_KEY"))
        payload["firms_key"] = key
    except firms.FirmsUnavailable as e:  # §9: continue with last data, mark degraded
        log.warning("FIRMS unavailable, marking run degraded: %s", e)
        _degrade(payload, "firms")
    return payload


@handler("ingest_gfs_hour")
def ingest_gfs_hour(payload: dict) -> dict:
    """Map-state unit of work: one forecast hour. Needs {run_id, fff}."""
    from plumetrace_engine.ingest import gfs

    payload = _env(payload)
    fff = int(payload["fff"])
    payload["gfs_key"] = gfs.fetch_forecast_hour(payload["run_id"], fff)
    return payload


@handler("ingest_openaq")
def ingest_openaq(payload: dict) -> dict:
    from plumetrace_engine.ingest import openaq

    payload = _env(payload)
    # OpenAQ supplies observations for verification/skill, not the forecast itself.
    # A 429 / outage must not fail the whole run — mark the run degraded and go on.
    try:
        payload["openaq"] = openaq.ingest(_secret("plumetrace/openaq_key", "OPENAQ_API_KEY"))
    except Exception as exc:  # noqa: BLE001
        log.warning("OpenAQ ingest failed (continuing degraded): %s", exc)
        payload.setdefault("degraded", []).append("openaq")
        payload["openaq"] = {"degraded": True}
    return payload


# --------------------------------------------------------------------------- science (Yasho1's)

@handler("trajectories")
def trajectories(payload: dict) -> dict:
    payload = _env(payload)
    try:
        from plumetrace_engine.trajectories import ensemble, winds
        from plumetrace_engine.common import s3io

        stations = s3io.get_json(s3io.key_stations())["locations"]
        field = winds.build_wind_field(payload["run_id"])  # handoff #10: confirm this constructor
        ensemble.run_trajectories(payload["run_id"], stations, field)
    except Exception as e:  # noqa: BLE001 - keep the handler runnable until the module lands
        payload["trajectories"] = _not_ready("trajectories.ensemble", "run_trajectories", e)
    return payload


@handler("forecast")
def forecast(payload: dict) -> dict:
    """Runs attribution + the LightGBM forecast (D-12: attribution folds into run_forecast)."""
    payload = _env(payload)
    try:
        from plumetrace_engine.model import infer

        payload["forecast"] = infer.run_forecast(payload["run_id"])
    except Exception as e:  # noqa: BLE001
        payload["forecast"] = _not_ready("model.infer", "run_forecast", e)
    return payload


@handler("gridding")
def gridding(payload: dict) -> dict:
    payload = _env(payload)
    try:
        from plumetrace_engine.gridding import idw_h3

        payload["gridding"] = idw_h3.run_gridding(payload["run_id"])
    except Exception as e:  # noqa: BLE001
        payload["gridding"] = _not_ready("gridding.idw_h3", "run_gridding", e)
    return payload


@handler("summarize")
def summarize(payload: dict) -> dict:
    payload = _env(payload)
    try:
        from plumetrace_engine.publish import summarize as _summarize

        payload["summary"] = _summarize.run_summarize(payload["run_id"], payload["degraded"])
    except Exception as e:  # noqa: BLE001
        payload["summary"] = _not_ready("publish.summarize", "run_summarize", e)
    return payload


@handler("publish")
def publish(payload: dict) -> dict:
    from plumetrace_engine.publish import publish_event

    payload = _env(payload)
    stage = payload.get("stage") or os.environ.get("PT_STAGE", "dev")
    payload["event"] = publish_event.publish(payload["run_id"], stage, degraded=payload["degraded"])
    return payload


@handler("verify_fill_obs")
def verify_fill_obs(payload: dict) -> dict:
    payload = _env(payload)
    try:
        from plumetrace_engine.verify import fill_obs

        payload["filled"] = fill_obs.run_fill_obs(payload.get("now"))
    except Exception as e:  # noqa: BLE001
        payload["filled"] = _not_ready("verify.fill_obs", "run_fill_obs", e)
    return payload


@handler("verify_skill")
def verify_skill(payload: dict) -> dict:
    payload = _env(payload)
    try:
        from plumetrace_engine.verify import skill

        payload["skill"] = skill.run_skill(int(payload.get("days", 7)))
    except Exception as e:  # noqa: BLE001
        payload["skill"] = _not_ready("verify.skill", "run_skill", e)
    return payload


# --------------------------------------------------------------------------- dispatch

def dispatch(name: str, payload: dict) -> dict:
    if name not in HANDLERS:
        raise KeyError(f"Unknown handler '{name}'. Known: {sorted(HANDLERS)}")
    return HANDLERS[name](dict(payload))


def lambda_handler(event: dict, context=None) -> dict:  # pragma: no cover - AWS entrypoint
    """Generic Lambda entry; Docker CMD may instead point at plumetrace_engine.handlers.<name>."""
    name = event.get("handler") or os.environ.get("PT_HANDLER")
    payload = event.get("payload", event if name else {})
    return dispatch(name, payload)


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if not argv:
        print(f"usage: python -m plumetrace_engine.handlers <name> '<json>'\nhandlers: {sorted(HANDLERS)}")
        return 2
    name = argv[0]
    payload = json.loads(argv[1]) if len(argv) > 1 else {}
    result = dispatch(name, payload)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
