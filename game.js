/* ============================================================
   원소기호 산성비 게임
   ------------------------------------------------------------
   구글 스프레드시트(Apps Script) 연동 주소를 아래에 넣어주세요.
   Code.gs를 구글 시트에 배포한 뒤 나오는 "웹 앱 URL"을 붙여넣으면
   명예의 전당 등록/조회 기능이 활성화됩니다.
   ============================================================ */
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzjA2lT7N6pGZZaUgb5XqWbNS0ewmEWgms2nuqICK1_crWVoYywHrkkjv3aBEzZMLV-5g/exec"; 

/* ------------------------- 원소 데이터 ------------------------- */
// 원자번호 1~20
const ELEMENTS_BASE20 = [
  { symbol: "H",  name: "수소",    z: 1 },
  { symbol: "He", name: "헬륨",    z: 2 },
  { symbol: "Li", name: "리튬",    z: 3 },
  { symbol: "Be", name: "베릴륨",  z: 4 },
  { symbol: "B",  name: "붕소",    z: 5 },
  { symbol: "C",  name: "탄소",    z: 6 },
  { symbol: "N",  name: "질소",    z: 7 },
  { symbol: "O",  name: "산소",    z: 8 },
  { symbol: "F",  name: "플루오린", z: 9 },
  { symbol: "Ne", name: "네온",    z: 10 },
  { symbol: "Na", name: "나트륨",  z: 11 },
  { symbol: "Mg", name: "마그네슘", z: 12 },
  { symbol: "Al", name: "알루미늄", z: 13 },
  { symbol: "Si", name: "규소",    z: 14 },
  { symbol: "P",  name: "인",      z: 15 },
  { symbol: "S",  name: "황",      z: 16 },
  { symbol: "Cl", name: "염소",    z: 17 },
  { symbol: "Ar", name: "아르곤",  z: 18 },
  { symbol: "K",  name: "칼륨",    z: 19 },
  { symbol: "Ca", name: "칼슘",    z: 20 },
];

// 중급 추가 원소
const ELEMENTS_MID_EXTRA = [
  { symbol: "Fe", name: "철",     z: 26 },
  { symbol: "Ag", name: "은",     z: 47 },
  { symbol: "Au", name: "금",     z: 79 },
  { symbol: "Cu", name: "구리",   z: 29 },
  { symbol: "Pb", name: "납",     z: 82 },
  { symbol: "Hg", name: "수은",   z: 80 },
  { symbol: "I",  name: "아이오딘", z: 53 },
];

// 상급 추가 원소
const ELEMENTS_ADV_EXTRA = [
  { symbol: "Sr", name: "스트론튬", z: 38 },
  { symbol: "Ba", name: "바륨",    z: 56 },
  { symbol: "Mn", name: "망가니즈", z: 25 },
  { symbol: "Ni", name: "니켈",    z: 28 },
  { symbol: "Zn", name: "아연",    z: 30 },
  { symbol: "Pt", name: "백금",    z: 78 },
  { symbol: "Sn", name: "주석",    z: 50 },
];

const ELEMENT_SETS = {
  beginner: [...ELEMENTS_BASE20],
  intermediate: [...ELEMENTS_BASE20, ...ELEMENTS_MID_EXTRA],
  advanced: [...ELEMENTS_BASE20, ...ELEMENTS_MID_EXTRA, ...ELEMENTS_ADV_EXTRA],
};

const DIFFICULTY_LABEL = { beginner: "초보", intermediate: "중급", advanced: "상급" };
const MODE_LABEL = { symbol: "원소 기호", name: "원소 이름" };

