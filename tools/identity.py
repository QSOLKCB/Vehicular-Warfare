"""Content identities of the game simulations and their exact source closures."""
import hashlib
from pathlib import Path
import sys


def source_id(prefix, destination, output, modules, *, historical_exports=False, doctrine_exports=False):
    files = [Path("sim") / (name + ".js") for name in modules]
    files += [Path("vendor/vanillajs/modules") / name / "index.js" for name in ("terrain", "collision", "math")]
    digest = hashlib.sha256()
    for path in sorted(files):
        content = path.read_bytes()
        if path == Path("sim/command-control.js") and not doctrine_exports:
            # Earlier identities cover the exact bytes before this named-export
            # declaration. Its helpers themselves remain part of every identity.
            suffix = (b"\n// Shared movement and mission rules for the separately versioned doctrine game.\n"
                      b"export {finish,navigate,objective,stop};\n")
            if not content.endswith(suffix):
                raise ValueError("Review historical command exports")
            content = content[:-len(suffix)]
        if historical_exports and path == Path("sim/combined-world.js"):
            # v0.3.0 and its workshop consumed the same executable module.
            # The sole extension to those exact bytes is a named export list
            # for command-mode callers. Strip only that literal declaration.
            suffix = (b"\n// Shared by the command-mode tick.\n"
                      b"export {advanceShots,canSee,choose,cpu,cpuMotion,damage,emit,launch,train};\n")
            if not content.endswith(suffix):
                raise ValueError("Review historical replay compatibility before changing the command exports")
            content = content[:-len(suffix)]
        digest.update(str(path).encode() + b"\0" + hashlib.sha256(content).digest())
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
combined_modules = ("clock", "terrain", "world", "identity", "missions", "tracks", "tank-combat", "walker",
           "vessel", "naval-world", "naval-identity", "estuary", "combined-vehicles", "combined-contact", "combined-world")
source_id("vw-005", "COMBINED_SOURCE", "combined-identity.js", combined_modules, historical_exports=True)
source_id("vw-006", "CREATOR_SOURCE", "creator-identity.js", combined_modules + ("combined-identity", "creator"),
          historical_exports=True)
source_id("vw-cmd-001", "COMMAND_SOURCE", "command-identity.js",
          combined_modules + ("combined-identity", "command-control", "command-world"))
formation_modules = combined_modules + ("combined-identity", "command-control", "command-world",
                                        "command-identity", "formation-routes", "formation-world")
source_id("vw-cmd-003", "FORMATION_SOURCE", "formation-identity.js", formation_modules)
source_id("vw-cmd-005", "BIG_BATTLE_SOURCE", "big-battle-identity.js",
          formation_modules + ("formation-identity", "big-battle"))
source_id("vw-tact-001", "OVERLORD_INTEL_SOURCE", "overlord-intel-identity.js",
          formation_modules + ("formation-identity", "big-battle", "big-battle-identity", "overlord-intel"))
overlord_modules = formation_modules + ("formation-identity", "big-battle", "big-battle-identity",
                                       "overlord-intel", "overlord-doctrine", "overlord-control", "overlord")
source_id("vw-tact-002", "OVERLORD_SOURCE", "overlord-identity.js", overlord_modules, doctrine_exports=True)
source_id("vw-tact-003", "OVERLORD_SOURCE", "coordinated-overlord-identity.js",
          overlord_modules + ("overlord-identity", "overlord-groups", "coordinated-overlord"), doctrine_exports=True)
