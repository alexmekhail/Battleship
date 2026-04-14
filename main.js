/* ==========================================
   BATTLESHIP — main.js
   Pure vanilla JS · No frameworks
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {

// ==========================================
// === CONSTANTS ============================
// ==========================================

const GRID_ROWS             = 10;
const GRID_COLS             = 10;
const MAX_PLACE_ATTEMPTS    = 1000;
const COMPUTER_DELAY_MS     = 750;   // ms pause before computer fires
const NOTIFY_DURATION_MS    = 2500;  // ms sink notification stays visible

/**
 * Fleet definition — order determines placement sequence.
 * @type {Array<{name:string, size:number}>}
 */
const SHIP_CONFIGS = [
  { name: 'Carrier',    size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser',    size: 3 },
  { name: 'Submarine',  size: 3 },
  { name: 'Destroyer',  size: 2 },
];

// ==========================================
// === STATE ================================
// ==========================================

/** @type {'placement'|'playing'|'gameover'} */
let gameState = 'placement';

/** True when it is the human player's turn to fire. */
let isPlayerTurn = true;

/** Index into SHIP_CONFIGS for the currently selected dock ship, or null. */
let selectedShipIdx = null;

/** Global placement orientation shared by all dock ships. */
let placementOrientation = 'h';

/** Set of SHIP_CONFIGS indices that have been placed on the player grid. */
const placedShipIndices = new Set();

/**
 * @typedef {{
 *   name: string,
 *   size: number,
 *   r: number,
 *   c: number,
 *   orientation: 'h'|'v',
 *   cells: Array<{r:number,c:number}>,
 *   hits: Set<string>,
 *   sunk: boolean
 * }} Ship
 */

/** @type {Ship[]} */
let playerShips = [];

/** @type {Ship[]} */
let computerShips = [];

/** Cells the player has already fired on — "r,c" keys. @type {Set<string>} */
const playerGuesses = new Set();

/** Cells the computer has already fired on — "r,c" keys. @type {Set<string>} */
const computerGuesses = new Set();

// ==========================================
// === AI STATE =============================
// ==========================================

const ai = {
  /** @type {'hunt'|'target'} */
  phase:       'hunt',
  /** Cells queued to fire at in target phase. @type {Array<{r:number,c:number}>} */
  targetQueue: [],
  /** Hits recorded against the ship currently being targeted. @type {Array<{r:number,c:number}>} */
  currentHits: [],
  /** Locked firing axis once two consecutive hits are recorded. @type {null|'h'|'v'} */
  direction:   null,
  /** Shuffled checkerboard cells for hunt phase. @type {Array<{r:number,c:number}>} */
  huntCells:   [],
};

// ==========================================
// === UTILITIES ============================
// ==========================================

/**
 * Fisher-Yates shuffle — mutates and returns the array.
 * @param {Array} arr
 * @returns {Array}
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Convert zero-based (r, c) to Battleship notation, e.g. (0,0) → "A1".
 * @param {number} r
 * @param {number} c
 * @returns {string}
 */
function cellLabel(r, c) {
  return String.fromCharCode(65 + c) + (r + 1);
}

/**
 * Return every cell occupied by a ship given its anchor, size, and orientation.
 * @param {number} r
 * @param {number} c
 * @param {number} size
 * @param {'h'|'v'} orientation
 * @returns {Array<{r:number,c:number}>}
 */
function getShipCells(r, c, size, orientation) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    cells.push(orientation === 'h' ? { r, c: c + i } : { r: r + i, c });
  }
  return cells;
}

/**
 * Return true if placing a ship here is legal (in-bounds, no overlaps).
 * @param {number} r
 * @param {number} c
 * @param {number} size
 * @param {'h'|'v'} orientation
 * @param {Ship[]} existingShips
 * @returns {boolean}
 */
