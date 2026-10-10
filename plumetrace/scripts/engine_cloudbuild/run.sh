#!/usr/bin/env bash
# One iteration of the engine cloud-build/deploy/run loop.
#
#   bash scripts/engine_cloudbuild/run.sh <IMAGE_TAG>
#
# Run from the repo root (plumetrace/). Needs AWS creds for ap-south-1.
# Steps: zip source -> upload to S3 -> CodeBuild -> cdk deploy (fromEcr) -> start execution.
set -euo pipefail

TAG="${1:?usage: run.sh <IMAGE_TAG>  e.g. v4}"
export AWS_REGION=ap-south-1
export CDK_DEFAULT_ACCOUNT=171403826703
export CDK_DEFAULT_REGION=ap-south-1
ACCT=171403826703
BUCKET="plumetrace-${ACCT}-ap-south-1-dev"
ROOT="$(pwd)"
ZIP="/tmp/engine-src.zip"

echo "== 1. zip + upload source =="
python scripts/engine_cloudbuild/make_zip.py scripts/engine_cloudbuild/buildspec.yml "$ZIP" "$ROOT"
aws s3 cp "$ZIP" "s3://${BUCKET}/codebuild/engine-src.zip" --region "$AWS_REGION"

echo "== 2. CodeBuild image ${TAG} =="
BID=$(aws codebuild start-build --project-name pt-engine-build --region "$AWS_REGION" \
  --environment-variables-override "name=IMAGE_TAG,value=${TAG},type=PLAINTEXT" \
  --query "build.id" --output text)
echo "build: $BID"
# wait for the build to finish
while true; do
  S=$(aws codebuild batch-get-builds --region "$AWS_REGION" --ids "$BID" --query "builds[0].buildStatus" --output text)
  echo "  codebuild: $S"
  case "$S" in SUCCEEDED) break;; FAILED|FAULT|STOPPED|TIMED_OUT) echo "BUILD FAILED"; exit 1;; esac
  sleep 20
done

echo "== 3. cdk deploy PtEngine-dev (image ${TAG}) =="
( cd infra && npx cdk deploy PtEngine-dev -e -c stage=dev -c withEngine=1 -c only=PtEngine-dev \
    -c engineImageTag="${TAG}" -c webOrigin=https://dosgkjnpcj1qv.cloudfront.net \
    --require-approval never --output cdk.out.engine )

echo "== 4. start EngineRun execution =="
EXEC=$(aws stepfunctions start-execution --region "$AWS_REGION" \
  --state-machine-arn "arn:aws:states:${AWS_REGION}:${ACCT}:stateMachine:pt-dev-EngineRun" \
  --input '{}' --query "executionArn" --output text)
echo "execution: $EXEC"
echo
echo "Watch it:  aws stepfunctions describe-execution --execution-arn $EXEC --region $AWS_REGION --query status"
echo "Failures:  aws stepfunctions get-execution-history --execution-arn $EXEC --region $AWS_REGION --reverse-order --max-results 30 --query \"events[?contains(type,'Failed')]\""
