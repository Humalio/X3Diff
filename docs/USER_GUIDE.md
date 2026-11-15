# X3Diff user guide

## Open a comparison

Open `app.html` on the published site. To run locally with Node.js 24, use `npm ci` and `npm run dev`, then open `/app.html` at the URL printed by Vite.

The app opens on Brickhaven. Choose another example from the header, or use **A** for your original file and **B** for your revised file. Loading your own file clears the example pair and asks for the other side. Comparison starts automatically when both inputs are available. With your own pair loaded, a file button replaces only its side. The **⇄** button between A and B swaps them and compares again.

You can drop one or two `.x3d` or `.xml` files anywhere on the page. One fills the next empty side, or replaces B when both are loaded. For two files, names containing before/original/old and after/revised/edited/new determine their sides; otherwise file-name order determines A and B. Files must be UTF-8 XML, at most 20 MiB each. Nothing is uploaded.

Example links accept `?example=brickhaven`, `forgeworks`, `fitlab`, `avatar`, `joe`, `dolphin` or `example`. Add `#differences`, `#sections`, `#volume`, `#deviation`, `#movement` or `#motion` to open an available view. Unknown examples open Brickhaven; unavailable views open File differences.

## The workspace

Every analysis uses one stage and a side panel. Drag the divider to resize the panel, use its arrow keys, or double-click it to reset. The width is remembered. At narrow widths, the panel sits below the stage.

On a phone the header is two rows: the example, then A and B. **⋯** opens Coverage, Settings, Export and the theme. Each tab is one word (Differences, Slice, Volume, Surface, Motion), the view buttons are a mark over one word, and A / Differences / B is an **A · Δ · B** switch. The panel is a sheet over the bottom of the screen, so the stage stays in view; tap its handle to make it taller or shorter.

**Dark theme** / **Light theme** switches the theme and remembers your choice. A first visit follows your system preference. The analysis tabs support Left/Right, Home and End keys. Geometry views appear only when supported changed object pairs can be measured; Movement appears when an animated figure (a humanoid, or animated parts inside animated parts) moves differently; Motion paths appears when supported motion differs.

| Symbol                    | Meaning                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| `Δ`, `+`, `−`, `=`        | changed, added, removed, no compared difference                            |
| `≠`                       | a declaration difference without scene geometry, such as a title or timing |
| `A ∖ B`, `A ∩ B`, `B ∖ A` | space only A fills, space both fill, space only B fills                    |
| `V(A)`, `ΔV`              | volume of A and the change from A to B                                     |
| `d`, `max d`, `mean d`    | distance, largest sampled distance and average distance                    |
| `T(A)`, `ΔT`              | animation cycle duration in A and its change                               |

Blue marks changed geometry, green added, red removed and grey context. A before ghost shows an outline's former position or size. Each measurement includes a disclosure explaining its limits. Distances and volumes use scene-coordinate units, without alignment or physical-unit conversion.

## Settings

**Settings → Point tolerance** sets the distance threshold for moved coordinates. Enter a finite non-negative number and choose **Apply settings** to compare the current files again. Other semantic tolerances retain their documented defaults. The exported report records the tolerances actually used.

**Settings → Volume resolution** chooses Low, Medium or High. The **Resolution** control in Volume differences changes the same setting. It controls curved-solid tessellation and the mesh sampling grid: Low is faster; High is finer and takes longer. It does not change the semantic differences or certify the measurement. Settings are remembered when browser storage is available.

## File differences and selection

Each changed object has a card. Select it to reveal all its property lines and fade unrelated scene geometry. **Zoom to selection** frames supported geometry; **Deselect** clears the selection. The A / Differences / B controls show the original, the colour-coded overlay or the revised scene. Authored animation is paused in these views. **Fit scene** frames the scene.

The chips above the cards count each kind of difference and filter the list to it; the search box narrows it by names and values. Neither changes what is compared or exported.

Repeated identical changes share one card with their object count. The card shows the common values and selects the group; **Show the parts** under it names each one, and selecting a part highlights only that part. Every individual semantic record is included in both exports. Text changes show removed words struck through and added words in green. Hover a text value to read the full before and after strings. Changes without geometry, such as lights or metadata, are listed under Data.

Selection is shared across views. A card that identifies one supported pair selects that object in Slice and measure, Volume differences and Surface deviation. Choosing an Object there also carries the selection back to File differences. Motion paths follows selections that identify one animated object, including its clock or interpolator. A group, unsupported object or unrelated declaration can fail to identify one measurable pair or path; the analysis keeps its current object and displays a notice so you can choose an Object explicitly.

The legend buttons hide or show changed, added, removed and unchanged geometry. They control visibility, not which declarations are compared or exported.

## Slice and measure

Choose an **Object**, then XY, XZ or ZY and sweep **Cut** through both revisions. Both outlines use the same world-coordinate plane and framing. Click a surface in 3D to place the cut; drag to orbit and scroll to zoom. Click two locations on the 2D outline to measure their straight-line distance. A third click starts another ruler; changing the plane clears it. **Stack views** / **Side by side** changes the 3D and 2D arrangement.

Outline dimensions are the cross-section's extents along the displayed axes. The ruler is a straight-line distance between the selected outline points. Supported static geometry includes Box, Sphere, closed Cylinder and bounded convex IndexedFaceSet under supported Group/Transform placement. Unsupported or concave geometry does not offer this analysis.

## Volume differences

Choose one matched **Object** and a **Resolution**. The scene shows before-only, shared and after-only occupied regions, with optional mesh outlines and scene context. Toggle the region chips to control their visibility.

Before volume is before-only + shared; after volume is shared + after-only. Net change is after-only − before-only. Changed space is before-only + after-only. Original-volume retention is shared / before volume. A translated object can have zero net change while losing and gaining occupied space.

