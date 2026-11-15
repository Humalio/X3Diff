---
name: joe-example
description: The Joe Movement example is generated from a pinned Web3D source file kept in Workspace/Temp/x3diff-joe
metadata:
  type: project
---

`public/examples/joe/{before,after}.x3d` come from `node scripts/build-joe.mjs ../Temp/x3diff-joe/JoeSkeletonSkinSiteSaluteWalk.x3d`
(script pins SHA-256 a5dac443…). The source is Joe D. Williams's H-Anim walk-and-salute file from the
Web3D example archive (BSD-style Web3D licence, copied to `public/examples/joe/LICENSE.html`), downloaded
2026-11-15 with Bruno's approval.

**Why:** the generated files are committed, but regenerating needs the pinned original.
**How to apply:** keep `Temp/x3diff-joe` during cleanups, or re-download from
https://www.web3d.org/x3d/content/examples/HumanoidAnimation/Skin/JoeSkeletonSkinSiteSaluteWalk.x3d and check the hash.
See also [[catalog-sources]].
