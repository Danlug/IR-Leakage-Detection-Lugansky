---
name: ir-leak-check
description: Analyse a camera photo + thermal (IR) image pair for heat leaks, drafts, moisture, hidden pipes and overheating, and produce overlay images (blend and before/after swipe). Use when the user sends thermal-camera screenshots with matching photos.
---

# IR leak check

## Inputs
Pairs of images: a normal photo and a thermal screenshot of the same spot. The thermal HUD shows
centre temperature (big number, top left), `Max`/`Min` of the frame, the colour scale and the time.
Pair images by subject and by the time stamp when there are several.

## Steps
1. Read the HUD of every thermal image: centre °C, Max, Min, time. ΔT = Max − Min.
2. Match each hot/cold zone to the object in the photo (window frame, socket, pipe, wall corner, appliance).
3. Classify each zone:
   - **Expected heat**: running appliances (washer glass during a hot wash reaches 40-60 °C), TV/router backs, animals and people (~30-38 °C surface).
   - **Cold bridge / draft**: cold strip along window or door frames, wall–ceiling corners, outlet boxes on outside walls. Flag when the spot is 3+ °C below the wall around it.
   - **Moisture**: blotchy cold patch with soft edges on a wall or floor, not following a structure. Recommend a moisture meter.
   - **Hidden pipe / leak**: a warm (hot water) or cold (cold water) line or spreading patch in a wall or floor.
   - **Electrical overheating**: a socket, plug or switch warmer than the wall by 10+ °C without a load on it. Treat as a safety issue.
4. Make overlays so the user can see where each zone is:
   `python overlay.py photo.jpg thermal.jpg --align '<json>' --out name` → `name_blend.png`, `name_swipe.png`, `name_checker.png`.
   The alignment JSON `{"H":[9 numbers]}` comes from the web app («Совмещение по точкам» → «Копировать JSON»).
   Without it the thermal is only placed as wide as the photo and centred: say the overlay is approximate and ask the user to align by points.
   Check `name_checker.png`: lines (door, frame, socket) must not break at the square borders. If they do, do not point at exact spots.
5. Report in Russian, plainly: one line per zone — where, temperature, what it most likely is, what to do. Separate "всё в норме" from "проверить".

## Limits
- The thermal shows surface temperature only. Glass, polished metal and glossy tiles reflect heat: readings on them are unreliable.
- A thermal image alone cannot prove moisture; it shows where to measure.
- Leaks show best with ≥10 °C between inside and outside, or right after running hot water.
