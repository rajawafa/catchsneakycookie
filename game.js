(() => {
  "use strict";

  const ROUND_SECONDS = 60;
  // Leave blank to keep the in-game cookie shelf. Add a verified shop URL later to make the result CTA external.
  const COOKIE_SHOP_URL = "";

  const CATS = [
    { id: "tam", name: "Tam", label: "black cat", source: "assets/cats/tam.png", spriteX: "0%", spriteY: "0%" },
    { id: "abu", name: "Abu", label: "brown patch", source: "assets/cats/abu.png", spriteX: "100%", spriteY: "0%" },
    { id: "comot", name: "Comot", label: "calico", source: "assets/cats/comot.png", spriteX: "0%", spriteY: "50%" },
    { id: "oyen", name: "Oyen", label: "orange tabby", source: "assets/cats/oyen.png", spriteX: "100%", spriteY: "50%" },
    { id: "tompok", name: "Tompok", label: "tuxedo", source: "assets/cats/tompok.png", spriteX: "0%", spriteY: "100%" },
    { id: "miko", name: "Miko", label: "green & white", source: "assets/cats/miko.png", spriteX: "100%", spriteY: "100%" }
  ];

  const CLASSIC_COOKIES = [
    "assets/cookies/transparent/cookie-1-uniform.png",
    "assets/cookies/transparent/cookie-2-uniform.png",
    "assets/cookies/transparent/cookie-3-uniform.png",
    "assets/cookies/transparent/cookie-4-uniform.png",
    "assets/cookies/transparent/cookie-5-uniform.png"
  ];

  const HAZARD_ASSETS = {
    fishbone: "assets/hazards/fishbone.png",
    shoe: "assets/hazards/shoe.png",
    bomb: "assets/hazards/bomb.png"
  };

  const screens = Object.fromEntries([...document.querySelectorAll(".screen")].map((screen) => [screen.id.replace("-screen", ""), screen]));
  const catGrid = document.querySelector("#cat-grid");
  const playButton = document.querySelector("#play-button");
  const gameStage = document.querySelector("#game-stage");
  const gameCat = document.querySelector("#game-cat-image");
  const catCatcher = document.querySelector("#cat-catcher");
  const resultCat = document.querySelector("#result-cat-image");
  const resultCatWrap = document.querySelector("#result-cat-wrap");
  const itemsLayer = document.querySelector("#items-layer");
  const floatLayer = document.querySelector("#float-layer");
  const countdown = document.querySelector("#countdown");
  const dragHint = document.querySelector("#drag-hint");
  const scoreDisplay = document.querySelector("#score-display");
  const livesDisplay = document.querySelector("#lives-display");
  const timeDisplay = document.querySelector("#time-display");
  const resultTitle = document.querySelector("#result-title");
  const resultEyebrow = document.querySelector("#result-eyebrow");
  const resultCopy = document.querySelector("#result-copy");
  const resultScore = document.querySelector("#result-score");
  const soundButtons = [...document.querySelectorAll("[data-sound-toggle]")];

  const game = {
    selected: CATS[0],
    screen: "select",
    running: false,
    ending: false,
    token: 0,
    rafId: 0,
    lastFrame: 0,
    startedAt: 0,
    spawnClock: 0,
    items: [],
    catX: 50,
    lives: 3,
    score: 0,
    cookiesCaught: 0,
    hurtUntil: 0,
    lastHazard: -9999,
    pointerId: null,
    soundOn: readStoredSound()
  };

  let audioContext;
  let musicTimer;
  let musicStep = 0;

  function readStoredSound() {
    try {
      return localStorage.getItem("sneaky-cat-sound") === "on";
    } catch {
      return false;
    }
  }

  function rememberSound() {
    try {
      localStorage.setItem("sneaky-cat-sound", game.soundOn ? "on" : "off");
    } catch {
      // Local preference is optional; the current-session setting still works.
    }
  }

  function currentCat() {
    return CATS.find((cat) => cat.id === game.selected.id) || CATS[0];
  }

  function paintPixelCat(element, cat) {
    // Eye anchors are measured within each sprite-sheet cell.
    const eyes = {
      tam: [58, 48, 80, 44], abu: [50, 49, 72, 45],
      comot: [57, 44, 79, 41], oyen: [50, 46, 71, 42],
      tompok: [57, 37, 79, 34], miko: [50, 39, 72, 36]
    }[cat.id];
    ["--eye-left-x", "--eye-left-y", "--eye-right-x", "--eye-right-y"].forEach((key, index) => {
      element.style.setProperty(key, `${eyes[index]}%`);
    });
    element.style.setProperty("--sprite-x", cat.spriteX);
    element.style.setProperty("--sprite-y", cat.spriteY);
    element.setAttribute("aria-label", cat.name);
  }

  function syncCatArt() {
    const cat = currentCat();
    paintPixelCat(gameCat, cat);
    paintPixelCat(resultCat, cat);
    playButton.textContent = "START!!!";
  }

  function renderCatGrid() {
    catGrid.innerHTML = "";
    CATS.forEach((cat) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `cat-card${cat.id === game.selected.id ? " is-selected" : ""}`;
      card.setAttribute("aria-label", cat.name);
      card.setAttribute("aria-pressed", String(cat.id === game.selected.id));
      card.innerHTML = `
        <span class="cat-card__art pixel-cat" aria-hidden="true" style="--sprite-x:${cat.spriteX};--sprite-y:${cat.spriteY}"></span>
        <span class="cat-card__name">${cat.name}</span>
      `;
      card.addEventListener("click", () => {
        game.selected = cat;
        syncCatArt();
        renderCatGrid();
        playSound("select");
      });
      catGrid.append(card);
    });
  }

  function showScreen(name) {
    Object.entries(screens).forEach(([screenName, element]) => {
      const active = screenName === name;
      element.hidden = !active;
      element.classList.toggle("screen--active", active);
    });
    game.screen = name;
    document.body.classList.toggle("is-playing-screen", name === "game");
    if (name !== "game") stopMusic();
  }

  function goTo(name) {
    if (name === "select") {
      stopRound();
      renderCatGrid();
    }
    if (name === "cookies") stopRound();
    if (name === "result" && game.screen !== "result") stopRound();
    if (name === "cookies" && COOKIE_SHOP_URL) {
      window.open(COOKIE_SHOP_URL, "_blank", "noopener,noreferrer");
      return;
    }
    playSound("click");
    showScreen(name);
  }

  function resetRound() {
    game.token += 1;
    game.running = false;
    game.ending = false;
    game.lastFrame = 0;
    game.spawnClock = .48;
    game.items.forEach((item) => item.el.remove());
    game.items = [];
    game.lives = 3;
    game.score = 0;
    game.cookiesCaught = 0;
    game.catX = 50;
    game.hurtUntil = 0;
    game.lastHazard = -9999;
    catCatcher.style.left = "50%";
    catCatcher.classList.remove("facing-left", "is-eating", "is-hurt");
    itemsLayer.replaceChildren();
    floatLayer.replaceChildren();
    dragHint.classList.remove("is-hidden");
    updateHud(ROUND_SECONDS);
  }

  function startRound() {
    resetRound();
    showScreen("game");
    playSound("click");
    const token = game.token;
    runCountdown(token);
  }

  async function runCountdown(token) {
    const steps = ["3", "2", "1", "GO!"];
    for (const step of steps) {
      if (token !== game.token) return;
      countdown.textContent = step;
      countdown.classList.toggle("is-go", step === "GO!");
      countdown.classList.add("is-visible");
      await delay(step === "GO!" ? 430 : 560);
    }
    if (token !== game.token) return;
    countdown.classList.remove("is-visible", "is-go");
    game.running = true;
    game.startedAt = performance.now();
    game.lastFrame = game.startedAt;
    startMusic();
    game.rafId = requestAnimationFrame(tick);
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function stopRound() {
    game.token += 1;
    game.running = false;
    game.ending = false;
    if (game.rafId) cancelAnimationFrame(game.rafId);
    game.rafId = 0;
    countdown.classList.remove("is-visible", "is-go");
    stopMusic();
  }

  function tick(now) {
    if (!game.running) return;
    const delta = Math.min(.05, (now - game.lastFrame) / 1000 || 0);
    game.lastFrame = now;
    const elapsed = (now - game.startedAt) / 1000;
    const remaining = Math.max(0, ROUND_SECONDS - elapsed);
    updateHud(remaining);

    if (remaining <= 0) {
      endRound("timeup");
      return;
    }

    updateSpawning(delta, elapsed);
    updateItems(delta, now);
    game.rafId = requestAnimationFrame(tick);
  }

  function difficultyBand(elapsed) {
    return Math.min(3, Math.floor(elapsed / 15));
  }

  function updateSpawning(delta, elapsed) {
    const band = difficultyBand(elapsed);
    const spawnEvery = [.94, .78, .64, .53][band];
    game.spawnClock += delta;
    const cap = [3, 4, 5, 6][band];
    if (game.spawnClock < spawnEvery || game.items.length >= cap) return;
    game.spawnClock -= spawnEvery;
    spawnItem(band, elapsed);
  }

  function spawnItem(band, elapsed) {
    const bounds = gameStage.getBoundingClientRect();
    const width = bounds.width;
    const height = bounds.height;
    const size = Math.round(Math.min(width * .28, 112));
    let type = chooseItemType(band, elapsed);
    let x = size / 2 + 10 + Math.random() * Math.max(1, width - size - 20);

    // Do not create a wall of bad items near each other while the player has little time to react.
    const nearbyHazard = game.items.some((item) => item.hazard && item.y < height * .42 && Math.abs(item.x - x) < size * 1.65);
    if (type.hazard && nearbyHazard) type = { kind: "classic", value: 5, hazard: false };

    const el = document.createElement("div");
    el.className = `falling-item falling-item--${type.kind}${type.hazard ? " falling-item--hazard" : ""}${type.kind === "bomb" ? " falling-item--bomb" : ""}`;
    el.style.setProperty("--item-size", `${size}px`);
    el.style.left = `${x}px`;
    el.style.top = "96px";
    if (type.kind === "classic") {
      const image = CLASSIC_COOKIES[Math.floor(Math.random() * CLASSIC_COOKIES.length)];
      el.innerHTML = `<img src="${image}" alt="" />`;
    } else if (type.kind === "sneaky") {
      el.innerHTML = `<img src="${CLASSIC_COOKIES[0]}" alt="" />`;
      el.setAttribute("aria-label", "Sneaky Drop plus 10 points");
    } else if (type.kind === "fishbone" || type.kind === "shoe" || type.kind === "bomb") {
      el.innerHTML = `<img class="hazard-sprite" src="${HAZARD_ASSETS[type.kind]}" alt="" />`;
    }
    itemsLayer.append(el);

    const baseSpeed = height * [.205, .26, .32, .39][band];
    game.items.push({
      el,
      kind: type.kind,
      value: type.value,
      hazard: type.hazard,
      x,
      y: 96 - size / 2,
      size,
      speed: baseSpeed * (.88 + Math.random() * .23)
    });
  }

  function chooseItemType(band, elapsed) {
    const roll = Math.random();
    const hazardChance = [.20, .28, .36, .44][band];
    const specialChance = .12;
    const enoughGapSinceHazard = elapsed - game.lastHazard > [2.2, 1.8, 1.5, 1.2][band];

    if (roll < hazardChance && enoughGapSinceHazard) {
      game.lastHazard = elapsed;
      const hazardRoll = Math.random();
      if (band > 0 && hazardRoll < .25 + band * .07) return { kind: "bomb", value: -2, hazard: true };
      return hazardRoll < .55 ? { kind: "fishbone", value: -1, hazard: true } : { kind: "shoe", value: -1, hazard: true };
    }
    if (roll < hazardChance + specialChance) return { kind: "sneaky", value: 10, hazard: false };
    return { kind: "classic", value: 5, hazard: false };
  }

  function updateItems(delta, now) {
    const stageHeight = gameStage.clientHeight;
    for (let index = game.items.length - 1; index >= 0; index -= 1) {
      const item = game.items[index];
      item.y += item.speed * delta;
      item.el.style.top = `${item.y}px`;

      if (item.y - item.size / 2 > stageHeight + 25) {
        removeItem(index);
        continue;
      }
      if (now >= game.hurtUntil && isAtMouth(item)) {
        catchItem(item, index, now);
      }
    }
  }

  function isAtMouth(item) {
    const catCenter = gameStage.clientWidth * game.catX / 100;
    const mouthY = catCatcher.offsetTop + 70;
    const horizontalReach = 43 + item.size * .43;
    return Math.abs(item.x - catCenter) <= horizontalReach && item.y + item.size / 2 >= mouthY - 18 && item.y - item.size / 2 <= mouthY + 25;
  }

  function catchItem(item, index, now) {
    const x = item.x;
    const y = Math.min(item.y, gameStage.clientHeight - 110);
    removeItem(index);
    if (!item.hazard) {
      game.score += item.value;
      game.cookiesCaught += 1;
      animateCat("is-eating", 330);
      makeFloat(`+${item.value}`, x, y);
      playSound(item.kind === "sneaky" ? "special" : "catch");
    } else {
      game.lives = Math.max(0, game.lives + item.value);
      game.hurtUntil = now + 780;
      animateCat("is-hurt", 780);
      makeFloat(`${item.value} ♥`, x, y, true);
      playSound(item.kind === "bomb" ? "bomb" : "hurt");
    }
    updateHud(Math.max(0, ROUND_SECONDS - (now - game.startedAt) / 1000));
    if (game.lives <= 0) {
      endRound("gameover");
    }
  }

  function removeItem(index) {
    const [item] = game.items.splice(index, 1);
    if (item) item.el.remove();
  }

  function animateCat(className, duration) {
    catCatcher.classList.remove("is-eating", "is-hurt");
    // Reflow once so repeated catches retrigger the short animation.
    void catCatcher.offsetWidth;
    catCatcher.classList.add(className);
    window.setTimeout(() => catCatcher.classList.remove(className), duration);
  }

  function makeFloat(text, x, y, bad = false) {
    const floating = document.createElement("span");
    floating.className = `float-score${bad ? " float-score--bad" : ""}`;
    floating.textContent = text;
    floating.style.left = `${x}px`;
    floating.style.top = `${y}px`;
    floating.addEventListener("animationend", () => floating.remove(), { once: true });
    floatLayer.append(floating);
  }

  function updateHud(remaining) {
    const hearts = "♥ ".repeat(game.lives).trim();
    livesDisplay.textContent = hearts || "—";
    scoreDisplay.textContent = String(game.score).padStart(3, "0");
    timeDisplay.textContent = String(Math.ceil(remaining));
  }

  function endRound(reason) {
    if (game.ending) return;
    game.ending = true;
    game.running = false;
    if (game.rafId) cancelAnimationFrame(game.rafId);
    game.rafId = 0;
    stopMusic();
    game.items.forEach((item) => item.el.remove());
    game.items = [];
    const cat = currentCat();
    const gameOver = reason === "gameover";
    resultCatWrap.classList.toggle("is-dramatic", gameOver);
    resultEyebrow.textContent = gameOver ? "OH NO" : "ROUND COMPLETE";
    resultTitle.textContent = gameOver ? "GAME OVER!" : "TIME'S UP!";
    resultCopy.textContent = gameOver
      ? `${cat.name} ate one suspicious thing too many. The drama is real.`
      : `You fed ${cat.name} ${game.cookiesCaught} ${game.cookiesCaught === 1 ? "cookie" : "cookies"}.`;
    resultScore.textContent = String(game.score).padStart(3, "0");
    if (gameOver) playSound("gameover"); else playSound("timeup");
    showScreen("result");
  }

  function moveCatTo(clientX) {
    if (!game.running) return;
    const rect = gameStage.getBoundingClientRect();
    const next = clamp((clientX - rect.left) / rect.width * 100, 16, 84);
    const change = next - game.catX;
    if (Math.abs(change) > .65) catCatcher.classList.toggle("facing-left", change < 0);
    game.catX = next;
    catCatcher.style.left = `${next}%`;
    dragHint.classList.add("is-hidden");
  }

  function moveCatBy(percent) {
    const rect = gameStage.getBoundingClientRect();
    moveCatTo(rect.left + rect.width * (game.catX + percent) / 100);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function installControls() {
    gameStage.addEventListener("pointerdown", (event) => {
      if (!game.running) return;
      game.pointerId = event.pointerId;
      gameStage.setPointerCapture?.(event.pointerId);
      moveCatTo(event.clientX);
    });
    gameStage.addEventListener("pointermove", (event) => {
      if (game.pointerId === event.pointerId) moveCatTo(event.clientX);
    });
    const releasePointer = (event) => {
      if (game.pointerId === event.pointerId) game.pointerId = null;
    };
    gameStage.addEventListener("pointerup", releasePointer);
    gameStage.addEventListener("pointercancel", releasePointer);

    window.addEventListener("keydown", (event) => {
      if (!game.running) return;
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        event.preventDefault();
        moveCatBy(-5.2);
      }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        event.preventDefault();
        moveCatBy(5.2);
      }
    });
  }

  function ensureAudio() {
    if (!game.soundOn) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  }

  function beep(frequency, duration, type = "sine", volume = .045, delay = 0) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const startAt = ctx.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, startAt + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + .03);
  }

  function playSound(name) {
    if (!game.soundOn) return;
    const sounds = {
      click: () => beep(460, .06, "square", .03),
      select: () => { beep(520, .06, "triangle", .04); beep(750, .1, "triangle", .03, .06); },
      catch: () => { beep(570, .06, "triangle", .045); beep(750, .12, "sine", .035, .05); },
      special: () => { beep(600, .07, "triangle", .04); beep(760, .07, "triangle", .04, .07); beep(990, .16, "sine", .045, .14); },
      hurt: () => { beep(180, .16, "sawtooth", .04); beep(140, .2, "triangle", .035, .05); },
      bomb: () => { beep(105, .28, "sawtooth", .07); beep(67, .34, "square", .045, .07); },
      timeup: () => { beep(523, .1, "sine", .04); beep(659, .1, "sine", .04, .11); beep(784, .23, "sine", .05, .22); },
      gameover: () => { beep(310, .12, "triangle", .045); beep(250, .12, "triangle", .04, .14); beep(185, .31, "sine", .045, .28); }
    };
    sounds[name]?.();
  }

  function startMusic() {
    if (!game.soundOn || musicTimer) return;
    const pattern = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
    const playStep = () => {
      if (!game.running || !game.soundOn) return;
      beep(pattern[musicStep % pattern.length], .28, "sine", .013);
      if (musicStep % 2 === 0) beep(pattern[(musicStep + 3) % pattern.length] / 2, .38, "triangle", .008, .04);
      musicStep += 1;
    };
    playStep();
    musicTimer = window.setInterval(playStep, 540);
  }

  function stopMusic() {
    if (musicTimer) window.clearInterval(musicTimer);
    musicTimer = undefined;
  }

  function syncSoundButtons() {
    soundButtons.forEach((button) => {
      button.classList.toggle("is-on", game.soundOn);
      button.setAttribute("aria-label", game.soundOn ? "Turn sound off" : "Turn sound on");
      const label = button.querySelector("[data-sound-label]");
      if (label) label.textContent = game.soundOn ? "Sound on" : "Sound off";
      const icon = button.querySelector("span");
      if (icon) icon.textContent = game.soundOn ? "♪" : "×";
    });
  }

  function toggleSound() {
    game.soundOn = !game.soundOn;
    rememberSound();
    syncSoundButtons();
    if (game.soundOn) {
      ensureAudio();
      playSound("click");
      if (game.running) startMusic();
    } else {
      stopMusic();
    }
  }

  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => goTo(button.dataset.go));
  });
  playButton.addEventListener("click", startRound);
  document.querySelector("#play-again").addEventListener("click", startRound);
  soundButtons.forEach((button) => button.addEventListener("click", toggleSound));

  installControls();
  syncCatArt();
  renderCatGrid();
  syncSoundButtons();
})();
