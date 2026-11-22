# VANILLAJS v3.5.0 engine baseline

Vehicular-Warfare vendors the public JavaScript modules it uses. The approved engine is **VANILLAJS v3.5.0 — THE SILICON FORGE**, commit `9d95d74b355ec17add32db0b55f0f71130f9c004`. The released game v0.2.0 (`0132dd22191ebfeddfce8bc76651e09eb2f12b48`) used engine v3.4.0 (`0cffbcfe2524bbf7f82190ef8ef0813aeb6bb466`). [Upstream release](https://github.com/QSOLKCB/VANILLAJS/releases/tag/v3.5.0) · [Pinned module registry](https://github.com/QSOLKCB/VANILLAJS/blob/9d95d74b355ec17add32db0b55f0f71130f9c004/MODULES.json)

## Imported source

| Module | Registered dependency | Contract |
| --- | --- | --- |
| terrain | math | Triangulated Heightfield for height samples, visibility and segment intersections |
| collision | math | Swept contact queries |
| math | — | Shared numeric, quaternion and matrix operations |
| render-webgl | math | WebGL1 renderer, retained meshes and six-float XYZ/RGB vertices |
| render-packing | — | Bounded reusable box vertex stream |
| fx-pipe | integer-math | Bounded Q16.16 affine transforms and solid-colour triangles or quads into a live Float32 XYZ/RGB view |
| integer-math | — | Signed Q16.16 operations and the scale constant imported by fx-pipe |
| blit | — | Packed 16-bit words, up to four indexed bitplanes and masked Boolean blits |
| copper | — | Validated scanline palette and horizontal scroll programs over an indexed frame, with reusable RGBA output |

The original five module entries and both licence files have identical Git blobs at the two engine commits. The four added entries are experimental and execute on the CPU. Copper takes a separate indexed byte buffer as input. BLIT's conversion to indices allocates a snapshot. FX-PIPE's live output aliases its own storage, and the caller owns any GPU upload. [SHA-256 receipts](../vendor/vanillajs/provenance.json) · [Engine licence](../vendor/vanillajs/LICENSE) · [Notice](../vendor/vanillajs/NOTICE)

## Reproduce the import

Use a local Git clone containing the upstream release. From the game repository root run the following checks. The importer reads the approved commit's blobs and compares the registered dependency edges with the public entry imports. The default root set includes all seven directly selected modules.

```sh
python3 tools/vendor.py /path/to/VANILLAJS --check
python3 tools/identity.py --check
node --test test/*.test.js
```

Omit `--check` from the vendor command to copy the approved bytes and write their provenance. The identity command above only checks the six existing simulation identities. The fixed 120 Hz game simulation owns vehicle motion, terrain and water contacts, perception, hits, damage and objectives. Rendering consumes snapshots and presentation settings. Historical evidence directories identify the exact engine and game revisions used for those runs.