/* ------------------------- 게임 설정 ------------------------- */
const CORRECT_PER_STAGE = 8;      // 이만큼 맞히면 다음 단계로
const WRONG_SCORE_PENALTY = 10;   // 오답 제출 시 감점
const MISS_PENALTY = 14;          // 원소가 바다에 닿았을 때 수면 상승(%)
const MAX_STAGE = 10;
// px/sec (index 1~10 사용)
const STAGE_SPEED = [0, 50, 65, 80, 95, 110, 130, 150, 175, 200, 230];
const STAGE_SPAWN_MS = [0, 1700, 1500, 1350, 1200, 1080, 970, 870, 780, 700, 630];

function comboScoreBonus(combo) {
  return combo * 5; // 콤보가 길게 이어질수록 점수가 계속 더 크게 늘어남(상한 없음)
}
function comboWaterDecrease(combo) {
  return Math.min(3 + Math.floor(combo / 3), 8); // 콤보가 쌓일수록 수위 하강폭 증가(상한 있음)
}

/* ------------------------- 상태 ------------------------- */
const state = {
  difficulty: null,
  mode: null,
  screen: "start",

  activeWords: [],
  stage: 1,
  stageCorrect: 0,
  score: 0,
  combo: 0,
  maxCombo: 0,
  correctCount: 0,
  missCount: 0,
  wrongCount: 0,
  water: 0,
  running: false,
  paused: false,
  pauseStartedAt: 0,
  startTime: 0,
  elapsedMs: 0,
  spawnTimer: 0,
  waveOffset: 0,
  logicalWidth: 800,
  logicalHeight: 500,
  lastTs: 0,
  rafId: null,
};

let wordIdSeq = 1;

/* ------------------------- DOM 참조 ------------------------- */
const screens = {
  start: document.getElementById("screen-start"),
  game: document.getElementById("screen-game"),
  result: document.getElementById("screen-result"),
  ranking: document.getElementById("screen-ranking"),
};

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const typeInput = document.getElementById("type-input");
const stageBanner = document.getElementById("stage-banner");
const btnPause = document.getElementById("btn-pause");
const pauseOverlay = document.getElementById("pause-overlay");
const btnResume = document.getElementById("btn-resume");

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.remove("active"));
  screens[name].classList.add("active");
  state.screen = name;
}

/* ------------------------- 시작 화면 ------------------------- */
const difficultyRow = document.getElementById("difficulty-row");
const modeRow = document.getElementById("mode-row");
const btnStart = document.getElementById("btn-start");

difficultyRow.addEventListener("click", (e) => {
  const btn = e.target.closest(".option-btn");
  if (!btn) return;
  [...difficultyRow.children].forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  state.difficulty = btn.dataset.difficulty;
  updateStartButton();
});

modeRow.addEventListener("click", (e) => {
  const btn = e.target.closest(".option-btn");
  if (!btn) return;
  [...modeRow.children].forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  state.mode = btn.dataset.mode;
  updateStartButton();
});

function updateStartButton() {
  btnStart.disabled = !(state.difficulty && state.mode);
}

btnStart.addEventListener("click", () => {
  if (!state.difficulty || !state.mode) return;
  startGame();
});

document.getElementById("btn-goto-ranking").addEventListener("click", () => {
  openRanking();
});

/* ------------------------- 게임 엔진 ------------------------- */
function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.logicalWidth = rect.width;
  state.logicalHeight = rect.height;
}

window.addEventListener("resize", () => {
  if (state.screen === "game") fitCanvas();
});

function answerTextFor(el) {
  return state.mode === "symbol" ? el.symbol : el.name;
}
function promptTextFor(el) {
  return state.mode === "symbol" ? el.name : el.symbol;
}