function isValidPlacement(r, c, size, orientation, existingShips) {
  if (r < 0 || c < 0) return false;
  if (orientation === 'h' && c + size > GRID_COLS) return false;
  if (orientation === 'v' && r + size > GRID_ROWS) return false;

  const proposed = getShipCells(r, c, size, orientation);
  for (const ship of existingShips) {
    for (const sc of ship.cells) {
      for (const nc of proposed) {
        if (sc.r === nc.r && sc.c === nc.c) return false;
      }
    }
  }
  return true;
}

/**
 * Validate a finished board and log warnings for any anomalies.
 * @param {Ship[]} ships
 * @param {string} owner  Label used in console messages.
 */
function validateBoard(ships, owner) {
  if (ships.length !== SHIP_CONFIGS.length) {
    console.warn(`[Battleship] ${owner}: expected ${SHIP_CONFIGS.length} ships, found ${ships.length}.`);
  }
  const seen = new Set();
  for (const ship of ships) {
    for (const { r, c } of ship.cells) {
      const key = `${r},${c}`;
      if (seen.has(key)) console.warn(`[Battleship] ${owner}: overlap at ${cellLabel(r, c)}.`);
      seen.add(key);
      if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) {
        console.warn(`[Battleship] ${owner}: out-of-bounds cell at ${cellLabel(r, c)}.`);
      }
    }
  }
}

// ==========================================
// === SHIP PLACEMENT =======================
// ==========================================

/**
 * Randomly place all ships for the computer.
 * Throws if placement cannot succeed within MAX_PLACE_ATTEMPTS per ship.
 * @returns {Ship[]}
 */
function placeComputerShips() {
  const ships = [];
  for (const config of SHIP_CONFIGS) {
    let placed   = false;
    let attempts = 0;
    while (!placed) {
      if (++attempts > MAX_PLACE_ATTEMPTS) {
        throw new Error(`Could not place ${config.name} after ${MAX_PLACE_ATTEMPTS} attempts.`);
      }
      const orientation = Math.random() < 0.5 ? 'h' : 'v';
      const maxR = orientation === 'v' ? GRID_ROWS - config.size : GRID_ROWS - 1;
      const maxC = orientation === 'h' ? GRID_COLS - config.size : GRID_COLS - 1;
      const r = Math.floor(Math.random() * (maxR + 1));
      const c = Math.floor(Math.random() * (maxC + 1));
      if (isValidPlacement(r, c, config.size, orientation, ships)) {
        ships.push({
          name:        config.name,
          size:        config.size,
          r, c, orientation,
          cells:       getShipCells(r, c, config.size, orientation),
          hits:        new Set(),
          sunk:        false,
        });
        placed = true;
      }
    }
  }
  validateBoard(ships, 'Computer');
  return ships;
}

// ==========================================
// === AI LOGIC =============================
// ==========================================

/** Initialise (or reset) the AI for a new game. */
function initAI() {
  // Build checkerboard cells — ships of size ≥2 always cover at least one even cell
  const cells = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if ((r + c) % 2 === 0) cells.push({ r, c });
    }
  }
  ai.phase       = 'hunt';
  ai.targetQueue = [];
  ai.currentHits = [];
  ai.direction   = null;
  ai.huntCells   = shuffle(cells);
}

/**
 * Return the next cell the AI will fire at.
 * Never returns an already-guessed cell.
 * @returns {{r:number,c:number}|null}
 */
function aiPickCell() {
  // --- Target phase ---
  if (ai.phase === 'target') {
    while (ai.targetQueue.length > 0) {
      const cell = ai.targetQueue.shift();
      if (!computerGuesses.has(`${cell.r},${cell.c}`)) return cell;
    }
    ai.phase = 'hunt'; // queue exhausted — fall through
  }

  // --- Hunt phase (checkerboard) ---
  while (ai.huntCells.length > 0) {
    const cell = ai.huntCells.pop();
    if (!computerGuesses.has(`${cell.r},${cell.c}`)) return cell;
  }

  // --- Ultimate fallback (covers the odd-parity squares) ---
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (!computerGuesses.has(`${r},${c}`)) return { r, c };
    }
  }
  return null; // board fully guessed — game should already be over
}

