# PlumeTrace — Engine Handoff & Runbook

This doc hands over the remaining work to finish **live forecast data**. Read it top
to bottom once, then use it as a reference. Everything below is in AWS account
**171403826703**, region **ap-south-1**.

---

## 1. What already works (don't redo)

The live demo at **https://dosgkjnpcj1qv.cloudfront.net** runs on the **real backend**
(`MOCK_MODE=0`) — every page is served from real DynamoDB/S3 via the real API, not the
in-memory mock. Login: `admin@plumetrace.demo` / `Demo#2026` (admin can approve all drafts).

| Area | Status |
|---|---|
| REST API (forecast, attribution, skill, fires, trajectories, stations, fleet, actions) | ✅ real data |
| Cognito auth in real mode | ✅ fixed (API accepts the ID token the web app sends) |
| Gov stack (reportGenerator, farmerAlert, fireTrend, executor, autoDraft) | ✅ deployed & working |
| District report preview (real HTML in S3) | ✅ |
| Farmer alert — real Punjabi (Amazon Translate) + Polly audio MP3 | ✅ |
| Approve → EventBridge → executor → **Telegram** delivery | ✅ verified |

**The only non-live part:** the forecast *numbers* (PM2.5, attribution, fleet dose) are
**seeded** mock-derived values loaded into the real tables. Making them genuinely live is
the remaining work below.

Infra already in place for that work:
- **Engine stack deployed** (`PtEngine-dev`): 11 Lambdas + Step Functions `pt-dev-EngineRun`,
  using a **pre-built ECR image** (`pt-dev-engine:v3`) so CDK deploy needs **no local Docker**.
- **Cloud build pipeline**: CodeBuild project `pt-engine-build` + ECR repo `pt-dev-engine` +
  role `pt-engine-codebuild-role`. Helper scripts in `scripts/engine_cloudbuild/`.
- Secrets created: `plumetrace/telegram`, `plumetrace/firms_map_key`, `plumetrace/openaq_key`,
  `plumetrace/anthropic_key`.

---

## 2. Why the forecast numbers aren't live yet (the remaining work)

The engine's **science functions are complete**, but the **orchestration glue** that wires
them together was never written. Running the pipeline today would "succeed" but write
**empty** forecast data (the middle stages swallow errors into a `_not_ready` marker).

### The 5 gaps to close

1. **Stations file is missing.** `trajectories` reads `curated/stations/stations.json`
   (`s3io.key_stations()`), which doesn't exist. Create it as
   `{"locations": [{"station_id": "...", "lat": .., "lon": ..}, ...]}` — derive the list
   from `contracts/mocks/station_forecast.json` (same station ids/lat/lon the UI expects),
   and upload to `s3://plumetrace-171403826703-ap-south-1-dev/curated/stations/stations.json`.

2. **No feature-building stage.** `features/build_features.py:build_features(...)` is complete
   but **never called**, so `features/run=<run_id>/station_features.parquet` is never written
   → `model/infer.py:run_forecast` reads it, fails, returns `{}`. Write a new handler +
   Step Functions state (between `Trajectories` and `Forecast`) that:
   - loads stations, obs (OpenAQ curated), fires (curated), `winds = winds.build_wind_field(run_id)`
   - runs `tset = ensemble.run_trajectories(...)` (or reuse the one the trajectories step makes)
   - `fl_df = fire_load.compute_fire_load(tset, fires)`
   - writes `fires_48h.geojson` via `fire_load.to_fires_geojson(...)` to
     `s3io.key_outputs_fires_48h(run_id)`
   - `feat = build_features(stations, obs, fl_df, winds, issue_time)`
   - `s3io.put_parquet(s3io.key_features(run_id), feat)`

