"""Build the offline game ZIP from the committed Git tree."""
import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PREFIX = "Vehicular-Warfare/"


def package(output):
    revision = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
    ).strip()
    extras = ["LICENSE", "docs/RELEASE.md", "docs/OVERLORD.md", "docs/OVERLORD_INTEL.md",
              "docs/OVERLORD_AUTHORITY.md", "docs/OVERLORD_GROUPS.md", "evidence/creator-systems/copper-crossing.json",
              "evidence/creator-systems/victory-replay.json",
              "evidence/creator-systems/defeat-replay.json"]
    paths = [":(top,glob)*.html", "assets", "game", "sim", "vendor", *extras]
    # Keep partial ZIPs separate until Git's revision and all CRCs check out.
    with tempfile.TemporaryDirectory(dir=output.resolve().parent) as directory:
        staging = Path(directory) / "candidate.zip"
        subprocess.run(
            ["git", "archive", "--format=zip", "--prefix=" + PREFIX,
             "--output=" + str(staging), revision, "--", *paths],
            cwd=ROOT, env={**os.environ, "TZ": "UTC"}, check=True
        )
        with zipfile.ZipFile(staging) as archive:
            if archive.comment.decode("ascii") != revision or archive.testzip() is not None:
                raise ValueError("ZIP revision or integrity check failed")
            for required in ["index.html", "vendor/vanillajs/provenance.json", *extras]:
                archive.getinfo(PREFIX + required)
        staging.replace(output)
    print(revision, output)
    print(hashlib.sha256(output.read_bytes()).hexdigest(), output.name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Path to the candidate ZIP")
    package(parser.parse_args().output)