/**
 * Update AI targeting state after a confirmed hit.
 * @param {number} r
 * @param {number} c
 * @param {Ship|null} sunkShip — pass the ship object if it was sunk this shot.
 */
function aiOnHit(r, c, sunkShip) {
  ai.currentHits.push({ r, c });
  ai.phase = 'target';

  if (sunkShip) {
    // Purge the sunk ship's cells from the queue and reset targeting
    const sunkSet = new Set(sunkShip.cells.map(cell => `${cell.r},${cell.c}`));
    ai.targetQueue = ai.targetQueue.filter(cell => !sunkSet.has(`${cell.r},${cell.c}`));
    ai.currentHits = [];
    ai.direction   = null;
    if (ai.targetQueue.length === 0) ai.phase = 'hunt';
    return;
  }

  if (ai.currentHits.length === 1) {
    // First hit: fan out to all four orthogonal neighbours
    addNeighboursToQueue(r, c);
  } else {
    // Two or more hits: lock the axis and concentrate fire along it
    ai.direction = (ai.currentHits[0].r === r) ? 'h' : 'v';
    rebuildAxisQueue();
  }
}

/**
 * Update AI targeting state after a miss.
 * Prunes queue cells that lie beyond the miss in the locked direction.
 * @param {number} r
 * @param {number} c
 */
function aiOnMiss(r, c) {
  if (!ai.direction || ai.currentHits.length === 0) return;

  if (ai.direction === 'h') {
    const row  = ai.currentHits[0].r;
    const cols = ai.currentHits.map(h => h.c);
    const minC = Math.min(...cols), maxC = Math.max(...cols);
    if (c > maxC) ai.targetQueue = ai.targetQueue.filter(cell => !(cell.r === row && cell.c > maxC));
    if (c < minC) ai.targetQueue = ai.targetQueue.filter(cell => !(cell.r === row && cell.c < minC));
  } else {
    const col  = ai.currentHits[0].c;
    const rows = ai.currentHits.map(h => h.r);
    const minR = Math.min(...rows), maxR = Math.max(...rows);
    if (r > maxR) ai.targetQueue = ai.targetQueue.filter(cell => !(cell.c === col && cell.r > maxR));
    if (r < minR) ai.targetQueue = ai.targetQueue.filter(cell => !(cell.c === col && cell.r < minR));
  }
}

/**
 * Push valid, unguessed orthogonal neighbours of (r, c) onto the target queue.
 * @param {number} r
 * @param {number} c
 */
function addNeighboursToQueue(r, c) {
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS &&
        !computerGuesses.has(`${nr},${nc}`)) {
      ai.targetQueue.push({ r: nr, c: nc });
    }
  }
}

/**
 * Rebuild the target queue to extend in both directions along the locked axis,
 * stopping at board edges or previously guessed cells.
 */
function rebuildAxisQueue() {
  const queue = [];
  if (ai.direction === 'h') {
    const row  = ai.currentHits[0].r;
    const cols = ai.currentHits.map(h => h.c).sort((a, b) => a - b);
    const minC = cols[0], maxC = cols[cols.length - 1];
    for (let c = maxC + 1; c < GRID_COLS; c++) { if (computerGuesses.has(`${row},${c}`)) break; queue.push({ r: row, c }); }
    for (let c = minC - 1; c >= 0;          c--) { if (computerGuesses.has(`${row},${c}`)) break; queue.push({ r: row, c }); }
  } else {
    const col  = ai.currentHits[0].c;
    const rows = ai.currentHits.map(h => h.r).sort((a, b) => a - b);
    const minR = rows[0], maxR = rows[rows.length - 1];
    for (let r = maxR + 1; r < GRID_ROWS; r++) { if (computerGuesses.has(`${r},${col}`)) break; queue.push({ r, c: col }); }
    for (let r = minR - 1; r >= 0;         r--) { if (computerGuesses.has(`${r},${col}`)) break; queue.push({ r, c: col }); }
  }
  ai.targetQueue = queue;
}

// ==========================================
// === RENDERING ============================
// ==========================================

