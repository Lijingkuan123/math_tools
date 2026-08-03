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
      exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
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
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
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
  await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["*cdn.jsdelivr.net*"] });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.MATH_TOOLS_CONFIG = { supabaseUrl: 'https://mock.supabase.co', supabaseAnonKey: 'mock-key' };
    (() => {
      const currentUser = { id: 'user-current' };
      const groupId = 'group-001';
      const participants = [];
      const attempts = [];

      function query(table) {
        const filters = [];
        let operation = 'select';
        let payload = null;
        const builder = {
          select() { operation = 'select'; return builder; },
          insert(value) { operation = 'insert'; payload = value; return Promise.resolve(insertRows()); },
          eq(field, value) { filters.push([field, value]); return builder; },
          order() { return builder; },
          limit() { return builder; },
          maybeSingle() {
            const rows = selectRows();
            return Promise.resolve({ data: rows[0] || null, error: null });
          },
          then(resolve, reject) { return Promise.resolve(selectRowsResult()).then(resolve, reject); },
        };
        function filtered(rows) {
          return rows.filter((row) => filters.every(([field, value]) => row[field] === value));
        }
        function selectRows() {
          if (table === 'participants') {
            return filtered(participants).map((row) => ({
              ...row,
              practice_groups: { name: '周末练习组', invite_code: 'A1B2C3D4' },
            }));
          }
          if (table === 'attempts') return filtered(attempts);
          return [];
        }
        function selectRowsResult() { return { data: selectRows(), error: null }; }
        function insertRows() {
          const rows = Array.isArray(payload) ? payload : [payload];
          attempts.push(...rows.map((row) => ({ ...row })));
          return { data: rows, error: null };
        }
        return builder;
      }

      const client = {
        auth: {
          getSession: async () => ({ data: { session: { user: currentUser } }, error: null }),
          signInAnonymously: async () => ({ data: { session: { user: currentUser } }, error: null }),
        },
        rpc: async (name, params) => {
          if (!['create_practice_group', 'join_practice_group'].includes(name)) {
            return { data: null, error: new Error('Unexpected RPC') };
          }
          const nickname = params.p_nickname;
          if (!participants.length) {
            participants.push(
              { id: 'participant-current', group_id: groupId, user_id: currentUser.id, nickname, created_at: '2026-08-03T01:00:00Z' },
              { id: 'participant-rain', group_id: groupId, user_id: 'user-rain', nickname: '小雨', created_at: '2026-08-03T01:01:00Z' },
            );
            attempts.push(
              { group_id: groupId, participant_id: 'participant-rain', attempt_type: 'test', question_count: 20, correct_count: 18, accuracy: 90, duration_seconds: 72, completed_at: '2026-08-03T02:00:00Z' },
            );
          } else {
            participants[0].nickname = nickname;
          }
          return { data: [{
            group_id: groupId,
            group_name: params.p_name || '周末练习组',
            invite_code: 'A1B2C3D4',
            participant_id: 'participant-current',
            nickname,
          }], error: null };
        },
        from: query,
      };
      window.supabase = { createClient: () => client };
    })();
  ` });

  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: `${APP_URL}?group=A1B2C3D4&questions=20#home` });
  await wait(800);
  await evaluate("localStorage.clear(); location.reload()");
  await wait(800);

  let result = JSON.parse(await evaluate(`JSON.stringify({
    setupVisible: !document.querySelector('#groupSetup').hidden,
    cloudDisabled: !document.querySelector('#cloudDisabled').hidden,
    rankingVisible: !document.querySelector('#rankingView').hidden,
    invitePrefilled: document.querySelector('#joinInviteCode').value
  })`));
  assert(result.setupVisible && !result.cloudDisabled, "Configured cloud setup did not render");
  assert(result.rankingVisible && result.invitePrefilled === "A1B2C3D4", "Invite link did not open and prefill the join page");

  await evaluate(`(() => {
    document.querySelector('#createGroupName').value = '周末练习组';
    document.querySelector('#createNickname').value = '小明';
    document.querySelector('#createGroupForm').requestSubmit();
  })()`);
  await wait(500);
  await evaluate(`MathToolsCloud.syncAttempt({
    id: 'test-cloud-ui', type: 'test', count: 10, correct: 10,
    accuracy: 100, duration: 35, createdAt: Date.now()
  })`);
  await evaluate("document.querySelector('#refreshRankingButton').click()");
  await wait(400);

  result = JSON.parse(await evaluate(`JSON.stringify({
    dashboardVisible: !document.querySelector('#groupDashboard').hidden,
    inviteCode: document.querySelector('#activeInviteCode').textContent,
    rows: document.querySelectorAll('.leaderboard-row').length,
    urlGroup: new URLSearchParams(location.search).get('group'),
    names: [...document.querySelectorAll('.leaderboard-player strong')].map((item) => item.textContent)
  })`));
  assert(result.dashboardVisible, "Group dashboard did not render after creation");
  assert(result.inviteCode === "A1B2C3D4" && result.urlGroup === "A1B2C3D4", "Invite code was not applied to the URL");
  assert(result.rows === 2 && result.names.includes("小明") && result.names.includes("小雨"), "Leaderboard members are incomplete");

  await evaluate(`[...document.querySelectorAll('.leaderboard-row')]
    .find((row) => row.textContent.includes('小雨')).click()`);
  await wait(120);
  result = JSON.parse(await evaluate(`JSON.stringify({
    historyVisible: !document.querySelector('#memberHistory').hidden,
    heading: document.querySelector('#memberHistoryHeading').textContent,
    records: document.querySelectorAll('#memberHistoryList .history-row').length
  })`));
  assert(result.historyVisible && result.heading.includes("小雨") && result.records === 1, "Member history did not render");
  await screenshot("/tmp/math-tools-ranking-desktop.png");

  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await wait(200);
  result = JSON.parse(await evaluate(`JSON.stringify({
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    tableClientWidth: document.querySelector('.leaderboard-table').clientWidth,
    tableScrollWidth: document.querySelector('.leaderboard-table').scrollWidth,
    navRight: document.querySelector('#bottomNav').getBoundingClientRect().right,
    viewportRight: document.documentElement.clientWidth
  })`));
  assert(result.innerWidth === 390 && result.scrollWidth === 390, "Ranking page has mobile horizontal overflow");
  assert(result.tableClientWidth === result.tableScrollWidth, "Mobile leaderboard still requires horizontal scrolling");
  assert(result.navRight <= result.viewportRight, "Four-item navigation exceeds the mobile viewport");
  await screenshot("/tmp/math-tools-ranking-mobile.png");

  await evaluate("document.querySelector('#leaveGroupButton').click()");
  await wait(80);
  await evaluate("document.querySelector('#confirmAcceptButton').click()");
  await wait(100);
  await evaluate(`(() => {
    document.querySelector('#joinInviteCode').value = 'A1B2C3D4';
    document.querySelector('#joinNickname').value = '小新';
    document.querySelector('#joinGroupForm').requestSubmit();
  })()`);
  await wait(350);
  result = JSON.parse(await evaluate(`JSON.stringify({
    dashboardVisible: !document.querySelector('#groupDashboard').hidden,
    nickname: document.querySelector('#activeNickname').textContent
  })`));
  assert(result.dashboardVisible && result.nickname === "小新", "Invite-code join flow failed");

  assert(exceptions.length === 0, `Browser exceptions: ${exceptions.join(", ")}`);
  socket.close();
  console.log(JSON.stringify({
    status: "passed",
    tested: ["cloud-setup", "invite-open", "group-create", "attempt-sync", "leaderboard", "member-history", "invite-link", "group-join", "mobile-ranking"],
    screenshots: ["/tmp/math-tools-ranking-desktop.png", "/tmp/math-tools-ranking-mobile.png"],
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