Closed boxes use Boolean geometry. Curved primitives use tessellated Boolean surfaces and are approximate. Supported meshes use a bounded occupancy grid, filled between paired ray intersections; open meshes can affect the estimate. The method and cell size appear with the results. Low, Medium and High use approximately 48, 85 and 170 cells along the longest mesh bound. The view measures one pair, not whole-assembly collision or certified metrology. A failure or missing closed solid is displayed without replacing the semantic report.

## Surface deviation

Choose an **Object** and direction A → B or B → A. The heatmap shows sampled nearest-surface distances, alongside maximum, area-weighted mean and RMS distance. One sample at each triangle centre can miss the true maximum; the two directions can differ. Scene context can be toggled. The preview does not provide individual face picking.

## Movement

Movement is for figures: an H-Anim humanoid, or any model whose animated parts sit inside other animated parts, such as a robot arm. It answers where and when the two revisions move differently before showing how.

The grid runs under the stage, across its full width. It has one row per body part (whole body, head and neck, eyes, face, spine, each arm, hand and leg) and one column per moment. A blue cell means the part moves differently at that moment, darker for a larger difference. An amber cell means the same movement happens at another moment. Select a part's name to list its joints. When a scene holds several humanoids, each keeps its own rows, named after the figure ("Ana · Right arm"). Only parts that differ get a row; **Show N unchanged parts** lists the rest. Press or drag on the grid, or use the slider, to choose a moment. Under the grid, **Play** runs through the cycle and the ⏮ / ⏭ buttons jump to the previous or next difference; the clock beside the slider shows the time. On a phone the panel starts lower so the figure and its timeline are both in view, and the rows are taller for a finger.

The stage poses both figures at the chosen moment: the revision solid, with each joint coloured like the grid, and the original as a violet see-through ghost. Overlaid, the ghost shows only on the parts that differ at that moment, so the rest of the figure stays readable. **Overlay** puts them in one place; **Side by side** puts the original on the left, shown in full. While the chosen moment is inside a stretch of difference, **Paths** draws where the end of that part travels through the stretch: violet for the original, blue for the revision (for the eyes, a point along their gaze). A skinned figure, such as the Joe example, shows its revised skin coloured the same way, each vertex by the joints that move it, including those above it: a turned neck colours the head. The file's own vertex colours are not shown in this view. In the side panel, the joints that differ most at that moment are listed with their angles.

**What differs** summarises the comparison in time order, one line per stretch of difference: for example "Right arm · 1–3 s · Different movement, up to 105° at r_shoulder" or "Left leg · 3.5–4.5 s · Same movement, B 0.4 s later". Select a line to go to its largest difference.

Each joint is compared by its own pose relative to its parent, so a difference appears at the joint where it starts: a changed shoulder colours the shoulder, not the elbow and hand it carries. Eyes count by their angle, so a 20° glance stands out although the eye barely moves in space. Rotations under 1° count as the same. A stretch is a timing change when one constant shift of up to 1.5 s makes every joint of the part match within 3° for the whole stretch. Joints are grouped by their H-Anim names; other names are listed under Other. Clocks start at zero; sensors, scripts and skinned meshes are not evaluated. More than 256 animated joints skips this analysis.

## Motion paths

Choose an **Object** and **Compare** mode:

- **At the same moment** compares the two revisions over the same time window. A speed change alone can open a gap.
- **At the same point of the cycle** compares each revision at the same fraction of its own cycle. A timing-only change then has zero gap.

The stage shows paths and position markers; the chart, slider, readout and maximum/mean distances follow the selected mode. Drag the slider or chart to scrub, or press **Play**. Time mode uses seconds; cycle mode uses percentages. Cycle durations remain visible to explain timing differences.

Motion follows a centre point, or a bounds corner that exposes rotation or scale changes. It supports enabled TimeSensor clocks driving PositionInterpolator or OrientationInterpolator routes into Transforms under Group/Transform placement, including animated parents. Disabled clocks remain disabled. Every enabled clock starts at zero for analysis; declared start, stop, pause and resume times, sensors, scripts and other triggers are not evaluated. Each revision uses its longest contributing clock interval and 240 sampling intervals, which can miss motion between samples and need not cover a full combined period. More than 128 animated objects skips this analysis. Unsupported geometry uses a unit box as a tracking reference. Colour, scalar and coordinate animation is not drawn.

## Coverage and incomplete comparisons

**Coverage** opens the generated list of 54 compared node types. See [X3D coverage](X3D_COVERAGE.md) for the full boundary.

An incomplete comparison displays an open notice above the workspace listing skipped or uncertain content by file. Its count is marked **Partial**. Supported differences remain usable, but grey geometry and a zero count do not establish equality of unsupported content. The exports repeat the status and diagnostics.

Versions 3.0, 3.1, 3.2, 3.3 and 4.0 are accepted using the 3.3 catalog. Versions other than 3.3 carry a note. Component requirements are compared as document details; unit declarations are not interpreted and make the comparison incomplete. A malformed file or unsupported version produces a failed result with no analysis tabs or export.

## Export

The header's **Export** selector offers:

- **Report (HTML):** a printable offline page with input details, tolerances, status, skipped content, every semantic difference and available analysis measurements. Geometry numbers refer to the selected supported pair. Motion measurements include both time and cycle comparisons. Measurement limits are included. The page contains no script and needs no network.
- **Data (JSON):** the complete deterministic semantic report. See [Report format](REPORT_SCHEMA.md). Exploratory geometry and motion measurements belong to the HTML report.

Exports are named after the inputs, for example `part-v1__part-v2.x3diff.html`. Unsafe filename characters are replaced. Input-derived strings are displayed as text and escaped in HTML. Both exports contain information from your files; choose deliberately where to share them.
