"""
OWNER    : Tejas
DUE      : D1 13:00  ← CRITICAL PATH (Yasho1 blocked until a sample exists)
TASK     :
  Partial GFS download (§6.3): parse {file}.idx, HTTP Range-fetch only the 9 records
  (UGRD/VGRD 10 m, 925 mb, 850 mb, HPBL surface, TMP 2 m, RH 2 m), decode with cfgrib, crop to AOI + 1°,
  write raw/gfs/run=<run_id>/f<FFF>.nc with variables EXACTLY: u10 v10 u925 v925 u850 v850 hpbl t2m rh2m, dims (latitude, longitude), coord `valid_time`.
  fetch_forecast_hour(run_id, fff) is the Map-state unit of work. Also script mode: `python -m plumetrace_engine.ingest.gfs --run latest --hours 0-72 --local`.
DONE WHEN: A sample run f000..f072 sits in .local-s3 and on S3 by D1 13:00 and Yasho1 confirms the variable names.
GUIDE    : docs/team/TEJAS.md  |  brief: docs/PROJECT_BRIEF.md
STATUS   : WIP
  Parser + range math are complete and unit-tested (tests/engine/test_ingest_parsers.py).
  The decode→crop→write path is implemented but needs cfgrib/eccodes (the engine
  container) + network + AWS creds, so the actual f000..f072 sample delivery and
  Yasho1's variable-name sign-off (handoff #1) finish once this runs inside the
  engine Docker image. See the "to finish DONE" note at the bottom.
"""
from __future__ import annotations

import argparse
import logging
import tempfile
from dataclasses import dataclass
from datetime import timedelta, timezone

import numpy as np

from plumetrace_engine.common import aoi, s3io, timeutil

log = logging.getLogger(__name__)

GFS_HTTPS_BASE = "https://noaa-gfs-bdp-pds.s3.amazonaws.com"

# (VAR, LEVEL as printed in the .idx) -> contract output variable name.
IDX_WANTED: dict[tuple[str, str], str] = {
    ("UGRD", "10 m above ground"): "u10",
    ("VGRD", "10 m above ground"): "v10",
    ("UGRD", "925 mb"): "u925",
    ("VGRD", "925 mb"): "v925",
    ("UGRD", "850 mb"): "u850",
    ("VGRD", "850 mb"): "v850",
    ("HPBL", "surface"): "hpbl",
    ("TMP", "2 m above ground"): "t2m",
    ("RH", "2 m above ground"): "rh2m",
}

# cfgrib cannot open mixed level types at once; open one group per (typeOfLevel, level).
CFGRIB_GROUPS = [
    ({"typeOfLevel": "heightAboveGround", "level": 10}, {"u": "u10", "v": "v10"}),
    ({"typeOfLevel": "heightAboveGround", "level": 2}, {"t2m": "t2m", "r2": "rh2m"}),
    ({"typeOfLevel": "isobaricInhPa", "level": 925}, {"u": "u925", "v": "v925"}),
    ({"typeOfLevel": "isobaricInhPa", "level": 850}, {"u": "u850", "v": "v850"}),
    ({"typeOfLevel": "surface", "shortName": "hpbl"}, {"hpbl": "hpbl"}),
]

CONTRACT_VARS = ["u10", "v10", "u925", "v925", "u850", "v850", "hpbl", "t2m", "rh2m"]


@dataclass(frozen=True)
class IdxRecord:
    num: int
    offset: int
    var: str
    level: str
    fcst: str
    end: int | None  # inclusive end byte, or None for the final (open-ended) record


def gfs_base_url(run_id: str, fff: int) -> str:
    """HTTPS URL of a GFS pgrb2 file for a cycle and forecast hour (no .idx suffix)."""
    dt = timeutil.run_id_to_dt(run_id)
    ymd, hh = dt.strftime("%Y%m%d"), dt.strftime("%H")
    return f"{GFS_HTTPS_BASE}/gfs.{ymd}/{hh}/atmos/gfs.t{hh}z.pgrb2.0p25.f{fff:03d}"


