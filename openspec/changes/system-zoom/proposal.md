## Why
The owner: "I dont like that the camera keep centering on the star when I zoom in when solar system is in view, I should be able to pan around and zoom in on parts of the solar system like to view megastructures, asteroids and planets".

## What Changes
- **Inside a drawn system, zoom goes where the cursor is.** Zooming in while a system is drawn (the view under 9 ly wide) and the cursor or pinch is over that system (within 1 ly of its star) zooms toward the point under it. It no longer glides back to the star, and on touch it no longer snaps to ships.
- **From further out, the pull stays.** Zooming toward a star still glides the view onto it, so you land in its system.

## Impact
`GameController`'s zoom attractor; `SYSTEM_EXTENT` in `SystemLayer.ts`.
