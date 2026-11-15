---
name: catalog-sources
description: Regenerating src/x3d/catalog.ts needs the pinned local X3DUOM/XSD copies; the online 4.0 model no longer matches its pin
metadata:
  type: project
---

`npm run catalog` (scripts/build-catalog.ts) checks SHA-256 pins. As of 2026-11-15 the live
`X3dUnifiedObjectModel-4.0.xml` on web3d.org hashes to `49f28401…`, not the pinned `51a02e41…`,
so fetching fails. The pinned copies are in `C:\Workspace\Temp\x3diff-fixes\uom\` (3.0, 3.2, 3.3,
4.0 models and both XSDs; 3.3 model and XSD also at `C:\Workspace\Temp\`). Run:

`npx tsx scripts/build-catalog.ts --model ../Temp/X3dUnifiedObjectModel-3.3.xml --schema ../Temp/x3d-3.3.xsd --model40 ../Temp/x3diff-fixes/uom/X3dUnifiedObjectModel-4.0.xml`

**Why:** Temp is scratch space; deleting `x3diff-fixes` would make the catalog unreproducible
without re-pinning to the new online model.
**How to apply:** never delete `Temp/x3diff-fixes/uom` during cleanups; if Bruno wants Temp
cleared, first move these files somewhere durable (or re-pin and review the 4.0 diff).
After regenerating, refresh `fixtures/golden/*.json` (they embed the supported node list).
