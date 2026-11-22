"""Content identity of the simulation and its exact upstream source closure."""
import hashlib
from pathlib import Path
import sys

files = [Path("sim") / (name + ".js") for name in ("clock", "world", "terrain", "missions")]
files += [Path("vendor/vanillajs/modules") / name / "index.js" for name in ("terrain", "collision", "math")]
digest = hashlib.sha256()
for path in sorted(files):
    digest.update(str(path).encode() + b"\0" + hashlib.sha256(path.read_bytes()).digest())
line = f"export const SOURCE = 'vw-001a:{digest.hexdigest()}';\n"
path = Path("sim/identity.js")
if "--check" in sys.argv:
    assert path.read_text() == line, "stale simulation source identity"
else:
    path.write_text(line)