/**
 * Construct the labelled grid DOM and inject it into containerId.
 * @param {string} containerId
 * @param {boolean} isPlayer
 */
function buildGrid(containerId, isPlayer) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'grid-wrapper';

  // Column labels
  const colLabels = document.createElement('div');
  colLabels.className = 'col-labels';
  const corner = document.createElement('div');
  corner.className = 'label-cell';
  colLabels.appendChild(corner);
  for (let c = 0; c < GRID_COLS; c++) {
    const lbl = document.createElement('div');
    lbl.className   = 'label-cell';
    lbl.textContent = String.fromCharCode(65 + c);
    colLabels.appendChild(lbl);
  }
  wrapper.appendChild(colLabels);

  // Grid body
  const gridBody = document.createElement('div');
  gridBody.className = 'grid-body';

  // Row labels
  const rowLabels = document.createElement('div');
  rowLabels.className = 'row-labels';
  for (let r = 0; r < GRID_ROWS; r++) {
    const lbl = document.createElement('div');
    lbl.className   = 'label-cell';
    lbl.textContent = r + 1;
    rowLabels.appendChild(lbl);
  }
  gridBody.appendChild(rowLabels);

  // Grid cells
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.id        = isPlayer ? 'player-grid' : 'computer-grid';

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = document.createElement('div');
      cell.className  = 'cell';
      cell.dataset.r  = r;
      cell.dataset.c  = c;
      if (isPlayer) {
        cell.addEventListener('click',      onPlayerCellClick);
        cell.addEventListener('mouseenter', onPlayerCellEnter);
        cell.addEventListener('mouseleave', onPlayerCellLeave);
      } else {
        cell.addEventListener('click', onComputerCellClick);
      }
      grid.appendChild(cell);
    }
  }

  gridBody.appendChild(grid);
  wrapper.appendChild(gridBody);
  container.appendChild(wrapper);
}

/**
 * Return the DOM element for a specific grid cell.
 * @param {boolean} isPlayer
 * @param {number} r
 * @param {number} c
 * @returns {HTMLElement|null}
 */
function getCellEl(isPlayer, r, c) {
  const id = isPlayer ? 'player-grid' : 'computer-grid';
  return document.querySelector(`#${id} [data-r="${r}"][data-c="${c}"]`);
}

/** Colour all placed player ship cells on the player grid. */
function renderPlayerShips() {
  for (const ship of playerShips) {
    for (const { r, c } of ship.cells) {
      const el = getCellEl(true, r, c);
      if (el) el.classList.add('ship');
    }
  }
}

/**
 * Apply a hit or miss marker to a cell.
 * @param {boolean} isPlayer
 * @param {number} r
 * @param {number} c
 * @param {boolean} hit
 */
function renderShot(isPlayer, r, c, hit) {
  const el = getCellEl(isPlayer, r, c);
  if (!el) return;
  // Remove any stale classes then animate via CSS
  el.classList.remove('preview-valid', 'preview-invalid', 'ship');
  el.classList.add(hit ? 'hit' : 'miss');
  el.textContent = hit ? '🔥' : '●';
}

/**
 * Mark every cell of a sunk ship with the skull marker.
 * @param {boolean} isPlayer
 * @param {Ship} ship
 */
function renderSunkShip(isPlayer, ship) {
  for (const { r, c } of ship.cells) {
    const el = getCellEl(isPlayer, r, c);
    if (el) { el.classList.remove('hit'); el.classList.add('sunk'); el.textContent = '💀'; }
  }
}

/**
 * Re-render the ship legend for one side.
 * @param {boolean} isPlayer
 * @param {Ship[]} ships
 */
function renderLegend(isPlayer, ships) {
  const el = document.getElementById(isPlayer ? 'player-legend' : 'computer-legend');
  el.innerHTML = '';
  for (const ship of ships) {
    const item = document.createElement('div');
    item.className = 'legend-item' + (ship.sunk ? ' sunk' : '');

    const barWrap = document.createElement('div');
    barWrap.className = 'legend-bar-wrap';
    for (let i = 0; i < ship.size; i++) {
      const seg = document.createElement('div');
      seg.className = 'legend-seg';
      barWrap.appendChild(seg);
    }

    const name = document.createElement('span');
    name.textContent = ship.name;

    item.appendChild(barWrap);
    item.appendChild(name);
    el.appendChild(item);
  }
}

