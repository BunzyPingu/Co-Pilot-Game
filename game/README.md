# Penguin vs Fish — Ice Maze Arcade (MVP)

A local, dependency-free web game built from your development plan. You play a
**Penguin** collecting **krill** and **ice crystals** while dodging patrolling
**Fish**. Built with vanilla JavaScript + HTML5 Canvas (Plan Option A).

## Run it locally

No build step or install required — just open the folder in a browser.

### Easiest way
Double-click `index.html`. It runs directly from disk.

### Or serve it over HTTP (recommended)
Open a terminal in this folder and run:

```bash
python -m http.server 8000
```

Then visit **http://localhost:8000/game/index.html** in your browser.

> A local server avoids any browser quirks with `file://` and makes the game
> feel more like a real app. Either method works fine.

## Controls

| Action | Keys |
|--------|------|
| Move   | Arrow keys or WASD |
| Belly slide | Space |
| Pause  | P or Esc |

- Press any key to start Normal Mode, or choose a mode from the main menu.
- Choose **Normal Mode** for the existing level-and-star progression, or
  **Survival Mode** for an endless run. In Survival, the maze changes after
  every four fish eaten, collectibles return in the new maze, lives and shield
  carry over, and hunter fish get faster with every maze. The run ends when all
  lives are lost; score is kept for the entire Survival run.
- Every level in either mode randomly receives one challenge: **Blizzard
  Warning** alternates crosswinds that speed or slow horizontal movement;
  **Night Run** darkens the maze and gives krill and fish lanterns a glow; or
  **Fish Frenzy** doubles the fish count and adds 50% more ice crystals.
- Eat an **ice crystal** to freeze the fish — frozen fish turn blue and become
  edible snacks for bonus points.
- Collect Golden Krill for persistent currency. Spend it in the Igloo Shop from
  the start or pause menu to buy permanent upgrades. Three Golden Krill appear
  at random reachable locations on every level.
- Collect the shield emblem on every even-numbered level to gain 5 shield
  points, up to 20. A fish hit removes 5 points; after the shield is empty, a
  fish hit costs a life. Thicker Feathers adds 5 starting shield points per
  upgrade level each run, up to the same 20-point cap.
- Eat all four fish to advance. New levels rearrange internal ice blocks and
  move the fish to new starting positions while keeping collectibles reachable.
- Earn up to three stars per level: one for clearing, one for finishing in under
  90 seconds, and one for taking no hits while collecting every regular krill.
  Your best star count for each level is saved between runs. The results screen
  waits for you to choose **Start Next Level** before continuing.

## What's implemented (from your plan)

- **Map & grid system** — numeric 2D array (`0` path, `1` block, `2` krill, `3`
  ice crystal, `4` Golden Krill, `5` shield pickup), with blocks slowing the
  penguin and remaining impassable to fish, plus widened routes and left/right
  tunnel wrap-around.
- **Penguin movement** — grid-aligned continuous movement with input buffering
  for smooth turns at intersections, plus a beak open/close animation driven by
  direction of travel.
- **Fish AI** — four species: Red (direct chase), Pink (intercepts ahead of you),
  Blue (tracks to flank), Orange (chases when far, retreats to its corner when
  close). Each uses BFS tile pathfinding. Fish also have Hunter / Scared states.
- **Level progression** — eat four fish over the course of each level to advance.
  Fish respawn after being eaten; each new map rebuilds the interior with 64
  randomly placed blocks and assigns new reachable starting positions to the fish.
- **Three-star levels** — clear a level for one star, finish in under 90 active
  gameplay seconds for a speed star, and avoid all hits while collecting every
  regular krill for a perfect star. Best stars per level persist in `localStorage`.
- **Scoring & progression** — krill 5pts, crystal 50pts, and 25pts for each fish
  eaten. Start with 3 lives; level clear and game-over screens included. Current
  score resets when the penguin dies, while the high score is saved to
  `localStorage`.
- **Igloo Shop** — Golden Krill and upgrade levels persist in `localStorage`;
  every upgrade can be purchased up to level 5.
  Belly Slide adds 15% distance per level, Thicker Feathers grants one starting
  hit of shield protection per run per level (up to 20 points), Sub-Zero Freeze
  adds 15% freeze time per level, and Magnet Radius collects regular krill one
  tile farther away per level. Upgrade prices start at 3 Golden Krill and rise
  by 2 after each purchase. Belly Slide is activated with Space and has a short
  cooldown.
- **Audio** — krill and ice-crystal collection sounds are synthesized live with
  the Web Audio API, so there are no external asset files to fetch (works fully
  offline).

## Project layout

```
game/
├── index.html   # markup + UI overlays (HUD, start/pause/game-over screens)
├── style.css    # ice-themed styling for canvas and panels
└── game.js      # all game logic: map, AI, rendering, input, audio, and shop
```

## Notes / possible next steps

- The plan's "Blue coordinates with Red to flank" is simplified here (both track
  the penguin); full coordinated flanking can be added later.
- Assets are drawn procedurally on canvas — swapping in sprite sheets is a natural
  next step if you want richer visuals.