function startGame() {
  state.activeWords = [];
  state.stage = 1;
  state.stageCorrect = 0;
  state.score = 0;
  state.combo = 0;
  state.maxCombo = 0;
  state.correctCount = 0;
  state.missCount = 0;
  state.wrongCount = 0;
  state.water = 0;
  state.spawnTimer = 300; // 시작 후 잠시 뒤 첫 단어 등장
  state.waveOffset = 0;
  state.startTime = performance.now();
  state.lastTs = state.startTime;
  state.running = true;
  state.paused = false;
  pauseOverlay.classList.add("hidden");
  btnPause.textContent = "⏸ 일시정지";

  document.getElementById("hud-difficulty").textContent =
    `${DIFFICULTY_LABEL[state.difficulty]} · ${MODE_LABEL[state.mode]}`;

  showScreen("game");
  fitCanvas();
  updateHud();
  showStageBanner("1단계 시작!");

  typeInput.value = "";
  typeInput.disabled = false;
  setTimeout(() => typeInput.focus(), 50);

  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = requestAnimationFrame(loop);
}

function loop(ts) {
  if (!state.running) return;
  const dt = Math.min(50, ts - state.lastTs); // ms, 프레임 급증 방지
  state.lastTs = ts;
  state.elapsedMs = ts - state.startTime;

  update(dt);
  render();
  updateHud();

  state.rafId = requestAnimationFrame(loop);
}

function pauseGame() {
  if (!state.running || state.paused) return;
  state.paused = true;
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.pauseStartedAt = performance.now();
  typeInput.disabled = true;
  typeInput.blur();
  pauseOverlay.classList.remove("hidden");
  btnPause.textContent = "▶ 계속하기";
}

function resumeGame() {
  if (!state.running || !state.paused) return;
  const now = performance.now();
  state.startTime += now - state.pauseStartedAt; // 멈춘 시간만큼 시작 시각을 밀어서 시간 측정에서 제외
  state.lastTs = now;
  state.paused = false;
  pauseOverlay.classList.add("hidden");
  btnPause.textContent = "⏸ 일시정지";
  typeInput.disabled = false;
  typeInput.focus();
  state.rafId = requestAnimationFrame(loop);
}

btnPause.addEventListener("click", () => {
  if (state.paused) resumeGame();
  else pauseGame();
});
btnResume.addEventListener("click", resumeGame);
pauseOverlay.addEventListener("click", () => {
  if (state.paused) resumeGame();
});

function currentPool() {
  return ELEMENT_SETS[state.difficulty];
}

function spawnWord() {
  const pool = currentPool();
  const activeAnswers = new Set(
    state.activeWords.filter((w) => !w.matched).map((w) => answerTextFor(w.el))
  );
  let candidates = pool.filter((el) => !activeAnswers.has(answerTextFor(el)));
  if (candidates.length === 0) candidates = pool;

  const el = candidates[Math.floor(Math.random() * candidates.length)];
  const text = promptTextFor(el);

  ctx.font = "700 18px 'Pretendard', sans-serif";
  const textWidth = ctx.measureText(text).width;
  const boxW = Math.max(52, textWidth + 26);
  const margin = boxW / 2 + 6;
  const x = margin + Math.random() * Math.max(1, state.logicalWidth - margin * 2);

  state.activeWords.push({
    id: wordIdSeq++,
    el,
    text,
    x,
    y: -20,
    boxW,
    boxH: 34,
    speed: STAGE_SPEED[state.stage] * (0.85 + Math.random() * 0.3),
    matched: false,
    explodeT: 0,
  });
}

function update(dt) {
  state.waveOffset += dt * 0.0022;

  // 스폰
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnWord();
    const base = STAGE_SPAWN_MS[state.stage];
    state.spawnTimer = base * (0.8 + Math.random() * 0.4);
  }

  const surfaceY = state.logicalHeight * (1 - state.water / 100);

  for (const w of state.activeWords) {
    if (w.matched) {
      w.explodeT += dt;
      continue;
    }
    w.y += (w.speed * dt) / 1000;
    if (w.y + w.boxH / 2 >= surfaceY) {
      w.matched = true;
      w.missed = true;
      w.explodeT = 0;
      raiseWater(MISS_PENALTY);
      state.missCount++;
      state.combo = 0;
    }
  }

  state.activeWords = state.activeWords.filter((w) => !(w.matched && w.explodeT > 260));

  if (state.water >= 100) {
    endGame();
  }
}