def parse_idx(text: str) -> list[IdxRecord]:
    """
    Parse a GFS ``.idx`` file. Each line is
    ``n:byte_offset:d=YYYYMMDDHH:VAR:LEVEL:fcst:``.
    The inclusive ``end`` byte of record i is ``offset(i+1) - 1``; the last record
    is open-ended (``end=None``).
    """
    raw: list[tuple[int, int, str, str, str]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split(":")
        if len(parts) < 6:
            continue
        num = int(parts[0])
        offset = int(parts[1])
        var = parts[3]
        level = parts[4]
        fcst = parts[5]
        raw.append((num, offset, var, level, fcst))

    records: list[IdxRecord] = []
    for i, (num, offset, var, level, fcst) in enumerate(raw):
        end = raw[i + 1][1] - 1 if i + 1 < len(raw) else None
        records.append(IdxRecord(num, offset, var, level, fcst, end))
    return records


def wanted_ranges(records: list[IdxRecord]) -> list[tuple[str, int, int | None]]:
    """
    From parsed idx records, return ``(out_name, start, end)`` for the 9 contract
    records only. ``end`` may be None (open-ended, fetch to EOF).
    """
    out: list[tuple[str, int, int | None]] = []
    for r in records:
        name = IDX_WANTED.get((r.var, r.level))
        if name is not None:
            out.append((name, r.offset, r.end))
    return out


def range_header(start: int, end: int | None) -> str:
    """HTTP Range header value for a byte span (open-ended when end is None)."""
    return f"bytes={start}-" if end is None else f"bytes={start}-{end}"


def _fetch(url: str, timeout: int = 60):
    import requests  # lazy

    return requests.get(url, timeout=timeout)


def fetch_grib_records(base_url: str, ranges: list[tuple[str, int, int | None]]) -> bytes:
    """Range-fetch each wanted record and concatenate into one GRIB2 byte blob."""
    chunks: list[bytes] = []
    for _name, start, end in ranges:
        resp = _fetch_range(base_url, start, end)
        chunks.append(resp)
    return b"".join(chunks)


def _fetch_range(url: str, start: int, end: int | None, timeout: int = 60) -> bytes:
    import requests  # lazy

    headers = {"Range": range_header(start, end)}
    resp = requests.get(url, headers=headers, timeout=timeout)
    resp.raise_for_status()
    return resp.content


def _decode_and_crop(grib_bytes: bytes, run_id: str, fff: int):
    """GRIB2 bytes -> cropped xarray Dataset with the contract variable names."""
    import xarray as xr  # lazy (needs cfgrib + eccodes)

    with tempfile.NamedTemporaryFile(suffix=".grib2", delete=False) as tmp:
        tmp.write(grib_bytes)
        tmp_path = tmp.name

    arrays = {}
    for filter_keys, rename in CFGRIB_GROUPS:
        ds = xr.open_dataset(
            tmp_path, engine="cfgrib", backend_kwargs={"filter_by_keys": filter_keys}
        )
        for src, dst in rename.items():
            if src in ds:
                # Drop scalar level/time coords (isobaricInhPa, heightAboveGround,
                # surface, step, time, valid_time, ...). They differ between GRIB
                # groups and otherwise raise a MergeError when combined into one
                # Dataset. We only need each variable on the lat/lon grid.
                arrays[dst] = ds[src].reset_coords(drop=True)

    merged = xr.Dataset(arrays)

    # Crop to the AOI + 1° margin (brief §6.3). GFS lats descend, lons are 0..360.
    box = aoi.AOI_GFS_CROP
    lat, lon = merged["latitude"], merged["longitude"]
    merged = merged.sel(
        latitude=lat[(lat >= box.south) & (lat <= box.north)],
        longitude=lon[(lon >= box.west) & (lon <= box.east)],
    )

    valid = timeutil.run_id_to_dt(run_id) + timedelta(hours=fff)
    # Store as numpy datetime64 (naive UTC) — a tz-aware Python datetime can't be
    # serialized by xarray.to_netcdf ("unable to infer dtype on variable valid_time").
    valid_naive = valid.astimezone(timezone.utc).replace(tzinfo=None)
    merged = merged.assign_coords(valid_time=np.datetime64(valid_naive, "ns"))
    merged.attrs.update({"run_id": run_id, "lead_h": fff})
    return merged[CONTRACT_VARS] if all(v in merged for v in CONTRACT_VARS) else merged


def fetch_forecast_hour(run_id: str, fff: int) -> str:
    """
    Map-state unit of work: download the 9 records for one forecast hour, decode,
    crop, and write ``raw/gfs/run=<run_id>/f<FFF>.nc``. Returns the S3 key.
    """
    base = gfs_base_url(run_id, fff)
    idx_text = _fetch(base + ".idx").text
    ranges = wanted_ranges(parse_idx(idx_text))
    if len(ranges) != len(IDX_WANTED):
        log.warning("f%03d: found %d/%d wanted records in idx", fff, len(ranges), len(IDX_WANTED))
    grib = fetch_grib_records(base, ranges)
    ds = _decode_and_crop(grib, run_id, fff)
    key = s3io.key_raw_gfs(run_id, fff)
    s3io.put_netcdf(key, ds)
    log.info("wrote %s (%d vars)", key, len(ds.data_vars))
    return key


def _parse_hours(spec: str) -> list[int]:
    if "-" in spec:
        a, b = spec.split("-", 1)
        return list(range(int(a), int(b) + 1))
    return [int(x) for x in spec.split(",") if x != ""]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Fetch GFS forecast hours into raw/gfs/.")
    ap.add_argument("--run", default="latest", help="run_id like 2026-10-09T00Z, or 'latest'")
    ap.add_argument("--hours", default="0-72", help="e.g. 0-72 or 0,3,6")
    ap.add_argument("--local", action="store_true", help="force PT_LOCAL=1")
    args = ap.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if args.local:
        import os

        os.environ["PT_LOCAL"] = "1"

    run_id = args.run
    if run_id == "latest":
        from plumetrace_engine.ingest.resolve_run import resolve_run

        run_id = resolve_run()["run_id"]

    for fff in _parse_hours(args.hours):
        fetch_forecast_hour(run_id, fff)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())


# ---------------------------------------------------------------------------
# To finish DONE (needs the engine container / an AWS box, not this laptop):
#   1. Build engine/Dockerfile (cfgrib + eccodes), then inside it:
#        PT_LOCAL=1 python -m plumetrace_engine.ingest.gfs --run <latest> --hours 0-72 --local
#      and confirm each f<FFF>.nc has vars: u10 v10 u925 v925 u850 v850 hpbl t2m rh2m.
#   2. Re-run with PT_BUCKET set (no --local) to land the sample on S3.
#   3. Ping Yasho1 to confirm the variable names (handoff #1), then flip STATUS -> DONE.
# ---------------------------------------------------------------------------