/** Build the dock of draggable/clickable ships for the placement panel. */
function buildShipDock() {
  const dock = document.getElementById('ship-dock');
  dock.innerHTML = '';
  SHIP_CONFIGS.forEach((config, idx) => {
    const shipEl   = document.createElement('div');
    shipEl.className = 'dock-ship';
    shipEl.id        = `dock-ship-${idx}`;
    shipEl.setAttribute('role', 'button');
    shipEl.setAttribute('tabindex', '0');
    shipEl.setAttribute('aria-label', `${config.name}, size ${config.size}`);

    const bar = document.createElement('div');
    bar.className = 'dock-ship-bar';
    for (let i = 0; i < config.size; i++) {
      const seg = document.createElement('div');
      seg.className = 'dock-ship-seg';
      bar.appendChild(seg);
    }

    const label = document.createElement('div');
    label.className   = 'dock-ship-name';
    label.textContent = config.name;

    shipEl.appendChild(bar);
    shipEl.appendChild(label);
    shipEl.addEventListener('click',   () => selectShip(idx));
    shipEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') selectShip(idx); });
    dock.appendChild(shipEl);
  });
}

/**
 * Update the status banner.
 * @param {string} text
 * @param {'placement-phase'|'player-turn'|'computer-turn'|'game-over'} cls
 */
function setStatus(text, cls) {
  const el = document.getElementById('status-banner');
  el.textContent = text;
  el.className   = 'status-banner ' + cls;
}

/**
 * Show a temporary toast notification.
 * @param {string} message
 * @param {number} [duration]
 */