function raiseWater(amount) {
  state.water = Math.min(100, state.water + amount);
}

function advanceStageIfNeeded() {
  if (state.stage < MAX_STAGE && state.stageCorrect >= CORRECT_PER_STAGE) {
    state.stage++;
    state.stageCorrect = 0;
    showStageBanner(`${state.stage}단계 돌파!`);
  }
}

function showStageBanner(text) {
  stageBanner.textContent = text;
  stageBanner.classList.remove("hidden");
  // 애니메이션 재시작을 위해 리플로우
  void stageBanner.offsetWidth;
  stageBanner.style.animation = "none";
  void stageBanner.offsetWidth;
  stageBanner.style.animation = "";
}

function handleCorrect(word) {
  word.matched = true;
  word.missed = false;
  word.explodeT = 0;
  state.combo++;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  state.score += 10 * state.stage + comboScoreBonus(state.combo);
  state.correctCount++;
  state.stageCorrect++;
  state.water = Math.max(0, state.water - comboWaterDecrease(state.combo));
  advanceStageIfNeeded();
}

function handleWrongSubmit() {
  state.wrongCount++;
  state.combo = 0;
  state.score = Math.max(0, state.score - WRONG_SCORE_PENALTY);
  typeInput.classList.remove("shake");
  void typeInput.offsetWidth;
  typeInput.classList.add("shake");
}

// 심볼 모드일 때만 입력값을 자동으로 첫 글자 대문자/나머지 소문자로 보정
typeInput.addEventListener("input", () => {
  if (!state.running || state.paused) return;
  if (state.mode === "symbol") {
    let val = typeInput.value.replace(/[^a-zA-Z]/g, "");
    if (val.length > 0) val = val[0].toUpperCase() + val.slice(1).toLowerCase();
    typeInput.value = val;
  }
});

// 정답 제출은 Enter 키로 확정
typeInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (!state.running || state.paused) return;
  const val = typeInput.value.trim();
  if (val.length === 0) return;

  const match = state.activeWords.find(
    (w) => !w.matched && answerTextFor(w.el) === val
  );
  if (match) {
    handleCorrect(match);
  } else {
    handleWrongSubmit();
  }
  typeInput.value = "";
});

document.querySelector(".canvas-wrap").addEventListener("click", () => {
  if (state.screen === "game") typeInput.focus();
});

function updateHud() {
  document.getElementById("hud-stage").textContent = state.stage;
  document.getElementById("hud-score").textContent = state.score;
  document.getElementById("hud-combo").textContent = state.combo;
  document.getElementById("hud-correct").textContent = state.correctCount;
  document.getElementById("hud-time").textContent = Math.floor(state.elapsedMs / 1000);
}

/* ------------------------- 렌더링 ------------------------- */
function render() {
  ctx.clearRect(0, 0, state.logicalWidth, state.logicalHeight);
  drawWater();
  drawWords();
}

