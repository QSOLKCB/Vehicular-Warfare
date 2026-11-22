"""Copy or check the game's VANILLAJS closure from a pinned, read-only Git checkout."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

PIN = "9d95d74b355ec17add32db0b55f0f71130f9c004"
TAG = "v3.5.0"
ROOTS = ("terrain", "collision", "render-webgl", "render-packing", "fx-pipe", "blit", "copper")
DESTINATION = Path(__file__).resolve().parents[1] / "vendor/vanillajs"


def source_files(checkout, extra_roots):
    def blob(name):
        return subprocess.check_output(["git", "-C", checkout, "show", f"{PIN}:{name}"])

    registry = blob("MODULES.json")
    entries = json.loads(registry)["modules"]
    roots = [*ROOTS, *sorted(set(extra_roots).difference(ROOTS))]
    files = {name: blob(name) for name in ("LICENSE", "NOTICE")}
    dependencies = {}

    def include(name):
        if name in dependencies:
            return
        if name not in entries:
            raise ValueError(f"Unknown registered module: {name}")
        entry = entries[name]["entry"]
        data = blob(entry)
        depends = sorted(entries[name]["depends"])
        # These pinned ES modules import other registry entries by relative path.
        imports = re.findall(rb"""\b(?:from\s*|import\s*(?:\(\s*)?)(['"])([^'"\n]+)\1""", data)
        expected = {f"../{dep}/index.js" for dep in depends}
        if {path.decode() for _, path in imports} != expected:
            raise ValueError(f"Module imports disagree with MODULES.json: {entry}")
        dependencies[name] = depends
        files[entry] = data
        for dep in depends:
            include(dep)

    for root in roots:
        include(root)
    provenance = {
        "repository": "https://github.com/QSOLKCB/VANILLAJS", "tag": TAG, "commit": PIN,
        "registrySha256": hashlib.sha256(registry).hexdigest(),
        "roots": roots, "dependencies": dict(sorted(dependencies.items())),
        "sha256": {name: hashlib.sha256(files[name]).hexdigest() for name in sorted(files)},
    }
    files["provenance.json"] = (json.dumps(provenance, indent=2) + "\n").encode()
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("checkout", help="Local Git repository containing the pinned commit")
    parser.add_argument("roots", nargs="*", help="Additional registered modules")
    parser.add_argument("--check", action="store_true", help="Compare all local files without writing")
    args = parser.parse_args()
    files = source_files(args.checkout, args.roots)
    existing = {p.relative_to(DESTINATION).as_posix() for p in DESTINATION.rglob("*") if p.is_file()}
    unexpected = existing.difference(files)
    if unexpected:
        parser.exit(1, "Unexpected files in the vendored closure: " + ", ".join(sorted(unexpected)) + "\n")
    for name, data in files.items():
        path = DESTINATION / name
        if args.check:
            if not path.is_file() or path.read_bytes() != data:
                parser.exit(1, f"Missing or different from pinned source: {name}\n")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)


if __name__ == "__main__":
    main()
