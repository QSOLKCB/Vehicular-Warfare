"""Content identities of the game simulations and their exact source closures."""
import hashlib
from pathlib import Path
import sys


def source_id(prefix, destination, output, modules):
    files = [Path("sim") / (name + ".js") for name in modules]
    files += [Path("vendor/vanillajs/modules") / name / "index.js" for name in ("terrain", "collision", "math")]
    digest = hashlib.sha256()
    for path in sorted(files):
        digest.update(str(path).encode() + b"\0" + hashlib.sha256(path.read_bytes()).digest())
    line = f"export const {destination} = '{prefix}:{digest.hexdigest()}';\n"
    path = Path("sim") / output
    if "--check" in sys.argv:
        assert path.read_text() == line, f"stale source identity in {path}"
    else:
        path.write_text(line)


source_id("vw-001a", "SOURCE", "identity.js", ("clock", "world", "terrain", "missions"))
source_id("vw-002", "TANK_SOURCE", "tank-identity.js", ("clock", "terrain", "tracks", "tank-combat", "tank-world"))
source_id("vw-003", "MECH_SOURCE", "mech-identity.js",
          ("clock", "identity", "missions", "terrain", "world", "walker", "mech-world"))
source_id("vw-004", "NAVAL_SOURCE", "naval-identity.js",
          ("clock", "identity", "missions", "terrain", "world", "vessel", "naval-world"))
