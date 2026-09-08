/**
 * 원소기호 산성비 게임 - 명예의 전당 연동용 Google Apps Script
 * ------------------------------------------------------------
 * 사용법은 함께 드린 SETUP.md 파일을 참고해주세요.
 *
 * 시트 헤더(자동 생성): 반 | 닉네임 | 난이도 | 달성레벨 | 점수 | 콤보 | 날짜
 * 순위는 점수(총점) 기준 내림차순으로 정렬됩니다.
 */

const SHEET_NAME = "기록";
const HEADER = ["반", "닉네임", "난이도", "달성레벨", "점수", "콤보", "날짜"];

function doGet(e) {
  const action = (e.parameter.action || "").toLowerCase();

  try {
    if (action === "save") return handleSave(e);
    if (action === "list") return handleList(e);
    return jsonOutput({ success: false, message: "알 수 없는 action 입니다." });
  } catch (err) {
    return jsonOutput({ success: false, message: String(err) });
  }
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER);
    sheet.getRange(1, 1, 1, HEADER.length).setFontWeight("bold");
  }
  return sheet;
}

function handleSave(e) {
  const klass = String(e.parameter.klass || "").trim();
  const nickname = String(e.parameter.nickname || "").trim();
  const difficulty = String(e.parameter.difficulty || "").trim();
  const stage = Number(e.parameter.stage || 0);
  const score = Number(e.parameter.score || 0);
  const combo = Number(e.parameter.combo || 0);

  if (!nickname || !difficulty) {
    return jsonOutput({ success: false, message: "필수 값이 누락되었습니다." });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_();
    sheet.appendRow([klass, nickname, difficulty, stage, score, combo, new Date()]);
  } finally {
    lock.releaseLock();
  }

  return jsonOutput({ success: true });
}

function handleList(e) {
  const difficultyFilter = String(e.parameter.difficulty || "").trim();
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();

  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row[1]) continue; // 닉네임 없는 빈 행 스킵
    const entry = {
      klass: row[0],
      nickname: row[1],
      difficulty: row[2],
      stage: Number(row[3] || 0),
      score: Number(row[4] || 0),
      combo: Number(row[5] || 0),
      date: row[6],
    };
    if (difficultyFilter && entry.difficulty !== difficultyFilter) continue;
    rows.push(entry);
  }

  // 순위는 점수(총점) 기준 내림차순, 동점이면 콤보가 높은 순, 그래도 같으면 먼저 등록한 순
  rows.sort((a, b) => b.score - a.score || b.combo - a.combo || new Date(a.date) - new Date(b.date));

  return jsonOutput({ success: true, data: rows });
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
