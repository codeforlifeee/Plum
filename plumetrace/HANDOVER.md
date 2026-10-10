# PlumeTrace — Team Handover & Runbook

**Audience:** yasho, tanmay, khare (the teammates finishing the live-forecast engine).
**Everything is in AWS account `171403826703`, region `ap-south-1` (Mumbai).**
Read this once top-to-bottom, then use it as your reference.

---

## 0. TL;DR — what's left

The live site at **https://dosgkjnpcj1qv.cloudfront.net** already runs on the **real backend**
(real data from DynamoDB/S3, real gov reports + Punjabi audio + Telegram, real auth). The
**only** thing not yet live is the forecast *numbers* (they're seeded placeholder values). To
make them live you must finish **5 pieces of engine wiring** (Section 5). The science code is
already complete — this is plumbing + debugging. Est. **~4–5 hours**.

---

## 1. Your AWS access — YES, you have everything you need ✅

You were each created as an IAM user in the **`plumetrace-devs`** group with the
**AdministratorAccess** policy. That means **you can see and do everything the project owner
can** (except root-account/billing actions): all logs, all executions, all data, all deploys.

### First login (console)
1. Go to **https://171403826703.signin.aws.amazon.com/console**
2. Username = your name (`yasho` / `tanmay` / `khare`). Password = `PlumeTrace#2026`
   → you'll be forced to set your own password on first login.
3. **Top-right: switch the region to `Asia Pacific (Mumbai) ap-south-1`.** All resources are
   there; you'll see nothing in other regions.
4. (Recommended) Set up **MFA**: IAM → Users → *you* → Security credentials → Assign MFA device.

### CLI access (needed for the build/deploy loop)
1. Console → IAM → Users → *you* → **Security credentials** → **Create access key** → "CLI".
   Copy the Access key ID + Secret (the secret is shown once).
2. On your machine: `aws configure`
   - Access Key / Secret = from step 1
   - Default region name = `ap-south-1`
   - Output = `json`
3. Verify: `aws sts get-caller-identity` → should show your user ARN.

> You do **not** need the owner's credentials. You have your own, with full admin rights.

---

## 2. What already works (don't redo)

Login to the site: `admin@plumetrace.demo` / `Demo#2026` (admin approves all drafts).

| Area | Status |
|---|---|
| REST API: forecast, attribution, skill, fires, trajectories, stations, fleet, actions | ✅ real data (DynamoDB/S3) |
| Cognito auth in real mode | ✅ API accepts the web app's ID token |
| Gov Lambdas: reportGenerator, farmerAlert, fireTrend, executor, autoDraft | ✅ deployed |
| District report preview (real HTML in S3) | ✅ |
| Farmer alert — real Punjabi (Amazon Translate) + Polly audio MP3 | ✅ |
| Approve a draft → EventBridge → executor → **Telegram** | ✅ verified delivering |

**Not live yet:** forecast/attribution/fleet **numbers** are seeded mock-derived values loaded
into the real tables. Section 5 makes them live.

### Infra already set up for the engine work
- **Engine stack deployed** — `PtEngine-dev`: 11 Lambdas + Step Functions `pt-dev-EngineRun`,
  running a **pre-built ECR image** (`pt-dev-engine:v3`). CDK deploy needs **no local Docker**.
- **Cloud build** — CodeBuild project `pt-engine-build`, ECR repo `pt-dev-engine`, role
  `pt-engine-codebuild-role`. Helper scripts in `scripts/engine_cloudbuild/`.
- **Secrets** (Secrets Manager): `plumetrace/telegram`, `plumetrace/firms_map_key`,
  `plumetrace/openaq_key`, `plumetrace/anthropic_key`.
- **Data**: DynamoDB tables `pt-dev-*`, S3 bucket `plumetrace-171403826703-ap-south-1-dev`.

---

## 3. Where to see logs & errors (you have full access to all of these)

All in the console, region **ap-south-1**:

| What | Where |
|---|---|
| **Pipeline failures (start here)** | Step Functions → `pt-dev-EngineRun` → **Executions** → click a run → the graph shows the failed state in red with its input/output/**error cause** |
| **Lambda stack traces** | CloudWatch → Log groups → `/aws/lambda/pt-dev-<handler>` (e.g. `-ingest_gfs_hour`, `-forecast`, `-gridding`, `-summarize`) |
| **Image build logs** | CodeBuild → `pt-engine-build` → build history → Logs |
| **API logs** | CloudWatch → `/aws/lambda/pt-dev-api` |
| **Gov logs** | `/aws/lambda/pt-dev-executor`, `-reportGenerator`, `-farmerAlert`, `-fireTrend`, `-autoDraft` |
| **Container images** | ECR → `pt-dev-engine` (engine) and the `cdk-hnb659fds-container-assets-…` repo (api) |
| **Data** | DynamoDB → `pt-dev-Forecast`/`StationForecast`/`Attribution`/`Actions`/`Riders`/`Shifts`; S3 → `plumetrace-171403826703-ap-south-1-dev` |

**CLI equivalents** (same data, faster to grep):
```bash
# latest execution + its failures
aws stepfunctions list-executions --region ap-south-1 \
  --state-machine-arn arn:aws:states:ap-south-1:171403826703:stateMachine:pt-dev-EngineRun \
  --max-results 1
aws stepfunctions get-execution-history --region ap-south-1 --execution-arn <ARN> \
  --reverse-order --max-results 30 --query "events[?contains(type,'Failed')]"

# tail a Lambda's logs (Git Bash on Windows: prefix MSYS_NO_PATHCONV=1 so /aws/... isn't mangled)
aws logs tail /aws/lambda/pt-dev-forecast --region ap-south-1 --since 15m --follow
```

---

## 4. The build → deploy → run loop (no local Docker)

The heavy scientific image builds **in the cloud** (CodeBuild), so your laptop's RAM/Docker
doesn't matter. One iteration ≈ **35 min** (~15 build + ~5 deploy + ~15 run).

**One command per iteration** (from the repo root `plumetrace/`, bump the tag each time):
```bash
bash scripts/engine_cloudbuild/run.sh v4
```
This zips the engine source → uploads to S3 → CodeBuild builds & pushes the image →
`cdk deploy PtEngine-dev` points the Lambdas at the new image → starts an EngineRun execution,
and prints the commands to watch it.

**Prereqs on your machine:** AWS CLI configured (Section 1), Node 20 + `npm`, Python 3.12, and
`infra/` deps installed (`cd infra && npm ci`). `esbuild@0.28.2` is needed only if you also
redeploy the gov/api stacks: `npm i -g esbuild@0.28.2`.

Watch a run:
```bash
EXEC=<executionArn it printed>
aws stepfunctions describe-execution --execution-arn "$EXEC" --region ap-south-1 --query status
aws stepfunctions get-execution-history --execution-arn "$EXEC" --region ap-south-1 \
  --reverse-order --max-results 30 --query "events[?contains(type,'Failed')]"
```

> **Tip:** to debug a single stage without a full run, invoke its Lambda directly:
> ```bash
> echo '{"run_id":"latest"}' > p.json
> aws lambda invoke --region ap-south-1 --function-name pt-dev-forecast \
>   --payload fileb://p.json out.json ; cat out.json
> ```

---

## 5. The remaining work — the 5 gaps to close

The algorithms in `winds.py`, `ensemble.py`, `fire_load.py`, `idw_h3.py`, `infer.py` are
**complete**. What's missing is the orchestration that calls them. Today the middle stages
swallow errors into a `_not_ready` marker, so a run "succeeds" but writes **empty** forecast
data. Close these in order:

1. **Stations file (missing).** `trajectories` reads `curated/stations/stations.json`
   (`engine/plumetrace_engine/common/s3io.py:key_stations`), which doesn't exist. Create it as
   `{"locations":[{"station_id":"...","lat":..,"lon":..}, ...]}` from the station ids/lat/lon in
   `contracts/mocks/station_forecast.json`, and upload:
   ```bash
   aws s3 cp stations.json \
     s3://plumetrace-171403826703-ap-south-1-dev/curated/stations/stations.json --region ap-south-1
   ```

2. **Feature-building stage (missing).** `features/build_features.py:build_features(...)` is
   complete but **never called**, so `features/run=<run_id>/station_features.parquet` is never
   written → `model/infer.py:run_forecast` returns `{}`. Add a handler in
   `engine/plumetrace_engine/handlers.py` + a Step Functions state in
   `infra/lib/engine-stack.ts` (between `Trajectories` and `Forecast`) that:
   - loads stations, obs (OpenAQ curated), fires (curated), `winds = winds.build_wind_field(run_id)`
   - gets the trajectory set `tset` (from `ensemble.run_trajectories(...)`)
   - `fl_df = fire_load.compute_fire_load(tset, fires)`
   - writes `fires_48h.geojson` via `fire_load.to_fires_geojson(...)` to `s3io.key_outputs_fires_48h(run_id)`
   - `feat = build_features(stations, obs, fl_df, winds, issue_time)`
   - `s3io.put_parquet(s3io.key_features(run_id), feat)`

3. **`idw_h3.run_gridding(run_id)` (missing).** The `gridding` handler calls it, but the module
   only has `grid_forecast(station_fc, run_id)`. Add a `run_gridding(run_id)` wrapper that loads
   the run's StationForecast rows, calls `grid_forecast`, and writes the **Forecast** table with
   items that carry both `sk = "<run_id>#<valid_hour>"` **and** `gsi1sk = "<valid_hour>#<h3>"`
   (the API's `byRun` GSI sorts on `valid_hour`; the item needs both keys).

4. **`publish.summarize.run_summarize(run_id, degraded)` (missing).** The `summarize` handler
   calls it, but the module only has `build_summary(...)` / `validate_summary(...)`. Add a
   `run_summarize` wrapper that builds + validates and writes `summary.json` to
   `s3io.key_outputs_summary(run_id)`. (The publish step already writes `outputs/latest.json`.)

5. **Confirm `infer.run_forecast`** writes StationForecast + Attribution — it does, once the
   features parquet from (2) exists.

### Bugs already fixed (in the repo)
- `ingest/gfs.py`: drop conflicting GRIB level-coords before merge; store `valid_time` as
  `numpy.datetime64`.
- `handlers.py`: OpenAQ 429/outage is non-fatal (run marked degraded, continues).

When the run finally goes green, the API serves the fresh numbers automatically (the
`outputs/latest.json` pointer updates). **Hard-refresh** the site to see them.

---

## 6. Raise these AWS quotas (Service Quotas → ap-south-1)

These new-account caps were worked around; raising them makes the engine faster/full-fidelity:
- **Lambda concurrent executions**: currently **10** → request ≥100 (GFS map is throttled to 3).
- **Lambda memory**: currently **3008 MB** → request **10240 MB** (restore 6 GB for forecast/trajectories).
- Optional: a higher-tier **OpenAQ API key** so observed PM2.5 isn't rate-limited (429).

---

## 7. Honest ceiling

Even fully wired, it's **real inputs + a crude model**: live NASA FIRMS fires + live GFS winds,
but a **persistence** PM2.5 model (no trained LightGBM artifact in the repo) and **rate-limited
OpenAQ** obs (PM2.5 leans on the ~60 µg/m³ default where obs are missing). A trained ML forecast
is a separate, larger effort.

---

## 8. Key names cheat-sheet

```
Account ............ 171403826703          Region ......... ap-south-1
Site ............... https://dosgkjnpcj1qv.cloudfront.net
API ................ https://nh0mdf2cyd.execute-api.ap-south-1.amazonaws.com
Cognito login ...... admin@plumetrace.demo / Demo#2026
State machine ...... arn:aws:states:ap-south-1:171403826703:stateMachine:pt-dev-EngineRun
CodeBuild project .. pt-engine-build
Engine ECR repo .... pt-dev-engine         (current tag: v3)
S3 bucket .......... plumetrace-171403826703-ap-south-1-dev
DynamoDB ........... pt-dev-Forecast / StationForecast / Attribution / Actions / Riders / Shifts
Stacks ............. PtData-dev  PtApi-dev  PtGov-dev  PtEngine-dev  PtWeb-dev
Console sign-in .... https://171403826703.signin.aws.amazon.com/console
```

Detailed engine notes also live in `docs/ENGINE_HANDOFF.md`.
