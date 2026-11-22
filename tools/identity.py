"""Content identities of the two simulations and their exact source closures."""
import hashlib
from pathlib import Path
import sys


def source_id(prefix, destination, modules):
    files = [Path("sim") / (name + ".js") for name in modules]
    files += [Path("vendor/vanillajs/modules") / name / "index.js" for name in ("terrain", "collision", "math")]
    digest = hashlib.sha256()
    for path in sorted(files):
        digest.update(str(path).encode() + b"\0" + hashlib.sha256(path.read_bytes()).digest())
    line = f"export const {destination} = '{prefix}:{digest.hexdigest()}';\n"
    path = Path("sim") / ("identity.js" if destination == "SOURCE" else "tank-identity.js")
    if "--check" in sys.argv:
        assert path.read_text() == line, f"stale source identity in {path}"
    else:
        path.write_text(line)


source_id("vw-001a", "SOURCE", ("clock", "world", "terrain", "missions"))
source_id("vw-002", "TANK_SOURCE", ("clock", "terrain", "tracks", "tank-combat", "tank-world"))
