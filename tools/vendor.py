"""Copy the pinned public module closure from a local, read-only Git checkout."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

PIN = "0cffbcfe2524bbf7f82190ef8ef0813aeb6bb466"
dst = Path("vendor/vanillajs")
def blob(name):
    return subprocess.check_output(["git", "-C", sys.argv[1], "show", f"{PIN}:{name}"])

entries = json.loads(blob("MODULES.json"))["modules"]
files = {"LICENSE", "NOTICE"}
def include(name):
    entry = entries[name]["entry"]
    if entry in files:
        return
    files.add(entry)
    imports = re.findall(rb"""from ['"]\.\./([\w-]+)/index\.js['"]""", blob(entry))
    deps = set(entries[name]["depends"])
    assert {item.decode() for item in imports} == deps, name
    for dep in deps:
        include(dep)

roots = ["terrain", "collision", *sys.argv[2:]]
for root in roots:
    include(root)
hashes = {}
for name in sorted(files):
    data = blob(name)
    path = dst / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    hashes[name] = hashlib.sha256(data).hexdigest()
(dst / "provenance.json").write_text(json.dumps(dict(repository="https://github.com/QSOLKCB/VANILLAJS",
    tag="v3.4.0", commit=PIN, roots=roots, sha256=hashes), indent=2) + "\n")
