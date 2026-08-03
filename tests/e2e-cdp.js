"use strict";

const fs = require("node:fs");

const DEBUG_URL = process.env.CHROME_DEBUG_URL || "http://127.0.0.1:19224";
const APP_URL = process.env.APP_URL || "http://127.0.0.1:18880/";

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const targets = await fetch(`${DEBUG_URL}/json/list`).then((response) => response.json());
  const target = targets.find((item) => item.type === "page");
  assert(target, "No Chrome page target is available");

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let commandId = 0;
  const exceptions = [];

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(message.params.exceptionDetails.text);
    }
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  };

  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description
          || response.exceptionDetails.text,
      );
    }
    return response.result.value;
  };

  const screenshot = async (path) => {
    const response = await send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    fs.writeFileSync(path, Buffer.from(response.data, "base64"));
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: APP_URL });
  await wait(700);
  await evaluate("localStorage.clear(); location.hash='home'; location.reload()");
  await wait(700);

  await evaluate("document.querySelector('#startTestButton').click()");
  await wait(150);
  let result = await evaluate(`JSON.stringify({
    questions: document.querySelectorAll('.question-item').length,
    testVisible: !document.querySelector('#testView').hidden
  })`);
  result = JSON.parse(result);
  assert(result.questions === 10, `Expected 10 questions, received ${result.questions}`);
  assert(result.testVisible, "Test view did not open");

  await evaluate(`(() => {
    const input = document.querySelector('.answer-input');
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    location.reload();
  })()`);
  await wait(700);
  result = await evaluate(`JSON.stringify({
    resumeVisible: !document.querySelector('#resumeTestButton').hidden,
    activeStored: Boolean(localStorage.getItem('multiplication-active-v1'))
  })`);
  result = JSON.parse(result);
  assert(result.resumeVisible && result.activeStored, "Active test was not restored after refresh");

  await evaluate("document.querySelector('#resumeTestButton').click()");
  await wait(120);
  const restoredAnswer = await evaluate("document.querySelector('.answer-input').value");
  assert(restoredAnswer === "0", "Saved answer was not restored after refresh");

  await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.question-item')];
    rows.forEach((row, index) => {
      const numbers = row.querySelector('.equation').textContent.match(/[0-9]+/g).map(Number);
      const input = row.querySelector('.answer-input');
      input.value = index === 0 ? '0' : String(numbers[0] * numbers[1]);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    document.querySelector('#quizForm').requestSubmit();
  })()`);
  await wait(250);
  result = await evaluate(`JSON.stringify({
    score: document.querySelector('#resultScore').textContent,
    mistakes: document.querySelectorAll('#resultMistakes .mistake-row').length,
    wrongStored: JSON.parse(localStorage.getItem('multiplication-wrong-v1')).length,
    historyStored: JSON.parse(localStorage.getItem('multiplication-history-v1')).length
  })`);
  result = JSON.parse(result);
  assert(result.score === "90%", `Expected 90% result, received ${result.score}`);
  assert(result.mistakes === 1 && result.wrongStored === 1, "Wrong question was not saved correctly");
  assert(result.historyStored === 1, "First test history was not saved");

  await evaluate("document.querySelector('#reviewResultButton').click()");
  await wait(150);
  await evaluate(`(() => {
    const row = document.querySelector('.question-item');
    const numbers = row.querySelector('.equation').textContent.match(/[0-9]+/g).map(Number);
    const input = row.querySelector('.answer-input');
    input.value = String(numbers[0] * numbers[1]);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#quizForm').requestSubmit();
  })()`);
  await wait(250);
  result = await evaluate(`JSON.stringify({
    score: document.querySelector('#resultScore').textContent,
    wrongStored: JSON.parse(localStorage.getItem('multiplication-wrong-v1')).length,
    historyStored: JSON.parse(localStorage.getItem('multiplication-history-v1')).length
  })`);
  result = JSON.parse(result);
  assert(result.score === "100%", "Correct review did not produce a full score");
  assert(result.wrongStored === 0, "Correct review did not remove the wrong question");
  assert(result.historyStored === 2, "Review history was not saved");

  await evaluate("document.querySelector('[data-nav=history]').click()");
  await wait(100);
  const historyRows = await evaluate("document.querySelectorAll('#historyList .history-row').length");
  assert(historyRows === 2, `Expected 2 visible history rows, received ${historyRows}`);

  await evaluate("localStorage.clear(); location.hash='home'; location.reload()");
  await wait(600);
  await screenshot("/tmp/math-tools-desktop.png");

  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Page.navigate", { url: `${APP_URL}?questions=20#home` });
  await wait(600);
  result = await evaluate(`JSON.stringify({
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    selectedCount: document.querySelector('input[name=questionCount]:checked').value,
    shareRight: document.querySelector('#shareButton').getBoundingClientRect().right,
    viewportRight: document.documentElement.clientWidth
  })`);
  result = JSON.parse(result);
  assert(result.innerWidth === 390 && result.scrollWidth === 390, "Mobile page has horizontal overflow");
  assert(result.selectedCount === "20", "Shared question count was not applied");
  assert(result.shareRight <= result.viewportRight, "Share button exceeds the mobile viewport");
  await screenshot("/tmp/math-tools-mobile.png");

  await evaluate("document.querySelector('#startTestButton').click()");
  await wait(150);
  result = await evaluate(`JSON.stringify({
    questions: document.querySelectorAll('.question-item').length,
    scrollWidth: document.documentElement.scrollWidth,
    questionRight: document.querySelector('.question-item').getBoundingClientRect().right,
    inputRight: document.querySelector('.answer-input').getBoundingClientRect().right,
    navHidden: document.querySelector('#bottomNav').hidden,
    viewportRight: document.documentElement.clientWidth
  })`);
  result = JSON.parse(result);
  assert(result.questions === 20, "Mobile shared configuration did not create 20 questions");
  assert(result.scrollWidth === 390, "Mobile test view has horizontal overflow");
  assert(result.questionRight <= result.viewportRight, "Question card exceeds the mobile viewport");
  assert(result.inputRight <= result.viewportRight, "Answer input exceeds the mobile viewport");
  assert(result.navHidden, "Bottom navigation should be hidden during a test");
  await screenshot("/tmp/math-tools-test-mobile.png");

  assert(exceptions.length === 0, `Browser exceptions: ${exceptions.join(", ")}`);
  socket.close();
  console.log(JSON.stringify({
    status: "passed",
    tested: ["refresh-resume", "wrong-book-add", "review-remove", "history", "mobile-layout", "shared-count"],
    screenshots: [
      "/tmp/math-tools-desktop.png",
      "/tmp/math-tools-mobile.png",
      "/tmp/math-tools-test-mobile.png",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
