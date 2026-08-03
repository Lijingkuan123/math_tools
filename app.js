"use strict";

const STORAGE_KEYS = {
  history: "multiplication-history-v1",
  wrong: "multiplication-wrong-v1",
  active: "multiplication-active-v1",
};

const elements = {
  views: [...document.querySelectorAll("[data-view]")],
  navButtons: [...document.querySelectorAll("[data-nav]")],
  bottomNav: document.querySelector("#bottomNav"),
  countInputs: [...document.querySelectorAll('input[name="questionCount"]')],
  startTest: document.querySelector("#startTestButton"),
  resumeTest: document.querySelector("#resumeTestButton"),
  share: document.querySelector("#shareButton"),
  totalTests: document.querySelector("#totalTestsStat"),
  averageAccuracy: document.querySelector("#averageAccuracyStat"),
  averageAccuracyUnit: document.querySelector("#averageAccuracyUnit"),
  wrongCount: document.querySelector("#wrongCountStat"),
  wrongNavBadge: document.querySelector("#wrongNavBadge"),
  homeEmptyHistory: document.querySelector("#homeEmptyHistory"),
  recentHistory: document.querySelector("#recentHistory"),
  leaveTest: document.querySelector("#leaveTestButton"),
  testTitle: document.querySelector("#testTitle"),
  answerProgress: document.querySelector("#answerProgress"),
  timerValue: document.querySelector("#timerValue"),
  quizForm: document.querySelector("#quizForm"),
  questionGrid: document.querySelector("#questionGrid"),
  submitHint: document.querySelector("#submitHint"),
  scoreRing: document.querySelector("#scoreRing"),
  resultScore: document.querySelector("#resultScore"),
  resultEyebrow: document.querySelector("#resultEyebrow"),
  resultTitle: document.querySelector("#resultTitle"),
  resultDescription: document.querySelector("#resultDescription"),
  correctFact: document.querySelector("#correctFact"),
  durationFact: document.querySelector("#durationFact"),
  newTest: document.querySelector("#newTestButton"),
  reviewResult: document.querySelector("#reviewResultButton"),
  mistakeSection: document.querySelector("#mistakeSection"),
  resultMistakes: document.querySelector("#resultMistakes"),
  reviewAll: document.querySelector("#reviewAllButton"),
  wrongEmpty: document.querySelector("#wrongEmpty"),
  wrongList: document.querySelector("#wrongList"),
  clearHistory: document.querySelector("#clearHistoryButton"),
  historyTests: document.querySelector("#historyTestsStat"),
  historyAnswers: document.querySelector("#historyAnswersStat"),
  historyAccuracy: document.querySelector("#historyAccuracyStat"),
  historyBest: document.querySelector("#historyBestStat"),
  historyEmpty: document.querySelector("#historyEmpty"),
  historyList: document.querySelector("#historyList"),
  toast: document.querySelector("#toast"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmTitle: document.querySelector("#confirmTitle"),
  confirmMessage: document.querySelector("#confirmMessage"),
  confirmAccept: document.querySelector("#confirmAcceptButton"),
};

const state = {
  view: "home",
  history: readStorage(STORAGE_KEYS.history, []),
  wrong: readStorage(STORAGE_KEYS.wrong, []),
  active: readStorage(STORAGE_KEYS.active, null),
  lastResult: null,
  timerHandle: 0,
};

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch (_) {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    showToast("当前浏览器无法保存学习记录");
  }
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch (_) {
    // The in-memory state still works when storage is unavailable.
  }
}

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function questionKey(a, b) {
  return [Number(a), Number(b)].sort((left, right) => left - right).join("x");
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function generateQuestions(count) {
  const pool = [];
  for (let a = 1; a <= 9; a += 1) {
    for (let b = 1; b <= 9; b += 1) {
      pool.push({ id: makeId("question"), a, b, userAnswer: "" });
    }
  }
  return shuffle(pool).slice(0, count);
}

function selectedQuestionCount() {
  return Number(elements.countInputs.find((input) => input.checked)?.value || 10);
}

function setSelectedQuestionCount(count) {
  const input = elements.countInputs.find((item) => Number(item.value) === Number(count));
  if (input) input.checked = true;
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function elapsedSeconds() {
  if (!state.active) return 0;
  return Math.max(0, Math.floor((Date.now() - state.active.startedAt) / 1000));
}

function showView(viewName) {
  stopTimer();
  state.view = viewName;
  for (const view of elements.views) view.hidden = view.dataset.view !== viewName;
  for (const button of elements.navButtons) {
    button.classList.toggle("active", button.dataset.nav === viewName);
  }
  elements.bottomNav.hidden = viewName === "test";

  if (["home", "wrong", "history"].includes(viewName)) {
    const hash = `#${viewName}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }

  if (viewName === "home") renderHome();
  if (viewName === "wrong") renderWrongBook();
  if (viewName === "history") renderHistory();
  if (viewName === "test") {
    renderQuiz();
    startTimer();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startTimer() {
  stopTimer();
  updateTimer();
  state.timerHandle = window.setInterval(updateTimer, 1000);
}

function stopTimer() {
  window.clearInterval(state.timerHandle);
  state.timerHandle = 0;
}

function updateTimer() {
  elements.timerValue.textContent = formatDuration(elapsedSeconds());
}

function saveActive() {
  if (state.active) writeStorage(STORAGE_KEYS.active, state.active);
}

async function replaceActiveIfNeeded() {
  if (!state.active) return true;
  return confirmAction(
    "开始新的练习？",
    "当前未提交的答卷会被替换，已有答案将无法恢复。",
    "开始新练习",
  );
}

async function startNewTest() {
  if (!(await replaceActiveIfNeeded())) return;
  const count = selectedQuestionCount();
  state.active = {
    id: makeId("test"),
    type: "test",
    count,
    startedAt: Date.now(),
    questions: generateQuestions(count),
  };
  state.lastResult = null;
  saveActive();
  showView("test");
}

async function startReview(questions) {
  if (!questions.length) {
    showToast("当前没有需要复习的错题");
    return;
  }
  if (!(await replaceActiveIfNeeded())) return;
  state.active = {
    id: makeId("review"),
    type: "review",
    count: questions.length,
    startedAt: Date.now(),
    questions: shuffle(questions).map((question) => ({
      id: makeId("question"),
      a: Number(question.a),
      b: Number(question.b),
      userAnswer: "",
    })),
  };
  state.lastResult = null;
  saveActive();
  showView("test");
}

function renderQuiz() {
  if (!state.active) {
    showView("home");
    return;
  }
  elements.testTitle.textContent = state.active.type === "review" ? "错题复习" : `${state.active.count} 题测试`;
  elements.questionGrid.replaceChildren();

  state.active.questions.forEach((question, index) => {
    const item = document.createElement("div");
    item.className = "question-item";

    const number = document.createElement("span");
    number.className = "question-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const equation = document.createElement("label");
    equation.className = "equation";
    equation.htmlFor = `answer-${question.id}`;
    equation.textContent = `${question.a} × ${question.b} =`;

    const input = document.createElement("input");
    input.className = "answer-input";
    input.id = `answer-${question.id}`;
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.maxLength = 2;
    input.placeholder = "?";
    input.value = question.userAnswer;
    input.setAttribute("aria-label", `${question.a} 乘以 ${question.b} 的答案`);
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 2);
      question.userAnswer = input.value;
      saveActive();
      updateAnswerProgress();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const inputs = [...elements.questionGrid.querySelectorAll(".answer-input")];
      const next = inputs[index + 1];
      if (next) next.focus();
      else elements.quizForm.querySelector("button[type=submit]").focus();
    });

    item.append(number, equation, input);
    elements.questionGrid.append(item);
  });
  updateAnswerProgress();
}

function updateAnswerProgress() {
  if (!state.active) return;
  const answered = state.active.questions.filter((question) => question.userAnswer !== "").length;
  elements.answerProgress.textContent = `已答 ${answered} / ${state.active.count}`;
  elements.submitHint.textContent = answered === state.active.count
    ? "所有题目都已填写，可以提交答卷。"
    : `还有 ${state.active.count - answered} 题未填写。`;
}

function addWrongQuestion(question) {
  const key = questionKey(question.a, question.b);
  const existing = state.wrong.find((item) => item.key === key);
  if (existing) {
    existing.timesWrong += 1;
    existing.lastWrongAt = Date.now();
    existing.lastAnswer = question.userAnswer;
  } else {
    state.wrong.push({
      key,
      a: Math.min(question.a, question.b),
      b: Math.max(question.a, question.b),
      timesWrong: 1,
      lastWrongAt: Date.now(),
      lastAnswer: question.userAnswer,
    });
  }
}

function removeWrongQuestion(question) {
  const key = questionKey(question.a, question.b);
  state.wrong = state.wrong.filter((item) => item.key !== key);
}

async function submitQuiz(event) {
  event.preventDefault();
  if (!state.active) return;
  const unanswered = state.active.questions.filter((question) => question.userAnswer === "").length;
  if (unanswered > 0) {
    const confirmed = await confirmAction(
      "仍有未答题目",
      `还有 ${unanswered} 题没有填写，未答题会按错误处理。`,
      "仍然提交",
    );
    if (!confirmed) return;
  }

  const active = state.active;
  const duration = elapsedSeconds();
  const evaluated = active.questions.map((question) => ({
    ...question,
    correctAnswer: question.a * question.b,
    isCorrect: question.userAnswer !== "" && Number(question.userAnswer) === question.a * question.b,
  }));
  const wrongQuestions = evaluated.filter((question) => !question.isCorrect);
  const correct = evaluated.length - wrongQuestions.length;

  if (active.type === "review") {
    for (const question of evaluated) {
      if (question.isCorrect) removeWrongQuestion(question);
      else addWrongQuestion(question);
    }
  } else {
    for (const question of wrongQuestions) addWrongQuestion(question);
  }
  writeStorage(STORAGE_KEYS.wrong, state.wrong);

  const result = {
    id: active.id,
    type: active.type,
    count: evaluated.length,
    correct,
    accuracy: Math.round(correct / evaluated.length * 100),
    duration,
    createdAt: Date.now(),
    wrongQuestions,
  };
  state.history.unshift({
    id: result.id,
    type: result.type,
    count: result.count,
    correct: result.correct,
    accuracy: result.accuracy,
    duration: result.duration,
    createdAt: result.createdAt,
  });
  state.history = state.history.slice(0, 200);
  writeStorage(STORAGE_KEYS.history, state.history);

  state.lastResult = result;
  state.active = null;
  removeStorage(STORAGE_KEYS.active);
  stopTimer();
  renderResult();
  showView("result");
  updateGlobalBadges();
}

function renderResult() {
  const result = state.lastResult;
  if (!result) return;
  elements.resultScore.textContent = `${result.accuracy}%`;
  elements.scoreRing.style.setProperty("--score", `${result.accuracy * 3.6}deg`);
  elements.resultEyebrow.textContent = result.type === "review" ? "复习结果" : "本次成绩";
  elements.resultTitle.textContent = result.accuracy === 100 ? "全部答对！" : "答卷已提交";
  elements.resultDescription.textContent = result.accuracy === 100
    ? "计算准确又稳定，继续保持这个节奏。"
    : `有 ${result.wrongQuestions.length} 道题需要再巩固，已经加入错题集。`;
  elements.correctFact.textContent = `${result.correct} / ${result.count}`;
  elements.durationFact.textContent = formatDuration(result.duration);
  elements.reviewResult.hidden = result.wrongQuestions.length === 0;
  elements.mistakeSection.hidden = result.wrongQuestions.length === 0;
  elements.resultMistakes.replaceChildren();

  for (const question of result.wrongQuestions) {
    const row = document.createElement("div");
    row.className = "mistake-row";
    const equation = document.createElement("strong");
    equation.className = "equation";
    equation.textContent = `${question.a} × ${question.b}`;
    const submitted = document.createElement("span");
    submitted.textContent = "你的答案：";
    const submittedAnswer = document.createElement("strong");
    submittedAnswer.className = "wrong-answer";
    submittedAnswer.textContent = question.userAnswer || "未作答";
    submitted.append(submittedAnswer);
    const correct = document.createElement("span");
    correct.textContent = `正确答案：${question.correctAnswer}`;
    row.append(equation, submitted, correct);
    elements.resultMistakes.append(row);
  }
}

function renderHome() {
  const average = state.history.length
    ? Math.round(state.history.reduce((sum, item) => sum + item.accuracy, 0) / state.history.length)
    : null;
  elements.totalTests.textContent = state.history.length;
  elements.averageAccuracy.textContent = average === null ? "--" : average;
  elements.averageAccuracyUnit.textContent = average === null ? "" : "%";
  elements.wrongCount.textContent = state.wrong.length;
  elements.resumeTest.hidden = !state.active;
  if (state.active) {
    const answered = state.active.questions.filter((question) => question.userAnswer !== "").length;
    elements.resumeTest.textContent = `继续上次答题（${answered}/${state.active.count}）`;
  }

  elements.recentHistory.replaceChildren();
  elements.homeEmptyHistory.hidden = state.history.length > 0;
  for (const item of state.history.slice(0, 3)) {
    elements.recentHistory.append(createHistoryRow(item));
  }
  updateGlobalBadges();
}

function createHistoryRow(item) {
  const row = document.createElement("article");
  row.className = "history-row";

  const main = document.createElement("div");
  main.className = "history-main";
  const title = document.createElement("strong");
  title.textContent = item.type === "review" ? "错题复习" : `${item.count} 题测试`;
  const date = document.createElement("span");
  date.textContent = formatDate(item.createdAt);
  main.append(title, date);

  const track = document.createElement("div");
  track.className = "accuracy-track";
  const fill = document.createElement("i");
  fill.style.width = `${item.accuracy}%`;
  track.append(fill);

  const accuracy = document.createElement("div");
  accuracy.className = "history-number";
  accuracy.innerHTML = `<strong>${item.accuracy}%</strong><span>${item.correct}/${item.count} 正确</span>`;

  const duration = document.createElement("div");
  duration.className = "history-number";
  duration.innerHTML = `<strong>${formatDuration(item.duration)}</strong><span>用时</span>`;
  row.append(main, track, accuracy, duration);
  return row;
}

function renderWrongBook() {
  const sorted = [...state.wrong].sort((left, right) => right.lastWrongAt - left.lastWrongAt);
  elements.wrongEmpty.hidden = sorted.length > 0;
  elements.wrongList.replaceChildren();
  elements.reviewAll.disabled = sorted.length === 0;

  for (const item of sorted) {
    const card = document.createElement("article");
    card.className = "wrong-item";
    const equation = document.createElement("div");
    equation.className = "wrong-equation";
    equation.textContent = `${item.a} × ${item.b} = ${item.a * item.b}`;
    const facts = document.createElement("dl");
    facts.innerHTML = `
      <div><dt>累计答错</dt><dd>${item.timesWrong} 次</dd></div>
      <div><dt>最近答错</dt><dd>${formatDate(item.lastWrongAt)}</dd></div>
    `;
    card.append(equation, facts);
    elements.wrongList.append(card);
  }
  updateGlobalBadges();
}

function renderHistory() {
  const count = state.history.length;
  const answers = state.history.reduce((sum, item) => sum + item.count, 0);
  const average = count
    ? Math.round(state.history.reduce((sum, item) => sum + item.accuracy, 0) / count)
    : null;
  const best = count ? Math.max(...state.history.map((item) => item.accuracy)) : null;
  elements.historyTests.textContent = count;
  elements.historyAnswers.textContent = answers;
  elements.historyAccuracy.textContent = average === null ? "--" : `${average}%`;
  elements.historyBest.textContent = best === null ? "--" : `${best}%`;
  elements.clearHistory.disabled = count === 0;
  elements.historyEmpty.hidden = count > 0;
  elements.historyList.replaceChildren();
  for (const item of state.history) elements.historyList.append(createHistoryRow(item));
}

function updateGlobalBadges() {
  elements.wrongNavBadge.textContent = state.wrong.length > 99 ? "99+" : state.wrong.length;
  elements.wrongNavBadge.hidden = state.wrong.length === 0;
}

async function clearHistory() {
  if (!state.history.length) return;
  const confirmed = await confirmAction(
    "清空测试记录？",
    "准确率和用时记录会被删除，错题集不会受到影响。",
    "确认清空",
  );
  if (!confirmed) return;
  state.history = [];
  removeStorage(STORAGE_KEYS.history);
  renderHistory();
  showToast("测试记录已清空");
}

function confirmAction(title, message, acceptText) {
  if (typeof elements.confirmDialog.showModal !== "function") {
    return Promise.resolve(window.confirm(message));
  }
  elements.confirmTitle.textContent = title;
  elements.confirmMessage.textContent = message;
  elements.confirmAccept.textContent = acceptText;
  elements.confirmDialog.returnValue = "cancel";
  elements.confirmDialog.showModal();
  return new Promise((resolve) => {
    elements.confirmDialog.addEventListener("close", () => {
      resolve(elements.confirmDialog.returnValue === "confirm");
    }, { once: true });
  });
}

let toastTimer = 0;
function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 2600);
}

async function sharePractice() {
  const url = new URL(location.href);
  url.hash = "home";
  url.searchParams.set("questions", selectedQuestionCount());
  const shareData = {
    title: "乘法小站",
    text: `来做一轮 ${selectedQuestionCount()} 题九九乘法测试吧！`,
    url: url.toString(),
  };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(shareData.url);
    showToast("练习链接已复制");
  } catch (_) {
    const input = document.createElement("textarea");
    input.value = shareData.url;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    showToast("练习链接已复制");
  }
}

elements.startTest.addEventListener("click", startNewTest);
elements.resumeTest.addEventListener("click", () => showView("test"));
elements.share.addEventListener("click", sharePractice);
elements.leaveTest.addEventListener("click", () => showView("home"));
elements.quizForm.addEventListener("submit", submitQuiz);
elements.newTest.addEventListener("click", () => showView("home"));
elements.reviewResult.addEventListener("click", () => {
  const questions = state.lastResult?.wrongQuestions || [];
  startReview(questions);
});
elements.reviewAll.addEventListener("click", () => startReview(state.wrong));
elements.clearHistory.addEventListener("click", clearHistory);

for (const button of elements.navButtons) {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    showView(button.dataset.nav);
  });
}

window.addEventListener("hashchange", () => {
  const requested = location.hash.slice(1);
  if (["home", "wrong", "history"].includes(requested) && requested !== state.view) {
    showView(requested);
  }
});

const queryCount = Number(new URLSearchParams(location.search).get("questions"));
if ([10, 20].includes(queryCount)) setSelectedQuestionCount(queryCount);
updateGlobalBadges();
const initialView = ["home", "wrong", "history"].includes(location.hash.slice(1))
  ? location.hash.slice(1)
  : "home";
showView(initialView);