function drawWater() {
  const waterHeight = state.logicalHeight * (state.water / 100);
  const surfaceY = state.logicalHeight - waterHeight;
  const dangerT = Math.max(0, Math.min(1, (state.water - 60) / 40));
  const r = Math.round(47 + (226 - 47) * dangerT);
  const g = Math.round(127 + (69 - 127) * dangerT);
  const b = Math.round(214 + (60 - 214) * dangerT);

  ctx.save();
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.75)`;
  ctx.beginPath();
  ctx.moveTo(0, surfaceY);
  const step = 12;
  for (let x = 0; x <= state.logicalWidth; x += step) {
    const y = surfaceY + Math.sin(x * 0.035 + state.waveOffset) * 4;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(state.logicalWidth, state.logicalHeight);
  ctx.lineTo(0, state.logicalHeight);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawWords() {
  for (const w of state.activeWords) {
    if (w.matched) {
      const t = Math.min(1, w.explodeT / 260);
      const radius = (w.boxW / 2) * (1 + t * 1.6);
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = w.missed ? "rgba(226,69,60,0.55)" : "rgba(191,232,245,0.8)";
      ctx.beginPath();
      ctx.arc(w.x, w.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }

    drawIceChunk(w);
  }
}

// 물방울 모양(빙하가 녹아 떨어지는 물방울)을 크고 또렷하게 그림
function drawDroplet(cx, tipY) {
  const dw = 9;   // 물방울 반너비
  const dh = 22;  // 물방울 높이

  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.bezierCurveTo(cx - dw, tipY + dh * 0.55, cx - dw, tipY + dh, cx, tipY + dh);
  ctx.bezierCurveTo(cx + dw, tipY + dh, cx + dw, tipY + dh * 0.55, cx, tipY);
  ctx.closePath();

  const dropGrad = ctx.createLinearGradient(cx, tipY, cx, tipY + dh);
  dropGrad.addColorStop(0, "#8fd1f7");
  dropGrad.addColorStop(1, "#1f6fc4");
  ctx.fillStyle = dropGrad;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#0f4f96";
  ctx.stroke();

  // 하이라이트(광택)
  ctx.beginPath();
  ctx.ellipse(cx - dw * 0.32, tipY + dh * 0.45, dw * 0.3, dh * 0.22, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();
}

// 떨어지는 원소를 "녹아내리는 빙하 조각 + 물방울"로 표현 (해수면 상승 컨셉)
function drawIceChunk(w) {
  const x = w.x - w.boxW / 2;
  const y = w.y - w.boxH / 2;
  const ww = w.boxW;
  const hh = w.boxH;

  ctx.save();

  // 본체
  const grad = ctx.createLinearGradient(x, y, x, y + hh);
  grad.addColorStop(0, "#eafcff");
  grad.addColorStop(1, "#b7e3f2");

  roundRectPath(x, y, ww, hh, 9);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#7ec3dc";
  ctx.stroke();

  // 균열 라인
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + ww * 0.32, y + 3);
  ctx.lineTo(x + ww * 0.48, y + hh * 0.5);
  ctx.lineTo(x + ww * 0.30, y + hh - 3);
  ctx.stroke();

  // 녹아 떨어지는 물방울 (더 크고 또렷하게, 얼음 조각 위에 그려서 잘 보이도록)
  drawDroplet(w.x, y + hh - 6);

  // 원자번호 배지 (모서리, 확대)
  ctx.beginPath();
  ctx.arc(x + 2, y + 2, 13, 0, Math.PI * 2);
  ctx.fillStyle = "#2f7fd6";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 14px 'Pretendard', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(w.el.z), x + 3, y + 3);

  // 본문 텍스트(이름 또는 기호)
  ctx.fillStyle = "#123a5e";
  ctx.font = "700 18px 'Pretendard', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(w.text, w.x, w.y + 2);

  ctx.restore();
}

function endGame() {
  state.running = false;
  if (state.rafId) cancelAnimationFrame(state.rafId);
  typeInput.disabled = true;
  typeInput.blur();

  const timeSec = Math.floor(state.elapsedMs / 1000);
  document.getElementById("res-difficulty").textContent = DIFFICULTY_LABEL[state.difficulty];
  document.getElementById("res-score").textContent = state.score;
  document.getElementById("res-stage").textContent = state.stage;
  document.getElementById("res-combo").textContent = state.maxCombo;
  document.getElementById("res-correct").textContent = state.correctCount;
  document.getElementById("res-time").textContent = `${timeSec}초`;

  document.getElementById("register-status").textContent = "";
  document.getElementById("register-status").className = "register-status";
  document.getElementById("input-nickname").value = "";

  showScreen("result");
}

/* ------------------------- 결과 화면 버튼 ------------------------- */
document.getElementById("btn-retry").addEventListener("click", () => {
  showScreen("start");
});
document.getElementById("btn-home").addEventListener("click", () => {
  showScreen("start");
});
document.getElementById("btn-view-ranking").addEventListener("click", () => {
  openRanking(state.difficulty);
});

/* ------------------------- 명예의 전당: 등록 ------------------------- */
document.getElementById("btn-register").addEventListener("click", async () => {
  const statusEl = document.getElementById("register-status");
  const nickname = document.getElementById("input-nickname").value.trim();
  const klass = document.getElementById("input-class").value;

  if (!nickname) {
    statusEl.textContent = "닉네임을 입력해주세요.";
    statusEl.className = "register-status error";
    return;
  }

  if (!APPS_SCRIPT_URL) {
    statusEl.textContent = "아직 구글 스프레드시트 연동 주소가 설정되지 않았어요. (game.js의 APPS_SCRIPT_URL)";
    statusEl.className = "register-status error";
    return;
  }

  const btn = document.getElementById("btn-register");
  btn.disabled = true;
  statusEl.textContent = "등록 중...";
  statusEl.className = "register-status";

  const params = new URLSearchParams({
    action: "save",
    klass,
    nickname,
    difficulty: DIFFICULTY_LABEL[state.difficulty],
    stage: state.stage,
    score: state.score,
    combo: state.maxCombo,
  });

  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    if (data && data.success) {
      statusEl.textContent = "명예의 전당에 등록되었습니다! 🎉";
      statusEl.className = "register-status";
      btn.disabled = true;
    } else {
      throw new Error((data && data.message) || "등록 실패");
    }
  } catch (err) {
    statusEl.textContent = "등록에 실패했습니다. 잠시 후 다시 시도해주세요.";
    statusEl.className = "register-status error";
    btn.disabled = false;
  }
});

/* ------------------------- 명예의 전당: 조회 ------------------------- */
const rankingTabRow = document.getElementById("ranking-tab-row");
const rankingBody = document.getElementById("ranking-body");
let currentRankingTab = "beginner";

rankingTabRow.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  [...rankingTabRow.children].forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  currentRankingTab = btn.dataset.tab;
  loadRanking(currentRankingTab);
});

document.getElementById("btn-ranking-back").addEventListener("click", () => {
  showScreen("start");
});

function openRanking(preferTab) {
  currentRankingTab = preferTab || currentRankingTab || "beginner";
  [...rankingTabRow.children].forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === currentRankingTab)
  );
  showScreen("ranking");
  loadRanking(currentRankingTab);
}

async function loadRanking(tabKey) {
  rankingBody.innerHTML = `<tr><td colspan="6" class="ranking-loading">불러오는 중...</td></tr>`;

  if (!APPS_SCRIPT_URL) {
    rankingBody.innerHTML = `<tr><td colspan="6" class="ranking-empty">아직 구글 스프레드시트 연동 주소가 설정되지 않았어요.<br/>(game.js의 APPS_SCRIPT_URL을 채워주세요)</td></tr>`;
    return;
  }

  const difficultyLabel = DIFFICULTY_LABEL[tabKey];
  const params = new URLSearchParams({ action: "list", difficulty: difficultyLabel });

  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    if (!data || !data.success) throw new Error("불러오기 실패");

    const rows = (data.data || []).slice(0, 30);
    if (rows.length === 0) {
      rankingBody.innerHTML = `<tr><td colspan="6" class="ranking-empty">아직 등록된 기록이 없습니다.</td></tr>`;
      return;
    }

    rankingBody.innerHTML = rows
      .map(
        (r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(r.klass)}반</td>
        <td>${escapeHtml(r.nickname)}</td>
        <td>${escapeHtml(r.score)}</td>
        <td>${escapeHtml(r.stage)}</td>
        <td>${escapeHtml(r.combo)}</td>
      </tr>`
      )
      .join("");
  } catch (err) {
    rankingBody.innerHTML = `<tr><td colspan="6" class="ranking-empty">랭킹을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</td></tr>`;
  }
}

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
