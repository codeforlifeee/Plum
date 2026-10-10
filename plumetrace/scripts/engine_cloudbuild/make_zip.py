"""
Zip the engine source (engine/ + contracts/python/ + buildspec.yml) for AWS
CodeBuild. The Dockerfile build context is the repo root, so paths are preserved
as engine/... and contracts/python/... inside the zip.

Usage (from the repo root = plumetrace/):
    python scripts/engine_cloudbuild/make_zip.py \
        scripts/engine_cloudbuild/buildspec.yml \
        /tmp/engine-src.zip \
        "$(pwd)"
"""
import os
import sys
import zipfile

buildspec, outzip, root = sys.argv[1], sys.argv[2], sys.argv[3]


def add_dir(z, rel):
    base = os.path.join(root, rel)
    for dp, _dns, fns in os.walk(base):
        if "__pycache__" in dp or ".pytest_cache" in dp:
            continue
        for fn in fns:
            if fn.endswith(".pyc"):
                continue
            full = os.path.join(dp, fn)
            arc = os.path.relpath(full, root).replace(os.sep, "/")
            z.write(full, arc)


with zipfile.ZipFile(outzip, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(buildspec, "buildspec.yml")
    add_dir(z, "engine")
    add_dir(z, os.path.join("contracts", "python"))

with zipfile.ZipFile(outzip) as z:
    names = z.namelist()
print("zip bytes:", os.path.getsize(outzip))
print("entries:", len(names))
print("has Dockerfile:", "engine/Dockerfile" in names)
print("has requirements:", "engine/requirements.txt" in names)
print("has contracts:", any(n.startswith("contracts/python/plumetrace_contracts/") for n in names))
