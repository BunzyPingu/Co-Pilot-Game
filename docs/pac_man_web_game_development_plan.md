# Web-Based Game Development Plan: Penguin vs. Fish Theme

This document outlines the technology stack, core requirements, system architecture, and a step-by-step development roadmap for an arcade-style game where you control a **Penguin** collecting items while dodging patrolling **Fish**.

## 1. Technology Stack Recommendations

### **Option A: Pure Vanilla JavaScript + HTML5 Canvas (Recommended for Learning)**

* **Frontend Structure:** Standard HTML5 & CSS.
* **Game Rendering:** `<canvas>` API for drawing characters, grid maps, and sprite animations.
* **Logic:** Vanilla JavaScript (ES6+) for movement physics, state management, and fish AI pathfinding.
* **Pros:** Zero external dependencies, lightweight, builds foundational game engine skills.

### **Option B: Web Game Framework (Recommended for Faster Development)**

* **Framework:** [Phaser.js](https://phaser.io/) or [Kaboom.js](https://kaboomjs.com/).
* **Pros:** Built-in physics engines, sprite sheet handling, asset preloading, and input handling out of the box.

---

## 2. Updated Character & Theme Concepts

* **Hero Character (The Penguin):** Replaces Pac-Man.
  * Navigates the ice-maze.
  * Features a custom mouth/beak open-and-close animation triggered while moving or eating.
* **Chaser Enemies (The Fish):** Replace the Ghosts.
  * Different fish species/colors act as the enemies patrolling the maze.
  * Frightened mode turns fish into "Frozen Fish" or "Golden Fish" that the Penguin can eat for bonus points.
* **Collectibles:**
  * **Krill / Snowflakes (Pellets):** Standard food scattered across the maze.
  * **Ice Crystals / Special Fish Treats (Power Pellets):** Empowers the Penguin to hunt down and eat the fish temporarily.

---

## 3. Core Functional Requirements

### **A. Map & Grid System**

* **Tile Matrix:** Represent the maze using a 2D array (`0 = Path`, `1 = Ice Wall`, `2 = Krill`, `3 = Ice Crystal`).
* **Collision Detection:** Keep the Penguin and Fish strictly within allowable ice grid paths.
* **Tunnel Passages:** Allow wrap-around movement from left edge to right edge of the screen.

### **B. Player Character (Penguin)**

* **Controls:** Arrow keys or WASD.
* **Movement Logic:** Grid-aligned continuous movement with input buffering for smooth turns at intersections.
* **Sprite/Beak Animation:** Beak opening/closing animation based on direction of movement (Left, Right, Up, Down).

### **C. Enemy System (Fish AI)**

* **Fish AI Types:**
  * *Red Fish:* Directly tracks the Penguin's position.
  * *Pink Fish:* Targets tiles ahead of the Penguin to cut off escape routes.
  * *Blue Fish:* Coordinates with Red Fish to flank the Penguin.
  * *Orange Fish:* Chases when far, but swims back to its designated corner when close.
* **Fish States:**
  * **Hunter Mode:** Active pursuit of the Penguin.
  * **Patrol Mode:** Periodically retreats to assigned maze corners.
  * **Scared/Frozen Mode:** Triggered when the Penguin eats an Ice Crystal (fish turn blue/frozen, move slower, and become edible).
  * **Eaten Mode:** Fish eyes or skeleton return to the spawner reef to regenerate.

### **D. Game State & Mechanics**

* **Scoring System:**
  * Krill: 10 points
  * Ice Crystal: 50 points
  * Eating Fish: Multipliers (200, 400, 800, 1600 points)
* **Lives & Progression:**
  * Player starts with 3 lives.
  * Game Over screen when all lives are lost.
  * Level clear screen when all krill on the map are eaten.
* **Audio & Visuals:**
  * Sound effects for beak chomping, collecting crystals, eating fish, and water ambiance.

---

## 4. Step-by-Step Implementation Roadmap

```
Phase 1: Setup & Ice Grid Base
   │
   ├── Set up HTML5 Canvas viewport
   └── Render static maze grid from a 2D Array
   
Phase 2: Penguin Movement & Beak Animation
   │
   ├── Draw Penguin on the grid
   ├── Handle directional keyboard inputs
   ├── Implement beak opening/closing animation frames
   └── Add ice wall collision detection
   
Phase 3: Collectibles & Scoring
   │
   ├── Render Krill & Ice Crystals
   ├── Detect collision between Penguin and collectibles
   └── Update HUD score display
   
Phase 4: Fish AI Implementation
   │
   ├── Create Fish class with tile pathfinding
   ├── Implement Hunter, Patrol, and Scared/Frozen states
   └── Handle Penguin vs. Fish collision (Life lost vs. Fish eaten)
   
Phase 5: Audio, UI & Final Polish
   │
   ├── Add Start, Pause, and Game Over overlays
   ├── Sound effects for chomping and eating
   └── High score tracking (localStorage)
```

---

## 5. Key Code Concepts Preview

### Map Grid Array Representation:

```javascript
const map = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 2, 2, 2, 1, 2, 2, 2, 3, 1],
  [1, 2, 1, 2, 1, 2, 1, 1, 2, 1],
  [1, 2, 1, 2, 2, 2, 2, 1, 2, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];
// Legend: 1 = Ice Wall, 2 = Krill, 3 = Power Crystal
```

### Main Game Loop Pattern:

```javascript
function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  updateGameObjects(); // Update Penguin position, beak frame, Fish AI, collisions
  drawGameObjects();   // Render ice maze, krill, Penguin, and Fish
  
  requestAnimationFrame(gameLoop);
}
```

---

## 6. Recommended Next Steps

1. **Asset Selection:** Decide whether to draw the Penguin and Fish using pure Canvas shapes (arcs, lines) or sprite sheet image files.
2. **Build Canvas Grid:** Set up an HTML canvas and render the initial ice grid map.
3. **Penguin Controller:** Implement character movement and beak animation state.