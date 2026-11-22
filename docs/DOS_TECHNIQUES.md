# DOS-era mechanics: source-video audit

**Owner-supplied reference:** Pixeltopia, *27 MS-DOS Games That Looked IMPOSSIBLE on a 90s PC*, https://youtu.be/u14QQgG_eWc . This is an entertainment transcript; not every historical claim is independently verified. We extract design techniques without republishing its wording or copying copyrighted assets.

| Game / transcript time | Adaptation for Vehicular-Warfare | Priority |
| --- | --- | --- |
| **Comanche: Maximum Overkill (1992)** 00:32–01:30 | Fly below ridges, conceal from hostile sensors, pop up to shoot, drop to safety | **VW-001** actual tactical mechanic |
| **Descent** 20:04–20:59 | Bounded 6DOF and camera freedom where flight physics supports it | Later |
| **Stunts** 07:19–08:17 | Inert mission/map editor and multi-camera replay | VW-006 |
| **Frontier: Elite II** 05:05–06:05 | Compact seeded and repeatable procedural terrain | VW-001 and later |
| **TIE Fighter** 12:43–13:36 | Original score cues driven by detection/shot/mission events | Later |
| **Magic Carpet** 13:41–14:36 | Actual landscape deformation affecting tactics | Future; update physics/LOS/mesh/replay together |
| **Dark Forces** 22:12–22:58 | Multi-level buildings, weather and vertical tactical routes | Future separately authored 3D solids |
| **Rise of the Robots** 19:05–19:54 | Negative example: visual spectacle cannot replace real gameplay | Always |

### What Voxel Space means

Traditional Comanche-style **Voxel Space** projects height- and colour-map slices into screen columns, using a visibility y-buffer. It is a clever **2.5D heightfield renderer**, *not* an arbitrary volumetric 3D physics engine. It cannot by itself model overlapping rooms, hollow bridges or genuine free-form 3D cockpit presentation.

An independent technical reference, [s-macke/VoxelSpace](https://github.com/s-macke/VoxelSpace), explains the algorithm and notes that its sample height/colour maps are reverse-engineered game data. **Do not copy or redistribute those maps**; original code and original generated maps only. A later 2.5D renderer must never silently disagree with terrain authority. The first implementation can use polygon/WebGL terrain.

**The key transfer:** a hill that visually blocks the player must also block enemy sensing and weapons. This is a numerical acceptance test, not a screenshot criterion.
