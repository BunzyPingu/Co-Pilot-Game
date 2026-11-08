/* =========================================================================
   Penguin vs Fish — Ice Maze Arcade (MVP)
   Vanilla JS + HTML5 Canvas. No external dependencies or assets required.
   Sounds are synthesized with the Web Audio API so it runs fully offline.
   ========================================================================= */

'use strict';

(function () {
  // ---------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------
  const TILE = 26;                 // pixel size of one grid tile
  const MOVE_SPEED = 4;            // tiles/second (grid-aligned movement)
  const BLOCK_SPEED = 1.5;         // tiles/second while on or entering a block
  const RANDOM_BLOCK_COUNT = 64;
  const FISH_SPEED = 2.2;          // tiles/second for fish in hunter/patrol mode
  const SCARED_SPEED = 1.5;        // tiles/second while frozen
  const FRIGHTEN_DURATION = 7500;  // ms the fish stay frozen after a crystal
  const ORANGE_RETREAT_DIST = 6;   // tile distance where orange fish retreats home
  const BASE_DASH_DISTANCE = 2;    // tiles per belly slide
  const DASH_SPEED_MULTIPLIER = 2.5;
  const DASH_COOLDOWN = 1.2;       // seconds
  const GOLDEN_KRILL_PER_LEVEL = 3;
  const UPGRADE_BASE_COST = 3;
  const MAX_UPGRADE_LEVEL = 5;
  const SPEED_RUN_LIMIT_SECONDS = 90;
  const SHIELD_POINTS_PER_PICKUP = 5;
  const MAX_SHIELD_POINTS = 20;
  const SHIELD_LEVEL_INTERVAL = 2;
  const BLIZZARD_SWITCH_INTERVAL = 5;
  const BLIZZARD_WITH_WIND_MULTIPLIER = 1.6;
  const BLIZZARD_AGAINST_WIND_MULTIPLIER = 0.55;
  const LEVEL_MODIFIERS = ['blizzard', 'night', 'frenzy'];

  // ---------------------------------------------------------------------
  // Map layout.
  //   # block (1)     . path (0)     o krill (2)    O crystal (3)    G golden krill (4)
  //   S shield pickup (5; placed on every second level)
  // Rows are padded to equal width in code, so exact alignment is forgiving.
  // ---------------------------------------------------------------------
  const MAP_LAYOUT = [
    "#############################",
    "#...........................#",
    "#o..oooo......##o..oo..O...#",
    "#o..oooo......##o..oo......#",
    "#o...........##...........#",
    "#ooooooo.....###...ooooooo.#",
    "#.------.....###...------..#",
    "#...........................#",
    "#####.#.#.........#.#.#####",
    "#....#.#.#.......#.#....#.",
    "#....#...#.....o#...#.....#",
    "#....#...#.....o#...#.....#",
    "#####.#.#......O#.#.#####",
    "    .#.#......###.#.    ",
    "#####.#.#......###.#.#####",
    "#....#...#.......#...#.....#",
    "#....#...#.....o#...#.....#",
    "#....#.#.#.......#.#....#.",
    "#####.#.#.........#.#.#####",
    "#...........................#",
    "#.------.....###...------..#",
    "#ooooooo.....###...ooooooo.#",
    "#o...........##...........#",
    "#o..oooo......##o..oo......#",
    "#o..oooo......##o..oo..O...#",
    "#############################"
  ];

  // ---------------------------------------------------------------------
  // Parse the layout into a numeric grid and derive dimensions.
  // ---------------------------------------------------------------------
  let rawRows = MAP_LAYOUT.map(function (r) { return r.split(''); });
  const maxLen = Math.max.apply(null, rawRows.map(function (r) { return r.length; }));
  rawRows.forEach(function (r) { while (r.length < maxLen) r.push('#'); });

  const map = rawRows.map(function (row) {
    return row.map(function (ch) {
      switch (ch) {
        case '#': return 1; // wall
        case '.': return 0; // path
        case 'o': return 2; // krill
        case 'O': return 3; // ice crystal
        default:  return 0; // any leftover space is walkable floor
      }
    });
  });

  const COLS = map[0].length;
  const ROWS = map.length;
  const CANVAS_W = COLS * TILE;
  const CANVAS_H = ROWS * TILE;

  // ---------------------------------------------------------------------
  // Direction vectors
  // ---------------------------------------------------------------------
  const DIRS = {
    UP:    { dx: 0, dy: -1 },
    DOWN:  { dx: 0, dy: 1 },
    LEFT:  { dx: -1, dy: 0 },
    RIGHT: { dx: 1, dy: 0 }
  };

  // Control-flow state variable (distinct from game.state).
  let state = 'menu';          // menu | play | pause | dead | over

  // ---------------------------------------------------------------------
  // Canvas + context
  // ---------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  function isPath(x, y) {
    const levelMap = currentMap || map;
    return x >= 0 && x < COLS && y >= 0 && y < ROWS && levelMap[y][x] !== 1;
  }

  function isInsideMap(x, y) {
    return x >= 0 && x < COLS && y >= 0 && y < ROWS;
  }

  function canPenguinEnter(x, y) {
    if (isInsideMap(x, y)) return true;
    if (x < 0) return isPath(COLS - 1, y);
    if (x >= COLS) return isPath(0, y);
    if (y < 0) return isPath(x, ROWS - 1);
    if (y >= ROWS) return isPath(x, 0);
    return false;
  }

  // BFS distance field from a source tile to every reachable passable tile.
  function bfsDistances(sx, sy) {
    const dist = {};
    const q = [{ x: sx, y: sy }];
    dist[sx + ',' + sy] = 0;
    while (q.length) {
      const cur = q.shift();
      const d = dist[cur.x + ',' + cur.y];
      const neighbors = [
        { x: cur.x, y: cur.y - 1 },
        { x: cur.x, y: cur.y + 1 },
        { x: cur.x - 1, y: cur.y },
        { x: cur.x + 1, y: cur.y }
      ];
      for (let i = 0; i < neighbors.length; i++) {
        const n = neighbors[i];
        if (!isPath(n.x, n.y)) continue;
        const key = n.x + ',' + n.y;
        if (!(key in dist)) {
          dist[key] = d + 1;
          q.push(n);
        }
      }
    }
    return dist;
  }

  // Nearest passable tile to a target point (used for homes / start).
  function findNearestPath(tx, ty) {
    const srcDist = bfsDistances(Math.floor(tx), Math.floor(ty));
    let bestKey = null, bestVal = Infinity;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!isPath(x, y)) continue;
        const v = srcDist[x + ',' + y];
        if (v !== undefined && v < bestVal) { bestVal = v; bestKey = x + ',' + y; }
      }
    }
    if (bestKey) {
      const parts = bestKey.split(',');
      return { x: parseInt(parts[0], 10), y: parseInt(parts[1], 10) };
    }
    let nearest = null;
    let nearestDistance = Infinity;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!isPath(x, y)) continue;
        const distance = Math.abs(x - tx) + Math.abs(y - ty);
        if (distance < nearestDistance) {
          nearest = { x: x, y: y };
          nearestDistance = distance;
        }
      }
    }
    if (!nearest) throw new Error('Map has no walkable tile');
    return nearest;
  }

  // Next grid step toward a target tile using the distance field.
  function nextStepToward(fromX, fromY, toX, toY) {
    const d = bfsDistances(toX, toY);
    let best = null, bestVal = Infinity;
    const neighbors = [
      { x: fromX, y: fromY - 1 },
      { x: fromX, y: fromY + 1 },
      { x: fromX - 1, y: fromY },
      { x: fromX + 1, y: fromY }
    ];
    for (let i = 0; i < neighbors.length; i++) {
      const n = neighbors[i];
      if (!isPath(n.x, n.y)) continue;
      const v = d[n.x + ',' + n.y];
      if (v !== undefined && v < bestVal) { bestVal = v; best = n; }
    }
    if (!best) return null;
    return { dx: best.x - fromX, dy: best.y - fromY };
  }

  function loadStoredCount(key) {
    const stored = parseInt(localStorage.getItem(key) || '0', 10);
    return Number.isFinite(stored) && stored >= 0 ? stored : 0;
  }

  function loadUpgradeLevel(key) {
    return Math.min(MAX_UPGRADE_LEVEL, loadStoredCount(key));
  }

  function upgradeCost(level) {
    return UPGRADE_BASE_COST + level * 2;
  }

  // ---------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------
  const game = {
    score: 0,
    lives: 3,
    level: 1,
    mode: 'normal',
    currentModifier: 'blizzard',
    windDirection: 1,
    windTimer: 0,
    highScore: parseInt(localStorage.getItem('penguinFishHigh') || '0', 10) || 0,
    state: 'menu',          // menu | play | pause | dead | over
    frightenedTime: 0,      // ms remaining of frozen fish
    fishEatenThisLevel: 0,
    pendingNextLevel: false,
    levelElapsedSeconds: 0,
    krillTotalThisLevel: 0,
    krillCollectedThisLevel: 0,
    hitThisLevel: false,
    goldenKrill: loadStoredCount('penguinFishGoldenKrill'),
    upgrades: {
      bellySlide: loadUpgradeLevel('penguinFishUpgradeBellySlide'),
      feathers: loadUpgradeLevel('penguinFishUpgradeFeathers'),
      freeze: loadUpgradeLevel('penguinFishUpgradeFreeze'),
      magnet: loadUpgradeLevel('penguinFishUpgradeMagnet')
    },
    shieldPoints: 0,
    dashDistanceRemaining: 0,
    dashCooldownRemaining: 0,
    goldenKrillLeft: 0
  };

  const hud = {
    score: document.getElementById('score'),
    level: document.getElementById('level'),
    lives: document.getElementById('lives'),
    high: document.getElementById('highscore'),
    mode: document.getElementById('mode-hud'),
    modifier: document.getElementById('modifier-hud')
  };
  const hudEl = document.getElementById('hud');
  const shieldHud = document.getElementById('shield-hud');
  const goldenKrillHud = document.getElementById('golden-krill-hud');

  // ---------------------------------------------------------------------
  // Penguin
  // ---------------------------------------------------------------------
  const penguin = {
    gx: 0, gy: 0,          // integer grid position (current tile)
    px: 0, py: 0,          // float pixel position (rendering)
    dir: null,             // committed direction
    nextDir: null,         // buffered desired direction
    mouthOpen: 0           // 0..1 beak openness animation
  };

  function resetPenguin() {
    const home = findNearestPath(COLS / 2, ROWS - 3);
    penguin.gx = home.x; penguin.gy = home.y;
    penguin.px = penguin.gx * TILE + TILE / 2;
    penguin.py = penguin.gy * TILE + TILE / 2;
    penguin.dir = null;
    penguin.nextDir = null;
    penguin.mouthOpen = 0;
    game.dashDistanceRemaining = 0;
  }

  // ---------------------------------------------------------------------
  // Fish
  // ---------------------------------------------------------------------
  const FISH_TYPES = {
    red:    { color: '#ff5252', name: 'Red' },
    pink:   { color: '#ff8ad6', name: 'Pink' },
    blue:   { color: '#4dabf7', name: 'Blue' },
    orange: { color: '#ffa94d', name: 'Orange' }
  };

  let fish = [];
  let lastFishLayoutSignature = '';

  function getReachableTiles(levelMap, start) {
    const visited = Array.from({ length: ROWS }, function () {
      return Array(COLS).fill(false);
    });
    const queue = [start];
    visited[start.y][start.x] = true;

    for (let i = 0; i < queue.length; i++) {
      const tile = queue[i];
      const neighbors = [
        { x: tile.x, y: tile.y - 1 },
        { x: tile.x, y: tile.y + 1 },
        { x: tile.x - 1, y: tile.y },
        { x: tile.x + 1, y: tile.y }
      ];
      for (let j = 0; j < neighbors.length; j++) {
        const neighbor = neighbors[j];
        if (!isInsideMap(neighbor.x, neighbor.y) ||
            levelMap[neighbor.y][neighbor.x] === 1 ||
            visited[neighbor.y][neighbor.x]) continue;
        visited[neighbor.y][neighbor.x] = true;
        queue.push(neighbor);
      }
    }

    return queue;
  }

  function chooseFishHomes(start) {
    if (game.level === 1) {
      return [
        findNearestPath(1, 1),
        findNearestPath(COLS - 2, 1),
        findNearestPath(1, ROWS - 2),
        findNearestPath(COLS - 2, ROWS - 2)
      ];
    }

    const reachable = getReachableTiles(currentMap, start).filter(function (tile) {
      return currentMap[tile.y][tile.x] === 0 &&
        Math.abs(tile.x - start.x) + Math.abs(tile.y - start.y) >= 4;
    });

    for (let separation = 6; separation >= 2; separation--) {
      for (let attempt = 0; attempt < 80; attempt++) {
        const candidates = shuffled(reachable.slice());
        const homes = [];
        for (let i = 0; i < candidates.length && homes.length < 4; i++) {
          const candidate = candidates[i];
          const separated = homes.every(function (home) {
            return Math.abs(home.x - candidate.x) + Math.abs(home.y - candidate.y) >= separation;
          });
          if (separated) homes.push(candidate);
        }
        if (homes.length !== 4) continue;
        const signature = homes.map(function (home) { return home.x + ',' + home.y; }).join('|');
        if (signature !== lastFishLayoutSignature) {
          lastFishLayoutSignature = signature;
          return homes;
        }
      }
    }

    throw new Error('Could not find a unique set of reachable fish starting positions');
  }

  function buildFish() {
    const homes = chooseFishHomes({ x: penguin.gx, y: penguin.gy });
    const hunterSpeed = FISH_SPEED +
      (game.mode === 'survival' ? (game.level - 1) * 0.15 : 0);
    fish = [
      { type: 'red',    home: homes[0], speed: hunterSpeed },
      { type: 'pink',   home: homes[1], speed: hunterSpeed },
      { type: 'blue',   home: homes[2], speed: hunterSpeed },
      { type: 'orange', home: homes[3], speed: hunterSpeed }
    ];
    if (game.currentModifier === 'frenzy') addFrenzyFish(hunterSpeed);
    fish.forEach(function (f) {
      f.gx = f.home.x; f.gy = f.home.y;
      f.px = f.gx * TILE + TILE / 2;
      f.py = f.gy * TILE + TILE / 2;
      f.dir = null;
      f.moveTimer = 0;
      f.state = 'hunter'; // hunter | scared
    });
  }

  function addFrenzyFish(speed) {
    const reachable = getReachableTiles(currentMap, { x: penguin.gx, y: penguin.gy });
    const candidates = shuffled(reachable.filter(function (tile) {
      return currentMap[tile.y][tile.x] === 0 &&
        Math.abs(tile.x - penguin.gx) + Math.abs(tile.y - penguin.gy) >= 5 &&
        fish.every(function (existing) {
          return Math.abs(tile.x - existing.home.x) + Math.abs(tile.y - existing.home.y) >= 3;
        });
    }));
    const originalFish = fish.slice();
    const selectedHomes = [];
    for (let i = 0; i < candidates.length && selectedHomes.length < originalFish.length; i++) {
      const tile = candidates[i];
      const separated = selectedHomes.every(function (home) {
        return Math.abs(tile.x - home.x) + Math.abs(tile.y - home.y) >= 3;
      });
      if (separated) selectedHomes.push(tile);
    }
    if (selectedHomes.length !== originalFish.length) {
      throw new Error('Could not find safe reachable starting positions for Fish Frenzy');
    }
    originalFish.forEach(function (original, index) {
      fish.push({ type: original.type, home: selectedHomes[index], speed: speed });
    });
  }

  function selectLevelModifier() {
    game.currentModifier = LEVEL_MODIFIERS[Math.floor(Math.random() * LEVEL_MODIFIERS.length)];
    game.windDirection = Math.random() < 0.5 ? -1 : 1;
    game.windTimer = 0;
  }

  function scareFish() {
    game.frightenedTime = FRIGHTEN_DURATION * (1 + game.upgrades.freeze * 0.15);
    fish.forEach(function (f) { f.state = 'scared'; });
  }

  // ---------------------------------------------------------------------
  // Audio (Web Audio API — synthesized, no asset files needed)
  // ---------------------------------------------------------------------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
      } catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function beep(freq, duration, type, volume) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume || 0.15, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }

  const sfx = {
    chomp: function () { beep(320, 0.06, 'square', 0.12); },
    crystal: function () { beep(660, 0.10, 'triangle', 0.14); beep(880, 0.12, 'triangle', 0.10); }
  };

  // ---------------------------------------------------------------------
  // Level setup (fresh collectibles and a unique obstacle layout per level)
  // ---------------------------------------------------------------------
  let currentMap = null;
  let lastLevelMapSignature = '';

  function shuffled(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const item = items[i];
      items[i] = items[j];
      items[j] = item;
    }
    return items;
  }

  function levelTargetsReachable(levelMap, start, targets) {
    const reachable = getReachableTiles(levelMap, start);
    const visited = new Set(reachable.map(function (tile) { return tile.x + ',' + tile.y; }));
    return targets.every(function (tile) { return visited.has(tile.x + ',' + tile.y); });
  }

  function mapSignature(levelMap) {
    return levelMap.map(function (row) {
      return row.map(function (tile) { return tile === 1 ? '1' : '0'; }).join('');
    }).join('');
  }

  function loadLevel() {
    selectLevelModifier();
    currentMap = map.map(function (row) { return row.slice(); });
    const playerStart = findNearestPath(COLS / 2, ROWS - 3);
    const fishStarts = [
      findNearestPath(1, 1),
      findNearestPath(COLS - 2, 1),
      findNearestPath(1, ROWS - 2),
      findNearestPath(COLS - 2, ROWS - 2)
    ];
    const targets = fishStarts.concat([playerStart]);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (currentMap[y][x] === 2 || currentMap[y][x] === 3) {
          targets.push({ x: x, y: y });
        }
      }
    }

    if (game.level > 1) {
      const reserved = new Set(targets.map(function (tile) { return tile.x + ',' + tile.y; }));
      let uniqueMap = null;
      for (let attempt = 0; attempt < 50 && !uniqueMap; attempt++) {
        const candidate = map.map(function (row) { return row.slice(); });
        const openTiles = [];
        for (let y = 1; y < ROWS - 1; y++) {
          for (let x = 1; x < COLS - 1; x++) {
            if (candidate[y][x] === 1) candidate[y][x] = 0;
            if (candidate[y][x] === 0 && !reserved.has(x + ',' + y)) {
              openTiles.push({ x: x, y: y });
            }
          }
        }
        shuffled(openTiles);

        let blocksPlaced = 0;
        for (let i = 0; i < openTiles.length && blocksPlaced < RANDOM_BLOCK_COUNT; i++) {
          const tile = openTiles[i];
          candidate[tile.y][tile.x] = 1;
          if (levelTargetsReachable(candidate, playerStart, targets)) {
            blocksPlaced++;
          } else {
            candidate[tile.y][tile.x] = 0;
          }
        }

        const signature = mapSignature(candidate);
        if (blocksPlaced === RANDOM_BLOCK_COUNT &&
            levelTargetsReachable(candidate, playerStart, targets) &&
            signature !== lastLevelMapSignature) {
          uniqueMap = candidate;
        }
      }
      if (!uniqueMap) throw new Error('Could not generate a unique connected level map');
      currentMap = uniqueMap;
    }

    const reachable = getReachableTiles(currentMap, playerStart);
    if (game.currentModifier === 'frenzy') {
      const baseCrystalCount = map.reduce(function (count, row) {
        return count + row.filter(function (tile) { return tile === 3; }).length;
      }, 0);
      const fractionalCrystal = baseCrystalCount * 0.5 % 1;
      const extraCrystalCount = Math.floor(baseCrystalCount * 0.5) +
        Number(Math.random() < fractionalCrystal);
      const fishStartSet = new Set(fishStarts.map(function (tile) {
        return tile.x + ',' + tile.y;
      }));
      const crystalTiles = shuffled(reachable.filter(function (tile) {
        return currentMap[tile.y][tile.x] === 0 &&
          !fishStartSet.has(tile.x + ',' + tile.y) &&
          Math.abs(tile.x - playerStart.x) + Math.abs(tile.y - playerStart.y) >= 3;
      }));
      if (crystalTiles.length < extraCrystalCount) {
        throw new Error('Not enough reachable tiles to add Fish Frenzy ice crystals');
      }
      for (let i = 0; i < extraCrystalCount; i++) {
        const tile = crystalTiles[i];
        currentMap[tile.y][tile.x] = 3;
      }
    }
    const goldenKrillTiles = shuffled(reachable.filter(function (tile) {
      return currentMap[tile.y][tile.x] === 0;
    }));
    if (goldenKrillTiles.length < GOLDEN_KRILL_PER_LEVEL) {
      throw new Error('Not enough reachable floor tiles to place Golden Krill');
    }
    for (let i = 0; i < GOLDEN_KRILL_PER_LEVEL; i++) {
      const tile = goldenKrillTiles[i];
      currentMap[tile.y][tile.x] = 4;
    }
    game.goldenKrillLeft = GOLDEN_KRILL_PER_LEVEL;
    if (game.level % SHIELD_LEVEL_INTERVAL === 0) {
      const reservedStarts = new Set(fishStarts.map(function (tile) {
        return tile.x + ',' + tile.y;
      }));
      const shieldTiles = shuffled(reachable.filter(function (tile) {
        return currentMap[tile.y][tile.x] === 0 &&
          !reservedStarts.has(tile.x + ',' + tile.y) &&
          Math.abs(tile.x - playerStart.x) + Math.abs(tile.y - playerStart.y) >= 3;
      }));
      if (shieldTiles.length === 0) {
        throw new Error('Could not find a reachable tile for the level shield pickup');
      }
      currentMap[shieldTiles[0].y][shieldTiles[0].x] = 5;
    }
    game.krillTotalThisLevel = 0;
    game.krillCollectedThisLevel = 0;
    game.levelElapsedSeconds = 0;
    game.hitThisLevel = false;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (currentMap[y][x] === 2) game.krillTotalThisLevel++;
      }
    }
    lastLevelMapSignature = mapSignature(currentMap);
    game.fishEatenThisLevel = 0;
    resetPenguin();
    buildFish();
    game.frightenedTime = 0;
  }

  // ---------------------------------------------------------------------
  // Movement — grid-aligned with input buffering + tunnel wrap-around.
  // ---------------------------------------------------------------------
  function movePenguin(dt) {
    if (!penguin.dir) return false;
    const targetX = penguin.gx + penguin.dir.dx;
    const targetY = penguin.gy + penguin.dir.dy;
    if (!canPenguinEnter(targetX, targetY)) return false;

    const onBlock = currentMap[penguin.gy][penguin.gx] === 1 ||
      (isInsideMap(targetX, targetY) && currentMap[targetY][targetX] === 1);
    const stepSpeed = game.dashDistanceRemaining > 0
      ? MOVE_SPEED * DASH_SPEED_MULTIPLIER
      : onBlock ? BLOCK_SPEED : MOVE_SPEED;
    const windMultiplier = game.currentModifier === 'blizzard' && penguin.dir.dx !== 0
      ? penguin.dir.dx === game.windDirection
        ? BLIZZARD_WITH_WIND_MULTIPLIER
        : BLIZZARD_AGAINST_WIND_MULTIPLIER
      : 1;
    const step = Math.min(stepSpeed * windMultiplier * TILE * dt,
      game.dashDistanceRemaining > 0 ? game.dashDistanceRemaining * TILE : Infinity);
    const targetCenterX = targetX * TILE + TILE / 2;
    const targetCenterY = targetY * TILE + TILE / 2;
    let movedPixels;

    if (penguin.dir.dx !== 0) {
      const distance = Math.abs(penguin.px - targetCenterX);
      movedPixels = Math.min(step, distance);
      if (distance <= step) {
        penguin.gx = targetX < 0 ? COLS - 1 : targetX >= COLS ? 0 : targetX;
        penguin.px = penguin.gx * TILE + TILE / 2;
        commitDir(penguin.gx, penguin.gy);
      } else {
        penguin.px += penguin.dir.dx * step;
      }
    } else {
      const distance = Math.abs(penguin.py - targetCenterY);
      movedPixels = Math.min(step, distance);
      if (distance <= step) {
        penguin.gy = targetY < 0 ? ROWS - 1 : targetY >= ROWS ? 0 : targetY;
        penguin.py = penguin.gy * TILE + TILE / 2;
        commitDir(penguin.gx, penguin.gy);
      } else {
        penguin.py += penguin.dir.dy * step;
      }
    }

    if (game.dashDistanceRemaining > 0) {
      game.dashDistanceRemaining = Math.max(0, game.dashDistanceRemaining - movedPixels / TILE);
    }
    return true;
  }

  function commitDir(nx, ny) {
    // If a buffered turn is valid at this junction, adopt it for the next segment.
    if (penguin.nextDir) {
      const d = penguin.nextDir;
      const ok = canPenguinEnter(nx + d.dx, ny + d.dy);
      if (ok) { penguin.dir = d; }
    } else {
      // No turn buffered — keep moving straight in the current direction.
      penguin.dir = penguin.dir || DIRS.UP;
    }
    penguin.nextDir = null;
  }

  // ---------------------------------------------------------------------
  // Fish AI update
  // ---------------------------------------------------------------------
  function updateFish(dt) {
    const pDir = penguin.dir || DIRS.UP;
    fish.forEach(function (f) {
      f.speed = f.state === 'scared'
        ? SCARED_SPEED
        : FISH_SPEED + (game.mode === 'survival' ? (game.level - 1) * 0.15 : 0);
      f.moveTimer += dt;
      if (f.moveTimer < 1 / f.speed) return;
      f.moveTimer -= 1 / f.speed;

      let step;
      if (f.state === 'scared') {
        // Random valid neighbor.
        const options = [];
        [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }]
          .forEach(function (d) { if (isPath(f.gx + d.dx, f.gy + d.dy)) options.push(d); });
        if (options.length) { step = options[Math.floor(Math.random() * options.length)]; }
      } else if (f.type === 'orange') {
        // Chase when far, retreat to home corner when close.
        const distToP = Math.abs(f.gx - penguin.gx) + Math.abs(f.gy - penguin.gy);
        if (distToP > ORANGE_RETREAT_DIST) {
          step = nextStepToward(f.gx, f.gy, penguin.gx, penguin.gy);
        } else {
          const homeDist = bfsDistances(f.home.x, f.home.y);
          step = nextStepToward(f.gx, f.gy, f.home.x, f.home.y);
        }
      } else if (f.type === 'pink') {
        // Intercept: aim for a point ahead of the penguin along its path.
        const targetX = penguin.gx + pDir.dx * 2;
        const targetY = penguin.gy + pDir.dy * 2;
        step = nextStepToward(f.gx, f.gy, Math.max(0, Math.min(COLS - 1, targetX)), Math.max(0, Math.min(ROWS - 1, targetY)));
      } else {
        // Red / Blue: directly track the penguin.
        step = nextStepToward(f.gx, f.gy, penguin.gx, penguin.gy);
      }

      if (step) {
        let nx = f.gx + step.dx;
        let ny = f.gy + step.dy;
        let ok = isPath(nx, ny);
        // tunnel wrap for fish too
        if (!ok && step.dx === -1 && isPath(COLS - 1, ny)) { nx = COLS - 1; ok = true; }
        if (!ok && step.dx === 1 && isPath(0, ny)) { nx = 0; ok = true; }
        if (!ok && step.dy === -1 && isPath(nx, 0)) { ny = 0; ok = true; }
        if (!ok && step.dy === 1 && isPath(nx, ROWS - 1)) { ny = ROWS - 1; ok = true; }
        // Snap to the new tile center so grid steps never drift.
        if (ok) { f.gx = nx; f.gy = ny; f.px = nx * TILE + TILE / 2; f.py = ny * TILE + TILE / 2; f.dir = step; }
      } else {
        // Stuck — nudge to a random valid neighbor so they don't freeze.
        const options = [];
        [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }]
          .forEach(function (d) { if (isPath(f.gx + d.dx, f.gy + d.dy)) options.push(d); });
        if (options.length) { const o = options[Math.floor(Math.random() * options.length)]; f.gx += o.dx; f.gy += o.dy; }
      }
    });
  }

  // ---------------------------------------------------------------------
  // Collisions & scoring
  // ---------------------------------------------------------------------
  function eatKrillAt(x, y) {
    const radius = game.upgrades.magnet;
    for (let row = Math.max(0, y - radius); row <= Math.min(ROWS - 1, y + radius); row++) {
      for (let col = Math.max(0, x - radius); col <= Math.min(COLS - 1, x + radius); col++) {
        const distance = Math.abs(col - x) + Math.abs(row - y);
        if (distance > radius || !isPath(col, row) || currentMap[row][col] !== 2) continue;
        currentMap[row][col] = 0;
        game.score += 5;
        game.krillCollectedThisLevel++;
        sfx.chomp();
      }
    }
    updateHUD();
  }

  function eatGoldenKrillAt(x, y) {
    if (currentMap[y][x] !== 4) return;
    currentMap[y][x] = 0;
    game.goldenKrillLeft--;
    game.goldenKrill++;
    localStorage.setItem('penguinFishGoldenKrill', String(game.goldenKrill));
    updateHUD();
    updateShop();
    sfx.chomp();
  }

  function eatShieldAt(x, y) {
    if (currentMap[y][x] !== 5) return;
    currentMap[y][x] = 0;
    game.shieldPoints = Math.min(
      MAX_SHIELD_POINTS,
      game.shieldPoints + SHIELD_POINTS_PER_PICKUP
    );
    updateHUD();
  }

  function eatCrystalAt(x, y) {
    if (currentMap[y][x] === 3) {
      currentMap[y][x] = 0;
      game.score += 50;
      updateHUD();
      sfx.crystal();
      scareFish();
    }
  }

  function eatFish(f, index) {
    game.score += 25;
    game.fishEatenThisLevel++;
    updateHUD();
    f.state = 'hunter';
    f.gx = f.home.x; f.gy = f.home.y;
    f.px = f.gx * TILE + TILE / 2; f.py = f.gy * TILE + TILE / 2;
    f.dir = null;
    game.frightenedTime = 0; // eating resets the freeze timer
    if (game.fishEatenThisLevel >= fish.length) {
      if (game.mode === 'survival') {
        game.level++;
        loadLevel();
        updateHUD();
        return;
      }
      const clearedLevel = game.level;
      const speedRunEarned = game.levelElapsedSeconds < SPEED_RUN_LIMIT_SECONDS;
      const perfectEarned = !game.hitThisLevel &&
        game.krillCollectedThisLevel === game.krillTotalThisLevel;
      const earnedStars = 1 + Number(speedRunEarned) + Number(perfectEarned);
      const bestStarsKey = 'penguinFishLevelStars' + clearedLevel;
      const previousBest = Math.min(3, loadStoredCount(bestStarsKey));
      const bestStars = Math.max(previousBest, earnedStars);
      localStorage.setItem(bestStarsKey, String(bestStars));
      game.pendingNextLevel = true;
      state = 'levelComplete';
      showLevelOverlay(clearedLevel, earnedStars, bestStars, speedRunEarned, perfectEarned);
    }
  }

  function penguinHit() {
    game.hitThisLevel = true;
    if (game.shieldPoints > 0) {
      game.shieldPoints = Math.max(0, game.shieldPoints - SHIELD_POINTS_PER_PICKUP);
      updateHUD();
      state = 'dead';
      setTimeout(function () { resetPenguin(); state = 'play'; }, 650);
      return;
    }
    saveHighScore();
    if (game.mode !== 'survival') game.score = 0;
    game.lives--;
    updateHUD();
    if (game.lives <= 0) {
      gameOver();
    } else {
      state = 'dead';
      setTimeout(function () { resetPenguin(); state = 'play'; }, 900);
    }
  }

  // ---------------------------------------------------------------------
  // Main update
  // ---------------------------------------------------------------------
  function update(dt) {
    if (state !== 'play') return;

    game.levelElapsedSeconds += dt;
    game.dashCooldownRemaining = Math.max(0, game.dashCooldownRemaining - dt);
    if (game.currentModifier === 'blizzard') {
      game.windTimer += dt;
      if (game.windTimer >= BLIZZARD_SWITCH_INTERVAL) {
        game.windTimer %= BLIZZARD_SWITCH_INTERVAL;
        game.windDirection *= -1;
        updateHUD();
      }
    }

    // Frightened timer countdown.
    if (game.frightenedTime > 0) {
      game.frightenedTime -= dt * 1000;
      if (game.frightenedTime <= 0) {
        game.frightenedTime = 0;
        fish.forEach(function (f) { f.state = 'hunter'; });
      }
    }

    const pMoved = movePenguin(dt);
    updateFish(dt);

    // Beak chomp animation: opens while moving, closes at rest.
    if (pMoved) {
      penguin.mouthOpen = Math.min(1, penguin.mouthOpen + dt * 5);
    } else {
      penguin.mouthOpen = Math.max(0, penguin.mouthOpen - dt * 3);
    }

    // Penguin vs collectibles.
    eatKrillAt(penguin.gx, penguin.gy);
    eatCrystalAt(penguin.gx, penguin.gy);
    eatGoldenKrillAt(penguin.gx, penguin.gy);
    eatShieldAt(penguin.gx, penguin.gy);

    // Penguin vs fish (hunter fish hurt you; frozen fish become snacks).
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      if (f.state === 'hunter' && Math.abs(f.gx - penguin.gx) < 1 && Math.abs(f.gy - penguin.gy) < 1) {
        penguinHit();
        return; // one collision per frame
      } else if (f.state === 'scared' && Math.abs(f.gx - penguin.gx) < 1 && Math.abs(f.gy - penguin.gy) < 1) {
        eatFish(f, i);
        return;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  function drawMap() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (game.currentModifier === 'night') {
      ctx.fillStyle = '#020811';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = currentMap ? currentMap[y][x] : map[y][x];
        if (t === 1) drawWall(x, y);
        else if (t === 2) drawKrill(x, y);
        else if (t === 3) drawCrystal(x, y);
        else if (t === 4) drawGoldenKrill(x, y);
        else if (t === 5) drawShieldPickup(x, y);
      }
    }
  }

  function drawFloorTile(x, y) {
    ctx.fillStyle = '#0f2b42';
    ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
  }

  function roundRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawWall(x, y) {
    const pad = 2;
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2;
    ctx.fillStyle = game.currentModifier === 'night' ? '#263b50' : '#a9d8ee';
    roundRect(cx - TILE / 2, cy - TILE / 2, TILE, TILE, 6);
    ctx.fill();
    ctx.fillStyle = game.currentModifier === 'night'
      ? 'rgba(150,205,235,0.12)'
      : 'rgba(255,255,255,0.35)';
    roundRect(cx - TILE / 2 + pad, cy - TILE / 2 + pad, TILE - pad * 2, TILE / 2 - pad, 4);
    ctx.fill();
    // Subtle border.
    ctx.strokeStyle = 'rgba(40,90,120,0.6)';
    ctx.lineWidth = 1.5;
    roundRect(cx - TILE / 2 + 1, cy - TILE / 2 + 1, TILE - 2, TILE - 2, 5);
    ctx.stroke();
  }

  function drawKrill(x, y) {
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2;
    if (game.currentModifier === 'night') {
      const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, TILE * 0.48);
      glow.addColorStop(0, 'rgba(127,235,255,0.72)');
      glow.addColorStop(1, 'rgba(90,200,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - TILE / 2, cy - TILE / 2, TILE, TILE);
    }
    ctx.fillStyle = game.currentModifier === 'night' ? '#a8f5ff' : '#1b3a55';
    ctx.beginPath();
    ctx.arc(cx, cy, game.currentModifier === 'night' ? 4.5 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#eaf6ff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawGoldenKrill(x, y) {
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2;
    ctx.fillStyle = '#ffd24d';
    ctx.strokeStyle = '#fff1a8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let point = 0; point < 10; point++) {
      const radius = point % 2 === 0 ? 8 : 4;
      const angle = -Math.PI / 2 + point * Math.PI / 5;
      const px = cx + Math.cos(angle) * radius;
      const py = cy + Math.sin(angle) * radius;
      if (point === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawShieldPickup(x, y) {
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2;
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 350);
    ctx.fillStyle = 'rgba(104,220,255,' + (0.2 + pulse * 0.2) + ')';
    ctx.beginPath();
    ctx.arc(cx, cy, TILE * 0.43, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#69ddff';
    ctx.strokeStyle = '#e6fbff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx + 7, cy - 5);
    ctx.lineTo(cx + 6, cy + 2);
    ctx.quadraticCurveTo(cx + 4, cy + 7, cx, cy + 9);
    ctx.quadraticCurveTo(cx - 4, cy + 7, cx - 6, cy + 2);
    ctx.lineTo(cx - 7, cy - 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#0d5671';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy);
    ctx.lineTo(cx - 1, cy + 3);
    ctx.lineTo(cx + 4, cy - 3);
    ctx.stroke();
  }

  function drawCrystal(x, y) {
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2;
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
    // Glow.
    ctx.fillStyle = 'rgba(120,230,255,' + (0.25 + pulse * 0.25) + ')';
    roundRect(cx - TILE / 2 + 3, cy - TILE / 2 + 3, TILE - 6, TILE - 6, 4);
    ctx.fill();
    // Crystal body.
    ctx.fillStyle = '#8fe9ff';
    ctx.strokeStyle = '#e6fbff';
    ctx.lineWidth = 1.5;
    roundRect(cx - TILE / 2 + 3, cy - TILE / 2 + 3, TILE - 6, TILE - 6, 4);
    ctx.fill();
    ctx.stroke();
  }

  function drawPenguin() {
    const cx = penguin.px;
    const cy = penguin.py;
    const r = TILE * 0.44;
    const dir = penguin.dir || DIRS.RIGHT;
    const dirAngle = Math.atan2(dir.dy, dir.dx);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(dirAngle);

    // The dark silhouette and white belly remain distinct at the game's tile size.
    ctx.fillStyle = '#172b3b';
    ctx.strokeStyle = '#07131d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(-r * 0.08, 0, r * 0.7, r * 0.94, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Narrow side flippers.
    ctx.fillStyle = '#263f50';
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, -r * 0.56, r * 0.19, r * 0.42, -0.35, 0, Math.PI * 2);
    ctx.ellipse(-r * 0.2, r * 0.56, r * 0.19, r * 0.42, 0.35, 0, Math.PI * 2);
    ctx.fill();

    // White belly and face patches.
    ctx.fillStyle = '#f5fbff';
    ctx.beginPath();
    ctx.ellipse(-r * 0.13, r * 0.18, r * 0.43, r * 0.61, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(r * 0.3, -r * 0.2, r * 0.29, r * 0.2, 0.25, 0, Math.PI * 2);
    ctx.ellipse(r * 0.3, r * 0.2, r * 0.29, r * 0.2, -0.25, 0, Math.PI * 2);
    ctx.fill();

    // Eyes with small highlights.
    ctx.fillStyle = '#10202c';
    ctx.beginPath();
    ctx.arc(r * 0.42, -r * 0.2, r * 0.095, 0, Math.PI * 2);
    ctx.arc(r * 0.42, r * 0.2, r * 0.095, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(r * 0.45, -r * 0.23, r * 0.03, 0, Math.PI * 2);
    ctx.arc(r * 0.45, r * 0.17, r * 0.03, 0, Math.PI * 2);
    ctx.fill();

    // Tapered orange beak.
    ctx.fillStyle = '#ff9800';
    ctx.strokeStyle = '#c65f00';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(r * 0.48, -r * 0.1);
    ctx.lineTo(r * 0.98, 0);
    ctx.lineTo(r * 0.48, r * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Two webbed feet peeking out beneath the body.
    ctx.fillStyle = '#ff9800';
    ctx.strokeStyle = '#c65f00';
    ctx.beginPath();
    ctx.ellipse(-r * 0.31, r * 0.83, r * 0.22, r * 0.11, -0.12, 0, Math.PI * 2);
    ctx.ellipse(r * 0.16, r * 0.83, r * 0.22, r * 0.11, 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // Dead flash tint.
    if (state === 'dead') {
      ctx.fillStyle = 'rgba(200,0,0,' + (0.5 * Math.min(1, (900 - performance.now() % 400) / 400)) + ')';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFish(f) {
    const cx = f.px;
    const cy = f.py;
    const dirAngle = Math.atan2(f.dir ? f.dir.dy : 0, f.dir ? f.dir.dx : 1);
    const baseColor = FISH_TYPES[f.type].color;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(dirAngle);

    if (game.currentModifier === 'night') {
      const lureX = TILE * 0.2;
      const lureY = -TILE * 0.38;
      const glow = ctx.createRadialGradient(lureX, lureY, 1, lureX, lureY, TILE * 0.9);
      glow.addColorStop(0, 'rgba(255,219,125,0.58)');
      glow.addColorStop(1, 'rgba(255,166,80,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(-TILE, -TILE, TILE * 2, TILE * 2);
    }

    // Body.
    ctx.fillStyle = f.state === 'scared' ? '#7fb3e0' : baseColor;
    ctx.strokeStyle = f.state === 'scared' ? '#2b5a7d' : '#12344a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, TILE * 0.42, TILE * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Tail fin.
    ctx.fillStyle = f.state === 'scared' ? '#5a93bd' : shade(baseColor, -20);
    ctx.beginPath();
    ctx.moveTo(-TILE * 0.38, 0);
    ctx.lineTo(-TILE * 0.56, -TILE * 0.14);
    ctx.lineTo(-TILE * 0.56, TILE * 0.14);
    ctx.closePath();
    ctx.fill();

    if (f.state === 'scared') {
      // Scared face: two eyes + frown, with blink timer.
      const blink = performance.now() % 2000 < 150;
      ctx.fillStyle = '#10202c';
      ctx.beginPath(); ctx.arc(TILE * 0.14, -TILE * 0.08, TILE * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(TILE * 0.14,  TILE * 0.08, TILE * 0.06, 0, Math.PI * 2); ctx.fill();
      if (!blink) {
        ctx.strokeStyle = '#10202c';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-TILE * 0.18, TILE * 0.16);
        ctx.lineTo(TILE * 0.18, TILE * 0.16);
        ctx.stroke();
      }
    } else {
      // Hunter face: single eye facing forward.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(TILE * 0.24, 0, TILE * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#10202c';
      ctx.beginPath(); ctx.arc(TILE * 0.32, 0, TILE * 0.07, 0, Math.PI * 2); ctx.fill();
    }

    if (game.currentModifier === 'night') {
      const lureX = TILE * 0.2;
      const lureY = -TILE * 0.38;
      ctx.strokeStyle = '#d4bd83';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(TILE * 0.12, -TILE * 0.12);
      ctx.quadraticCurveTo(TILE * 0.36, -TILE * 0.36, lureX, lureY);
      ctx.stroke();
      ctx.fillStyle = '#fff0b0';
      ctx.strokeStyle = '#ffbd62';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(lureX, lureY, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  function shade(hex, amt) {
    // Adjust brightness of a hex color by `amt` (-100..100).
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + amt, g = ((n >> 8) & 0xff) + amt, b = (n & 0xff) + amt;
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function render() {
    drawMap();
    if (game.currentModifier === 'blizzard') drawBlizzardGusts(performance.now());
    for (let i = 0; i < fish.length; i++) drawFish(fish[i]);
    drawPenguin();
  }

  function drawBlizzardGusts(timestamp) {
    const direction = game.windDirection;
    ctx.save();
    ctx.strokeStyle = 'rgba(195,235,255,0.42)';
    ctx.lineWidth = 1.5;
    for (let y = 1; y < ROWS - 1; y++) {
      for (let gust = 0; gust < 4; gust++) {
        const travel = timestamp * 0.045 * direction + y * TILE * 3 + gust * CANVAS_W / 4;
        const x = ((travel % CANVAS_W) + CANVAS_W) % CANVAS_W;
        const tileX = Math.floor(x / TILE);
        if (!isPath(tileX, y)) continue;
        ctx.beginPath();
        ctx.moveTo(x, y * TILE + TILE / 2);
        ctx.lineTo(x + direction * 11, y * TILE + TILE / 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  const menuPreview = document.getElementById('menu-preview');
  const previewCtx = menuPreview.getContext('2d');

  function drawMenuPreview(timestamp) {
    const tile = 24;
    const cols = menuPreview.width / tile;
    const rows = menuPreview.height / tile;
    const elapsed = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : timestamp / 1000;
    const travelWidth = menuPreview.width - tile * 4;
    const penguinX = tile * 2 + ((elapsed * 46) % travelWidth);
    const fishX = menuPreview.width - tile * 2 - ((elapsed * 34) % travelWidth);

    previewCtx.clearRect(0, 0, menuPreview.width, menuPreview.height);
    previewCtx.fillStyle = '#0d2438';
    previewCtx.fillRect(0, 0, menuPreview.width, menuPreview.height);

    const walls = [
      [0, 0, cols, 1], [0, rows - 1, cols, 1], [0, 1, 1, rows - 2], [cols - 1, 1, 1, rows - 2],
      [3, 2, 4, 1], [8, 1, 1, 2], [12, 2, 4, 1], [5, 5, 1, 2], [9, 5, 4, 1], [15, 5, 2, 1]
    ];
    previewCtx.fillStyle = '#a9d8ee';
    previewCtx.strokeStyle = 'rgba(40,90,120,0.75)';
    previewCtx.lineWidth = 1.5;
    walls.forEach(function (wall) {
      for (let y = wall[1]; y < wall[1] + wall[3]; y++) {
        for (let x = wall[0]; x < wall[0] + wall[2]; x++) {
          const left = x * tile + 1;
          const top = y * tile + 1;
          const size = tile - 3;
          previewCtx.beginPath();
          previewCtx.moveTo(left + 4, top);
          previewCtx.arcTo(left + size, top, left + size, top + size, 4);
          previewCtx.arcTo(left + size, top + size, left, top + size, 4);
          previewCtx.arcTo(left, top + size, left, top, 4);
          previewCtx.arcTo(left, top, left + size, top, 4);
          previewCtx.closePath();
          previewCtx.fill();
          previewCtx.stroke();
        }
      }
    });

    previewCtx.fillStyle = '#eaf6ff';
    for (let x = 1; x < cols - 1; x++) {
      if (x < 3 || (x > 6 && x < 12) || x > 16) {
        previewCtx.beginPath();
        previewCtx.arc(x * tile + tile / 2, 4 * tile + tile / 2, 2.2, 0, Math.PI * 2);
        previewCtx.fill();
      }
    }

    previewCtx.fillStyle = '#8fe9ff';
    previewCtx.beginPath();
    previewCtx.moveTo(17 * tile + tile / 2, 2 * tile + 4);
    previewCtx.lineTo(17 * tile + tile / 2 + 7, 2 * tile + tile / 2);
    previewCtx.lineTo(17 * tile + tile / 2, 3 * tile - 4);
    previewCtx.lineTo(17 * tile + tile / 2 - 7, 2 * tile + tile / 2);
    previewCtx.closePath();
    previewCtx.fill();

    previewCtx.fillStyle = '#ffd24d';
    previewCtx.beginPath();
    previewCtx.arc(7 * tile + tile / 2, 6 * tile + tile / 2, 4, 0, Math.PI * 2);
    previewCtx.fill();

    previewCtx.save();
    previewCtx.translate(penguinX, 7 * tile + tile / 2);
    previewCtx.fillStyle = '#172b3b';
    previewCtx.beginPath();
    previewCtx.ellipse(0, 0, 9, 11, 0, 0, Math.PI * 2);
    previewCtx.fill();
    previewCtx.fillStyle = '#f5fbff';
    previewCtx.beginPath();
    previewCtx.ellipse(2, 2, 5, 7, 0, 0, Math.PI * 2);
    previewCtx.fill();
    previewCtx.fillStyle = '#ff9800';
    previewCtx.beginPath();
    previewCtx.moveTo(7, -2);
    previewCtx.lineTo(14, 0);
    previewCtx.lineTo(7, 2);
    previewCtx.closePath();
    previewCtx.fill();
    previewCtx.restore();

    previewCtx.save();
    previewCtx.translate(fishX, 4 * tile + tile / 2 + Math.sin(elapsed * 3) * 3);
    previewCtx.fillStyle = '#ef687b';
    previewCtx.beginPath();
    previewCtx.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2);
    previewCtx.fill();
    previewCtx.beginPath();
    previewCtx.moveTo(-7, 0);
    previewCtx.lineTo(-13, -5);
    previewCtx.lineTo(-13, 5);
    previewCtx.closePath();
    previewCtx.fill();
    previewCtx.fillStyle = '#10202c';
    previewCtx.beginPath();
    previewCtx.arc(4, -1, 1.5, 0, Math.PI * 2);
    previewCtx.fill();
    previewCtx.restore();
  }

  // ---------------------------------------------------------------------
  // HUD + overlays
  // ---------------------------------------------------------------------
  function updateHUD() {
    hud.score.textContent = game.score;
    hud.level.textContent = game.level;
    hud.lives.textContent = game.lives;
    hud.high.textContent = game.highScore;
    hud.mode.textContent = game.mode === 'survival' ? 'SURVIVAL' : 'NORMAL';
    const modifierNames = {
      blizzard: 'BLIZZARD ' + (game.windDirection < 0 ? '<' : '>'),
      night: 'NIGHT RUN',
      frenzy: 'FISH FRENZY'
    };
    hud.modifier.textContent = modifierNames[game.currentModifier];
    shieldHud.textContent = game.shieldPoints + ' / ' + MAX_SHIELD_POINTS;
    goldenKrillHud.textContent = game.goldenKrill;
  }

  const overlayEl = document.getElementById('overlay');
  const pauseOverlayEl = document.getElementById('pause-overlay');
  const gameoverOverlayEl = document.getElementById('gameover-overlay');
  const levelOverlayEl = document.getElementById('level-overlay');
  const goScoreEl = document.getElementById('go-score');
  const goHighEl = document.getElementById('go-high');
  const levelMsgEl = document.getElementById('level-msg');
  const levelStarsEl = document.getElementById('level-stars');
  const levelBestStarsEl = document.getElementById('level-best-stars');
  const levelStarDetailsEl = document.getElementById('level-star-details');
  const shopOverlayEl = document.getElementById('shop-overlay');
  const shopBalanceEl = document.getElementById('shop-balance');
  const upgradeStorageKeys = {
    bellySlide: 'penguinFishUpgradeBellySlide',
    feathers: 'penguinFishUpgradeFeathers',
    freeze: 'penguinFishUpgradeFreeze',
    magnet: 'penguinFishUpgradeMagnet'
  };
  let shopReturnOverlay = 'overlay';

  function showOverlay(el) { el.classList.remove('hidden'); }
  function hideOverlay(el) { el.classList.add('hidden'); }

  function updateShop() {
    shopBalanceEl.textContent = game.goldenKrill;
    Object.keys(upgradeStorageKeys).forEach(function (upgrade) {
      const level = game.upgrades[upgrade];
      const maxed = level >= MAX_UPGRADE_LEVEL;
      const cost = upgradeCost(level);
      document.getElementById('upgrade-' + upgrade + '-level').textContent =
        'Level ' + level + ' / ' + MAX_UPGRADE_LEVEL;
      document.getElementById('upgrade-' + upgrade + '-cost').textContent =
        maxed ? 'MAX LEVEL' : cost + ' Golden Krill';
      const button = document.querySelector('[data-upgrade="' + upgrade + '"]');
      button.disabled = game.goldenKrill < cost || maxed;
      button.textContent = maxed ? 'MAXED' : 'BUY';
      const progress = document.querySelector('[data-upgrade-progress="' + upgrade + '"]');
      progress.setAttribute('aria-label', upgrade + ' upgrade level ' + level + ' of ' + MAX_UPGRADE_LEVEL);
      progress.querySelectorAll('span').forEach(function (segment, index) {
        segment.classList.toggle('filled', index < level);
      });
    });
  }

  function openShop(returnOverlay) {
    shopReturnOverlay = returnOverlay;
    hideOverlay(overlayEl);
    hideOverlay(pauseOverlayEl);
    updateShop();
    showOverlay(shopOverlayEl);
  }

  function closeShop() {
    hideOverlay(shopOverlayEl);
    showOverlay(shopReturnOverlay === 'pause' ? pauseOverlayEl : overlayEl);
  }

  function purchaseUpgrade(upgrade) {
    if (!Object.prototype.hasOwnProperty.call(upgradeStorageKeys, upgrade)) return;
    if (game.upgrades[upgrade] >= MAX_UPGRADE_LEVEL) return;
    const cost = upgradeCost(game.upgrades[upgrade]);
    if (game.goldenKrill < cost) return;

    game.goldenKrill -= cost;
    game.upgrades[upgrade]++;
    localStorage.setItem('penguinFishGoldenKrill', String(game.goldenKrill));
    localStorage.setItem(upgradeStorageKeys[upgrade], String(game.upgrades[upgrade]));
    updateHUD();
    updateShop();
  }

  function startGame(mode) {
    ensureAudio();
    game.mode = mode === 'survival' ? 'survival' : 'normal';
    game.score = 0;
    game.lives = 3;
    game.level = 1;
    game.frightenedTime = 0;
    game.shieldPoints = Math.min(
      MAX_SHIELD_POINTS,
      Math.ceil(game.upgrades.feathers * MAX_SHIELD_POINTS / MAX_UPGRADE_LEVEL)
    );
    game.dashDistanceRemaining = 0;
    game.dashCooldownRemaining = 0;
    lastLevelMapSignature = '';
    lastFishLayoutSignature = '';
    loadLevel();
    updateHUD();
    hideOverlay(overlayEl);
    hideOverlay(pauseOverlayEl);
    hideOverlay(gameoverOverlayEl);
    hideOverlay(levelOverlayEl);
    hideOverlay(shopOverlayEl);
    showOverlay(hudEl);
    canvas.focus();
    state = 'play';
  }

  function pauseGame() {
    if (state === 'play') {
      state = 'pause';
      showOverlay(pauseOverlayEl);
    } else if (state === 'pause') {
      resumeGame();
    }
  }

  function resumeGame() {
    hideOverlay(pauseOverlayEl);
    state = 'play';
  }

  function gameOver() {
    state = 'over';
    saveHighScore();
    goScoreEl.textContent = game.score;
    goHighEl.textContent = 'High Score: ' + game.highScore;
    showOverlay(gameoverOverlayEl);
  }

  function restartGame() { startGame(game.mode); }

  function quitToMenu() {
    state = 'menu';
    hideOverlay(hudEl);
    hideOverlay(pauseOverlayEl);
    hideOverlay(gameoverOverlayEl);
    showOverlay(overlayEl);
  }

  function saveHighScore() {
    if (game.score > game.highScore) {
      game.highScore = game.score;
      localStorage.setItem('penguinFishHigh', String(game.highScore));
      updateHUD();
    }
  }

  function showLevelOverlay(level, earnedStars, bestStars, speedRunEarned, perfectEarned) {
    levelMsgEl.textContent = 'LEVEL ' + level + ' CLEAR!';
    levelStarsEl.textContent = 'Stars earned: ' + '★'.repeat(earnedStars) + '☆'.repeat(3 - earnedStars);
    levelBestStarsEl.textContent = 'Best for this level: ' + '★'.repeat(bestStars) + '☆'.repeat(3 - bestStars);
    while (levelStarDetailsEl.firstChild) {
      levelStarDetailsEl.removeChild(levelStarDetailsEl.firstChild);
    }
    [
      'Clear the level',
      'Finish under ' + SPEED_RUN_LIMIT_SECONDS + ' seconds',
      'No hits and collect every krill'
    ].forEach(function (label, index) {
      const item = document.createElement('li');
      const earned = index === 0 || (index === 1 && speedRunEarned) ||
        (index === 2 && perfectEarned);
      item.textContent = (earned ? '★ ' : '☆ ') + label;
      if (earned) item.classList.add('star-earned');
      levelStarDetailsEl.appendChild(item);
    });
    showOverlay(levelOverlayEl);
  }

  function startNextLevel() {
    if (!game.pendingNextLevel) return;
    game.pendingNextLevel = false;
    game.level++;
    hideOverlay(levelOverlayEl);
    loadLevel();
    updateHUD();
    state = 'play';
    canvas.focus();
  }

  // ---------------------------------------------------------------------
  // Input handling
  // ---------------------------------------------------------------------
  const keyMap = {
    ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
    w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT',
    W: 'UP', S: 'DOWN', A: 'LEFT', D: 'RIGHT'
  };

  window.addEventListener('keydown', function (e) {
    ensureAudio();
    if (e.code === 'Space') {
      e.preventDefault();
      if (state === 'levelComplete') {
        startNextLevel();
        return;
      }
      if (state === 'play' && game.dashCooldownRemaining <= 0 &&
          game.dashDistanceRemaining <= 0 && penguin.dir) {
        game.dashDistanceRemaining = BASE_DASH_DISTANCE *
          (1 + game.upgrades.bellySlide * 0.15);
        game.dashCooldownRemaining = DASH_COOLDOWN;
      }
      if (state === 'menu' && shopOverlayEl.classList.contains('hidden')) startGame();
      return;
    }
    const dir = keyMap[e.key];
    if (dir) {
      e.preventDefault();
      // Only buffer a turn that is actually valid at the current tile.
      let targetX = penguin.gx, targetY = penguin.gy;
      if (penguin.dir && penguin.dir.dx !== 0) targetX += penguin.dir.dx;
      if (penguin.dir && penguin.dir.dy !== 0) targetY += penguin.dir.dy;
      const d = DIRS[dir];
      const ok = canPenguinEnter(targetX + d.dx, targetY + d.dy);
      if (ok) {
        penguin.nextDir = d;
        // If idle, adopt the buffered direction immediately so movement starts.
        if (!penguin.dir) penguin.dir = d;
      }
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      e.preventDefault();
      pauseGame();
    }

    // Any key on the menu starts the game.
    if (state === 'menu' && shopOverlayEl.classList.contains('hidden')) startGame();
  });

  document.getElementById('start-btn').addEventListener('click', function () { startGame('normal'); });
  document.getElementById('survival-btn').addEventListener('click', function () { startGame('survival'); });
  document.getElementById('resume-btn').addEventListener('click', resumeGame);
  document.getElementById('quit-btn').addEventListener('click', quitToMenu);
  document.getElementById('restart-btn').addEventListener('click', restartGame);
  document.getElementById('next-level-btn').addEventListener('click', startNextLevel);
  document.getElementById('menu-shop-btn').addEventListener('click', function () {
    openShop('overlay');
  });
  document.getElementById('pause-shop-btn').addEventListener('click', function () {
    openShop('pause');
  });
  document.getElementById('shop-back-btn').addEventListener('click', closeShop);
  document.querySelectorAll('.buy-upgrade').forEach(function (button) {
    button.addEventListener('click', function () {
      purchaseUpgrade(button.dataset.upgrade);
    });
  });

  // ---------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------
  let lastTime = 0;
  function loop(ts) {
    const dt = lastTime ? (ts - lastTime) / 1000 : 0;
    lastTime = ts;
    if (dt > 0 && dt < 0.1) update(dt);
    render();
    if (state === 'menu' && !overlayEl.classList.contains('hidden')) {
      drawMenuPreview(ts);
    }
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------
  loadLevel();
  updateHUD();
  showOverlay(overlayEl);
  requestAnimationFrame(loop);

})();
