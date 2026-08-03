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
  cloudStateIcon: document.querySelector("#cloudStateIcon"),
  cloudHomeStatus: document.querySelector("#cloudHomeStatus"),
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
  rankingSubtitle: document.querySelector("#rankingSubtitle"),
  refreshRanking: document.querySelector("#refreshRankingButton"),
  cloudLoading: document.querySelector("#cloudLoading"),
  cloudDisabled: document.querySelector("#cloudDisabled"),
  groupSetup: document.querySelector("#groupSetup"),
  createGroupForm: document.querySelector("#createGroupForm"),
  createGroupName: document.querySelector("#createGroupName"),
  createNickname: document.querySelector("#createNickname"),
  joinGroupForm: document.querySelector("#joinGroupForm"),
  joinInviteCode: document.querySelector("#joinInviteCode"),
  joinNickname: document.querySelector("#joinNickname"),
  groupDashboard: document.querySelector("#groupDashboard"),
  activeGroupName: document.querySelector("#activeGroupName"),
  activeNickname: document.querySelector("#activeNickname"),
  activeInviteCode: document.querySelector("#activeInviteCode"),
  shareGroup: document.querySelector("#shareGroupButton"),
  leaveGroup: document.querySelector("#leaveGroupButton"),
  rankingUpdatedAt: document.querySelector("#rankingUpdatedAt"),
  leaderboardList: document.querySelector("#leaderboardList"),
  leaderboardEmpty: document.querySelector("#leaderboardEmpty"),
  memberHistory: document.querySelector("#memberHistory"),
  memberHistoryHeading: document.querySelector("#memberHistoryHeading"),
  memberHistorySummary: document.querySelector("#memberHistorySummary"),
  memberHistoryList: document.querySelector("#memberHistoryList"),
  closeMemberHistory: document.querySelector("#closeMemberHistoryButton"),
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
  cloud: {
    loading: true,
    configured: false,
    ready: false,
    group: null,
    participants: [],
    attempts: [],
    error: "",
  },
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

  if (["home", "wrong", "history", "ranking"].includes(viewName)) {
    const hash = `#${viewName}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }

  if (viewName === "home") renderHome();
  if (viewName === "wrong") renderWrongBook();
  if (viewName === "history") renderHistory();
  if (viewName === "ranking") renderRanking();
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
  syncResultOnline(result);
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
  renderCloudHomeStatus();
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

function cloudService() {
  return globalThis.MathToolsCloud || null;
}

function pendingInviteCode() {
  return (new URLSearchParams(location.search).get("group") || "")
    .trim()
    .toUpperCase()
    .slice(0, 8);
}

function applyCloudSnapshot(snapshot) {
  state.cloud.configured = Boolean(snapshot?.configured);
  state.cloud.ready = Boolean(snapshot?.ready);
  state.cloud.group = snapshot?.group || null;
  state.cloud.loading = false;
  renderCloudHomeStatus();
}

async function initializeCloud() {
  const service = cloudService();
  if (!service) {
    state.cloud.loading = false;
    state.cloud.error = "在线服务脚本加载失败";
    renderCloudHomeStatus();
    if (state.view === "ranking") renderRanking();
    return;
  }
  try {
    applyCloudSnapshot(await service.init());
    if (state.cloud.group) await refreshRankingData(false);
  } catch (error) {
    state.cloud.loading = false;
    state.cloud.configured = service.snapshot().configured;
    state.cloud.error = error.message || "在线服务连接失败";
    renderCloudHomeStatus();
  }
  if (state.view === "ranking") renderRanking();
}

function renderCloudHomeStatus() {
  elements.cloudStateIcon.classList.toggle("connected", Boolean(state.cloud.group));
  if (state.cloud.loading) {
    elements.cloudHomeStatus.textContent = "正在检查在线服务…";
  } else if (!state.cloud.configured) {
    elements.cloudHomeStatus.textContent = "当前使用本机记录，在线排行尚未配置。";
  } else if (state.cloud.error) {
    elements.cloudHomeStatus.textContent = "在线服务暂时不可用，本机练习不受影响。";
  } else if (state.cloud.group) {
    elements.cloudHomeStatus.textContent = `已加入「${state.cloud.group.name}」，成绩将同步到排行。`;
  } else {
    elements.cloudHomeStatus.textContent = "创建或加入练习组后即可同步成绩。";
  }
}

function renderRanking() {
  elements.cloudLoading.hidden = !state.cloud.loading;
  elements.cloudDisabled.hidden = state.cloud.loading || state.cloud.configured;
  elements.groupSetup.hidden = state.cloud.loading
    || !state.cloud.configured
    || Boolean(state.cloud.group);
  elements.groupDashboard.hidden = !state.cloud.group;
  elements.refreshRanking.hidden = !state.cloud.group;

  if (!state.cloud.configured && state.cloud.error) {
    elements.cloudDisabled.querySelector("span").textContent = state.cloud.error;
  }
  const inviteCode = pendingInviteCode();
  if (inviteCode && !state.cloud.group) elements.joinInviteCode.value = inviteCode;
  if (!state.cloud.group) return;

  const group = state.cloud.group;
  elements.activeGroupName.textContent = group.name;
  elements.activeNickname.textContent = group.nickname;
  elements.activeInviteCode.textContent = group.inviteCode;
  elements.rankingSubtitle.textContent = `${group.name} · 点击用户可查看其历史记录`;
  renderLeaderboard();
}

function setGroupFormsBusy(busy) {
  for (const form of [elements.createGroupForm, elements.joinGroupForm]) {
    for (const control of form.elements) control.disabled = busy;
  }
}

async function handleCreateGroup(event) {
  event.preventDefault();
  if (!cloudService()) return;
  setGroupFormsBusy(true);
  try {
    const snapshot = await cloudService().createGroup(
      elements.createGroupName.value.trim(),
      elements.createNickname.value.trim(),
    );
    applyCloudSnapshot(snapshot);
    updateGroupQuery(snapshot.group.inviteCode);
    state.cloud.error = "";
    showToast("练习组已创建");
    await refreshRankingData();
  } catch (error) {
    showToast(error.message || "创建练习组失败");
  } finally {
    setGroupFormsBusy(false);
    renderRanking();
  }
}

async function handleJoinGroup(event) {
  event.preventDefault();
  if (!cloudService()) return;
  setGroupFormsBusy(true);
  try {
    const snapshot = await cloudService().joinGroup(
      elements.joinInviteCode.value.trim().toUpperCase(),
      elements.joinNickname.value.trim(),
    );
    applyCloudSnapshot(snapshot);
    updateGroupQuery(snapshot.group.inviteCode);
    state.cloud.error = "";
    showToast(`已加入「${snapshot.group.name}」`);
    await refreshRankingData();
  } catch (error) {
    showToast(error.message || "加入练习组失败");
  } finally {
    setGroupFormsBusy(false);
    renderRanking();
  }
}

function updateGroupQuery(inviteCode) {
  const url = new URL(location.href);
  if (inviteCode) url.searchParams.set("group", inviteCode);
  else url.searchParams.delete("group");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

async function leaveCurrentGroup() {
  const confirmed = await confirmAction(
    "退出当前练习组？",
    "本机测试和错题不会删除，但之后的新成绩不会同步到这个练习组。",
    "确认退出",
  );
  if (!confirmed) return;
  applyCloudSnapshot(cloudService().leaveGroup());
  state.cloud.participants = [];
  state.cloud.attempts = [];
  elements.memberHistory.hidden = true;
  updateGroupQuery("");
  renderRanking();
  showToast("已退出当前练习组");
}

async function refreshRankingData(showFeedback = true) {
  if (!state.cloud.group || !cloudService()) return;
  elements.refreshRanking.disabled = true;
  try {
    await cloudService().flushPending();
    const data = await cloudService().loadGroupData();
    state.cloud.participants = data.participants;
    state.cloud.attempts = data.attempts;
    state.cloud.error = "";
    elements.rankingUpdatedAt.textContent = `更新于 ${new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date())}`;
    if (showFeedback) showToast("排行榜已更新");
  } catch (error) {
    state.cloud.error = error.message || "排行榜加载失败";
    if (showFeedback) showToast("排行榜加载失败，请稍后重试");
  } finally {
    elements.refreshRanking.disabled = false;
    if (state.view === "ranking") renderLeaderboard();
  }
}

function leaderboardEntries() {
  return state.cloud.participants.map((participant) => {
    const attempts = state.cloud.attempts.filter(
      (attempt) => attempt.participant_id === participant.id
        && attempt.attempt_type === "test",
    );
    const totalQuestions = attempts.reduce((sum, item) => sum + item.question_count, 0);
    const totalCorrect = attempts.reduce((sum, item) => sum + item.correct_count, 0);
    const totalDuration = attempts.reduce((sum, item) => sum + item.duration_seconds, 0);
    return {
      participant,
      tests: attempts.length,
      totalQuestions,
      totalCorrect,
      accuracy: totalQuestions ? Math.round(totalCorrect / totalQuestions * 100) : 0,
      secondsPerQuestion: totalQuestions ? totalDuration / totalQuestions : 0,
    };
  }).sort((left, right) => (
    right.totalCorrect - left.totalCorrect
      || right.accuracy - left.accuracy
      || right.totalQuestions - left.totalQuestions
      || left.participant.created_at.localeCompare(right.participant.created_at)
  ));
}

function renderLeaderboard() {
  const entries = leaderboardEntries();
  const hasScores = entries.some((entry) => entry.tests > 0);
  elements.leaderboardList.replaceChildren();
  elements.leaderboardEmpty.hidden = hasScores;
  elements.leaderboardList.parentElement.hidden = !hasScores;
  if (!hasScores) return;

  entries.forEach((entry, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "leaderboard-row";
    row.classList.toggle("current", entry.participant.id === state.cloud.group.participantId);
    row.setAttribute("role", "row");

    const player = document.createElement("span");
    player.className = "leaderboard-player";
    const rank = document.createElement("span");
    rank.className = "leaderboard-rank";
    rank.textContent = index + 1;
    const identity = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = entry.participant.nickname;
    const marker = document.createElement("small");
    marker.textContent = entry.participant.id === state.cloud.group.participantId ? "我" : "查看历史";
    identity.append(name, marker);
    player.append(rank, identity);
    row.append(
      player,
      createLeaderboardValue(entry.tests, "次"),
      createLeaderboardValue(entry.totalQuestions, `${entry.totalCorrect}题正确`),
      createLeaderboardValue(`${entry.accuracy}%`, "累计"),
      createLeaderboardValue(
        entry.secondsPerQuestion ? `${entry.secondsPerQuestion.toFixed(1)}秒` : "--",
        "平均",
      ),
    );
    row.addEventListener("click", () => renderMemberHistory(entry.participant));
    elements.leaderboardList.append(row);
  });
}

function createLeaderboardValue(value, label) {
  const wrapper = document.createElement("span");
  wrapper.className = "leaderboard-value";
  const strong = document.createElement("strong");
  strong.textContent = value;
  const caption = document.createElement("span");
  caption.textContent = label;
  wrapper.append(strong, caption);
  return wrapper;
}

function renderMemberHistory(participant) {
  const attempts = state.cloud.attempts
    .filter((attempt) => attempt.participant_id === participant.id)
    .slice(0, 30);
  const formalTests = attempts.filter((attempt) => attempt.attempt_type === "test");
  const totalQuestions = formalTests.reduce((sum, item) => sum + item.question_count, 0);
  const totalCorrect = formalTests.reduce((sum, item) => sum + item.correct_count, 0);
  const accuracy = totalQuestions ? Math.round(totalCorrect / totalQuestions * 100) : 0;

  elements.memberHistoryHeading.textContent = `${participant.nickname} 的历史表现`;
  elements.memberHistorySummary.textContent = formalTests.length
    ? `${formalTests.length} 次测试 · ${totalQuestions} 题 · 累计准确率 ${accuracy}%`
    : "还没有正式测试记录";
  elements.memberHistoryList.replaceChildren();
  if (!attempts.length) {
    const empty = document.createElement("div");
    empty.className = "empty-block";
    empty.textContent = "该用户暂时没有历史记录。";
    elements.memberHistoryList.append(empty);
  } else {
    for (const attempt of attempts) {
      elements.memberHistoryList.append(createHistoryRow({
        type: attempt.attempt_type,
        count: attempt.question_count,
        correct: attempt.correct_count,
        accuracy: attempt.accuracy,
        duration: attempt.duration_seconds,
        createdAt: attempt.completed_at,
      }));
    }
  }
  elements.memberHistory.hidden = false;
  elements.memberHistory.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function syncResultOnline(result) {
  if (!state.cloud.group || !cloudService()) return;
  try {
    await cloudService().syncAttempt(result);
    if (state.view === "ranking") await refreshRankingData(false);
  } catch (_) {
    showToast("成绩已保存在本机，将在网络恢复后重试同步");
  }
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
  if (state.cloud.group) url.searchParams.set("group", state.cloud.group.inviteCode);
  const shareData = {
    title: "乘法小站",
    text: state.cloud.group
      ? `加入「${state.cloud.group.name}」，来做一轮 ${selectedQuestionCount()} 题九九乘法测试吧！`
      : `来做一轮 ${selectedQuestionCount()} 题九九乘法测试吧！`,
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
elements.createGroupForm.addEventListener("submit", handleCreateGroup);
elements.joinGroupForm.addEventListener("submit", handleJoinGroup);
elements.joinInviteCode.addEventListener("input", () => {
  elements.joinInviteCode.value = elements.joinInviteCode.value
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 8);
});
elements.refreshRanking.addEventListener("click", () => refreshRankingData());
elements.shareGroup.addEventListener("click", sharePractice);
elements.leaveGroup.addEventListener("click", leaveCurrentGroup);
elements.closeMemberHistory.addEventListener("click", () => {
  elements.memberHistory.hidden = true;
});

for (const button of elements.navButtons) {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    showView(button.dataset.nav);
  });
}

window.addEventListener("hashchange", () => {
  const requested = location.hash.slice(1);
  if (["home", "wrong", "history", "ranking"].includes(requested) && requested !== state.view) {
    showView(requested);
  }
});

const queryCount = Number(new URLSearchParams(location.search).get("questions"));
if ([10, 20].includes(queryCount)) setSelectedQuestionCount(queryCount);
updateGlobalBadges();
const requestedInitialView = location.hash.slice(1);
const initialView = pendingInviteCode()
  ? "ranking"
  : ["home", "wrong", "history", "ranking"].includes(requestedInitialView)
    ? requestedInitialView
    : "home";
showView(initialView);
initializeCloud();