3. **`idw_h3.run_gridding(run_id)` doesn't exist.** The `gridding` handler calls it, but the
   module only has `grid_forecast(station_fc, run_id)`. Add a `run_gridding(run_id)` wrapper
   that loads the StationForecast rows for the run, calls `grid_forecast`, and writes the
   Forecast table (pk `h3#<h3>`, sk `<run_id>#<valid_hour>`, **and** `gsi1sk = "<valid_hour>#<h3>"`
   — the API's `byRun` GSI sorts on `valid_hour`, and the items must carry both).

4. **`publish.summarize.run_summarize(run_id, degraded)` doesn't exist.** The `summarize`
   handler calls it, but the module only has `build_summary(...)` / `validate_summary(...)`.
   Add a `run_summarize` wrapper that builds + validates and writes `summary.json` to
   `s3io.key_outputs_summary(run_id)`.

5. **Confirm `infer.run_forecast`** writes StationForecast + Attribution (it does) once the
   features parquet from (2) exists.

> The algorithms in `winds.py`, `ensemble.py`, `fire_load.py`, `idw_h3.py`, `infer.py` are
> all real and complete — this is **wiring + data-shape debugging**, not new science.

### Already-fixed engine bugs (in the repo now)
- `ingest/gfs.py`: drop conflicting GRIB level-coords before merge (`reset_coords(drop=True)`);
  store `valid_time` as `numpy.datetime64` (tz-aware datetime can't be serialized to netCDF).
- `handlers.py`: OpenAQ 429/outage is non-fatal (marks the run degraded, continues).

---

## 3. The build/deploy/run loop (no local Docker needed)

Everything builds in the cloud (CodeBuild), so a low-RAM laptop is fine. One iteration ≈ 35 min
(≈15 min build + ≈5 min deploy + ≈15 min run).

**Easiest — one command per iteration** (from the repo root, bump the tag each time):
```bash
bash scripts/engine_cloudbuild/run.sh v4
```
It zips the source, builds the image in CodeBuild, `cdk deploy`s the engine to use that image,
and starts an EngineRun execution, printing the commands to watch it.

**Manual equivalent** (if you want to do steps by hand) — see `scripts/engine_cloudbuild/run.sh`.

After it starts, watch the run:
```bash
EXEC=<the executionArn it printed>
aws stepfunctions describe-execution --execution-arn "$EXEC" --region ap-south-1 --query status
aws stepfunctions get-execution-history --execution-arn "$EXEC" --region ap-south-1 \
  --reverse-order --max-results 30 --query "events[?contains(type,'Failed')]"
```

---

## 4. How to see logs & errors (console)

Region **ap-south-1** in the AWS console:
- **Step Functions** → `pt-dev-EngineRun` → **Executions** → click a failed run → the graph
  shows the failed state in red with its input/output/**error cause**. Start here.
- **CloudWatch → Log groups** → `/aws/lambda/pt-dev-ingest_gfs_hour`, `/aws/lambda/pt-dev-forecast`,
  `/aws/lambda/pt-dev-gridding`, etc. → full Python stack traces.
- **CodeBuild** → `pt-engine-build` → build history → logs (image-build errors).
- **API logs**: `/aws/lambda/pt-dev-api`. **Gov logs**: `/aws/lambda/pt-dev-executor`, `-reportGenerator`, `-farmerAlert`.

CLI note (Git Bash on Windows mangles `/aws/...` paths): prefix with `MSYS_NO_PATHCONV=1`.

---

## 5. Team access (IAM)

Users are in the **`plumetrace-devs`** group (AdministratorAccess). Sign in at:

> **https://171403826703.signin.aws.amazon.com/console** — region **ap-south-1 (Mumbai)**

- Username = your name (`yasho` / `tanmay` / `khare`), temp password set by the owner
  (you'll reset it on first login).
- **CLI keys** (for the build loop): IAM → Users → (you) → Security credentials → Create access key,
  then `aws configure` with region `ap-south-1`.
- Turn on **MFA** under Security credentials.

---

## 6. AWS quotas worth raising (Service Quotas, ap-south-1)

These are the new-account caps we worked around; raising them makes the engine faster/full-fidelity:
- **Lambda concurrent executions**: currently **10** → request ≥100 (GFS map is throttled to 3).
- **Lambda memory**: currently **3008 MB** → request **10240 MB** (restore 6 GB for forecast/trajectories).
- Optionally a higher-tier **OpenAQ API key** so observed PM2.5 isn't rate-limited (429).

---

## 7. Honest ceiling

Even fully wired, the forecast is **real inputs + a crude model**: live NASA FIRMS fires +
live GFS winds, but a **persistence** PM2.5 model (no trained LightGBM artifact in the repo)
and **rate-limited OpenAQ** observations (so PM2.5 leans on the ~60 µg/m³ default where obs are
missing). A polished ML forecast is a separate, larger effort (model training).

Estimated time to close the 5 gaps: **~4–5 hours** (≈1–1.5h writing wrappers + ≈2.5–4.5h debug cycles).