let _notifyTimer = null;
function showNotification(message, duration = NOTIFY_DURATION_MS) {
  const el = document.getElementById('notification');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(_notifyTimer);
  _notifyTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

/**
 * Prepend a line to the battle log (newest-first).
 * @param {string} text
 * @param {string} cssClass  One of the log-entry variant classes.
 */
function addLogEntry(text, cssClass) {
  const log   = document.getElementById('shot-log');
  const entry = document.createElement('div');
  entry.className   = 'log-entry ' + cssClass;
  entry.textContent = text;
  log.prepend(entry);
}

// ==========================================
// === PLACEMENT HANDLERS ===================
// ==========================================

/**
 * Select a ship from the dock to place.
 * @param {number} idx
 */
function selectShip(idx) {
  if (placedShipIndices.has(idx)) return;
  selectedShipIdx = idx;
  document.querySelectorAll('.dock-ship').forEach(el => el.classList.remove('selected'));
  document.getElementById(`dock-ship-${idx}`).classList.add('selected');
}

/** Toggle placement orientation between horizontal and vertical. */
function rotateShip() {
  placementOrientation = placementOrientation === 'h' ? 'v' : 'h';
  const label = placementOrientation === 'h' ? 'Horizontal' : 'Vertical';
  document.getElementById('btn-rotate').textContent = `↻ ${label} (R)`;

  // Reflect orientation on all dock ship bars
  document.querySelectorAll('.dock-ship-bar').forEach(bar => {
    bar.classList.toggle('vertical', placementOrientation === 'v');
  });
  clearPreview();
}

/** Remove all placement-preview classes from the player grid. */
function clearPreview() {
  document.querySelectorAll('#player-grid .preview-valid, #player-grid .preview-invalid')
          .forEach(el => el.classList.remove('preview-valid', 'preview-invalid'));
}

/**
 * Highlight cells on the player grid showing where a ship would land.
 * @param {number} r  Anchor row (top-left)
 * @param {number} c  Anchor col (top-left)
 */
function showPlacementPreview(r, c) {
  if (selectedShipIdx === null) return;
  const { size } = SHIP_CONFIGS[selectedShipIdx];
  const valid    = isValidPlacement(r, c, size, placementOrientation, playerShips);
  const cells    = getShipCells(r, c, size, placementOrientation);
  for (const { r: cr, c: cc } of cells) {
    if (cr >= 0 && cr < GRID_ROWS && cc >= 0 && cc < GRID_COLS) {
      const el = getCellEl(true, cr, cc);
      if (el) el.classList.add(valid ? 'preview-valid' : 'preview-invalid');
    }
  }
}

function onPlayerCellClick(e) {
  if (gameState !== 'placement' || selectedShipIdx === null) return;
  const r      = +e.currentTarget.dataset.r;
  const c      = +e.currentTarget.dataset.c;
  const config = SHIP_CONFIGS[selectedShipIdx];

  if (!isValidPlacement(r, c, config.size, placementOrientation, playerShips)) {
    showPlacementPreview(r, c); // show red so player sees why it failed
    return;
  }

  // Commit the ship
  const cells = getShipCells(r, c, config.size, placementOrientation);
  playerShips.push({
    name: config.name, size: config.size,
    r, c, orientation: placementOrientation,
    cells, hits: new Set(), sunk: false,
  });
  placedShipIndices.add(selectedShipIdx);
  document.getElementById(`dock-ship-${selectedShipIdx}`).classList.add('placed');
  selectedShipIdx = null;
  clearPreview();
  renderPlayerShips();

  if (placedShipIndices.size === SHIP_CONFIGS.length) {
    setStatus('All ships placed! Press Start Game ⚔️', 'placement-phase');
    document.getElementById('btn-start').focus();
  }
}

function onPlayerCellEnter(e) {
  if (gameState !== 'placement' || selectedShipIdx === null) return;
  clearPreview();
  showPlacementPreview(+e.currentTarget.dataset.r, +e.currentTarget.dataset.c);
}

function onPlayerCellLeave() {
  if (gameState === 'placement') clearPreview();
}

// ==========================================
// === GAME LOOP ============================
// ==========================================

/**
 * Handle a click on the enemy grid — player fires a shot.
 * @param {MouseEvent} e
 */
function onComputerCellClick(e) {
  if (gameState !== 'playing' || !isPlayerTurn) return;

  const r   = +e.currentTarget.dataset.r;
  const c   = +e.currentTarget.dataset.c;
  const key = `${r},${c}`;

  if (playerGuesses.has(key)) return; // already fired — do nothing (cursor shows not-allowed)

  playerGuesses.add(key);

  const hitShip = computerShips.find(ship => ship.cells.some(cell => cell.r === r && cell.c === c));
  if (hitShip) {
    hitShip.hits.add(key);
    const sunk = hitShip.hits.size === hitShip.size;
    if (sunk) hitShip.sunk = true;

    renderShot(false, r, c, true);

    if (sunk) {
      renderSunkShip(false, hitShip);
      showNotification(`💥 You sunk the enemy's ${hitShip.name}!`);
      addLogEntry(`  ↳ Enemy ${hitShip.name} sunk! 💀`, 'sunk-msg');
    }
    addLogEntry(`You: ${cellLabel(r, c)} — Hit! 🔥`, sunk ? 'sunk-msg' : 'player-hit');
    renderLegend(false, computerShips);
  } else {
    renderShot(false, r, c, false);
    addLogEntry(`You: ${cellLabel(r, c)} — Miss`, 'player-miss');
  }

  if (computerShips.every(s => s.sunk)) { endGame(true); return; }

  // Hand off to computer
  isPlayerTurn = false;
  setStatus("Computer's Turn…", 'computer-turn');
  setComputerGridEnabled(false);
  setTimeout(doComputerTurn, COMPUTER_DELAY_MS);
}

/** Execute one computer turn. */
function doComputerTurn() {
  const cell = aiPickCell();
  if (!cell) { endGame(false); return; } // board exhausted — shouldn't happen

  const { r, c } = cell;
  const key       = `${r},${c}`;
  computerGuesses.add(key);

  const hitShip = playerShips.find(ship => ship.cells.some(sc => sc.r === r && sc.c === c));
  if (hitShip) {
    hitShip.hits.add(key);
    const sunk = hitShip.hits.size === hitShip.size;
    if (sunk) hitShip.sunk = true;

    renderShot(true, r, c, true);
    aiOnHit(r, c, sunk ? hitShip : null);

    if (sunk) {
      renderSunkShip(true, hitShip);
      showNotification(`💥 Computer sunk your ${hitShip.name}!`);
      addLogEntry(`  ↳ Your ${hitShip.name} sunk! 💀`, 'sunk-msg');
    }
    addLogEntry(`Computer: ${cellLabel(r, c)} — Hit! 🔥`, sunk ? 'sunk-msg' : 'comp-hit');
    renderLegend(true, playerShips);
  } else {
    renderShot(true, r, c, false);
    addLogEntry(`Computer: ${cellLabel(r, c)} — Miss`, 'comp-miss');
    aiOnMiss(r, c);
  }

  if (playerShips.every(s => s.sunk)) { endGame(false); return; }

  // Return turn to player
  isPlayerTurn = true;
  setStatus('Your Turn — Fire!', 'player-turn');
  setComputerGridEnabled(true);
}

/**
 * Enable or disable the enemy grid for player interaction.
 * @param {boolean} enabled
 */
function setComputerGridEnabled(enabled) {
  const grid = document.getElementById('computer-grid');
  if (grid) grid.classList.toggle('disabled', !enabled);
}

/**
 * Show the game-over overlay and freeze the game.
 * @param {boolean} playerWon
 */
function endGame(playerWon) {
  gameState = 'gameover';
  setComputerGridEnabled(false);

  document.getElementById('game-over-icon').textContent  = playerWon ? '🏆' : '💀';
  document.getElementById('game-over-title').textContent = playerWon ? 'Victory!' : 'Defeated!';
  document.getElementById('game-over-msg').textContent   = playerWon
    ? 'All enemy ships have been sunk. Admiral!'
    : 'Your fleet has been destroyed. Better luck next time.';
  document.getElementById('game-over-overlay').classList.remove('hidden');
  setStatus(playerWon ? '🏆 You Win!' : '💀 You Lose!', 'game-over');
}

// ==========================================
// === LIFECYCLE ============================
// ==========================================

/** Called when the player clicks "Start Game". */
function startGame() {
  if (gameState !== 'placement') return;

  if (placedShipIndices.size < SHIP_CONFIGS.length) {
    showNotification(`Place all ${SHIP_CONFIGS.length} ships first!`, 2200);
    return;
  }

  validateBoard(playerShips, 'Player');

  try {
    computerShips = placeComputerShips();
  } catch (err) {
    console.error(err);
    showNotification('Error setting up computer fleet — please restart.', 3000);
    return;
  }

  initAI();

  gameState    = 'playing';
  isPlayerTurn = true;

  // Hide placement UI
  document.getElementById('placement-panel').style.display = 'none';
  document.getElementById('btn-rotate').style.display      = 'none';
  document.getElementById('btn-start').style.display       = 'none';

  renderLegend(true,  playerShips);
  renderLegend(false, computerShips);
  setStatus('Your Turn — Fire!', 'player-turn');
  setComputerGridEnabled(true);
}

/** Full reset — reload the page to clear all state cleanly. */
function restartGame() {
  window.location.reload();
}

// ==========================================
// === INITIALISE ===========================
// ==========================================

function init() {
  buildGrid('player-grid-container',   true);
  buildGrid('computer-grid-container', false);
  buildShipDock();

  setComputerGridEnabled(false); // enemy grid locked until game starts
  setStatus('Place your ships to begin', 'placement-phase');

  // Keyboard shortcut: R → rotate
  document.addEventListener('keydown', e => {
    if ((e.key === 'r' || e.key === 'R') && gameState === 'placement') rotateShip();
  });
}

init();

// Expose to HTML onclick attributes
window.startGame   = startGame;
window.restartGame = restartGame;
window.rotateShip  = rotateShip;

}); // end DOMContentLoaded
