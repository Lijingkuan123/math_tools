"use strict";

(function initializeCloudService(global) {
  const GROUP_KEY = "multiplication-cloud-group-v1";
  const PENDING_KEY = "multiplication-cloud-pending-v1";
  const config = global.MATH_TOOLS_CONFIG || {};
  const configured = Boolean(
    config.supabaseUrl
      && config.supabaseAnonKey
      && global.supabase?.createClient,
  );
  const client = configured
    ? global.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
    : null;

  let user = null;
  let group = readJson(GROUP_KEY, null);

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeGroup(row) {
    return {
      id: row.group_id,
      name: row.group_name,
      inviteCode: row.invite_code,
      participantId: row.participant_id,
      nickname: row.nickname,
    };
  }

  async function ensureAnonymousUser() {
    if (!configured) return null;
    const sessionResult = await client.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    let session = sessionResult.data.session;
    if (!session) {
      const signInResult = await client.auth.signInAnonymously();
      if (signInResult.error) throw signInResult.error;
      session = signInResult.data.session;
    }
    user = session?.user || null;
    if (!user) throw new Error("无法创建匿名用户，请确认 Supabase 已启用匿名登录");
    return user;
  }

  async function validateSavedGroup() {
    if (!group || !user) return;
    const response = await client
      .from("participants")
      .select("id,nickname,group_id,practice_groups(name,invite_code)")
      .eq("id", group.participantId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (response.error) throw response.error;
    if (!response.data) {
      group = null;
      localStorage.removeItem(GROUP_KEY);
      return;
    }
    const groupRecord = Array.isArray(response.data.practice_groups)
      ? response.data.practice_groups[0]
      : response.data.practice_groups;
    group = {
      id: response.data.group_id,
      name: groupRecord?.name || group.name,
      inviteCode: groupRecord?.invite_code || group.inviteCode,
      participantId: response.data.id,
      nickname: response.data.nickname,
    };
    writeJson(GROUP_KEY, group);
  }

  async function init() {
    if (!configured) return snapshot();
    await ensureAnonymousUser();
    await validateSavedGroup();
    if (group) await flushPending();
    return snapshot();
  }

  function snapshot() {
    return {
      configured,
      ready: Boolean(configured && user),
      group: group ? { ...group } : null,
    };
  }

  async function callGroupRpc(name, parameters) {
    await ensureAnonymousUser();
    const response = await client.rpc(name, parameters);
    if (response.error) throw response.error;
    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!row) throw new Error("Supabase 未返回练习组信息");
    group = normalizeGroup(row);
    writeJson(GROUP_KEY, group);
    await flushPending();
    return snapshot();
  }

  async function createGroup(name, nickname) {
    return callGroupRpc("create_practice_group", {
      p_name: name,
      p_nickname: nickname,
    });
  }

  async function joinGroup(inviteCode, nickname) {
    return callGroupRpc("join_practice_group", {
      p_invite_code: inviteCode,
      p_nickname: nickname,
    });
  }

  function leaveGroup() {
    group = null;
    localStorage.removeItem(GROUP_KEY);
    localStorage.removeItem(PENDING_KEY);
    return snapshot();
  }

  function queueAttempt(attempt) {
    const pending = readJson(PENDING_KEY, []);
    if (!pending.some((item) => item.id === attempt.id)) pending.push(attempt);
    writeJson(PENDING_KEY, pending.slice(-100));
  }

  function attemptPayload(attempt) {
    return {
      client_attempt_id: attempt.id,
      group_id: group.id,
      participant_id: group.participantId,
      user_id: user.id,
      attempt_type: attempt.type,
      question_count: attempt.count,
      correct_count: attempt.correct,
      accuracy: attempt.accuracy,
      duration_seconds: attempt.duration,
      completed_at: new Date(attempt.createdAt).toISOString(),
    };
  }

  async function uploadAttempt(attempt) {
    const response = await client.from("attempts").insert(attemptPayload(attempt));
    if (response.error && response.error.code !== "23505") throw response.error;
  }

  async function syncAttempt(attempt) {
    if (!configured || !group) return { synced: false, skipped: true };
    try {
      await ensureAnonymousUser();
      await uploadAttempt(attempt);
      return { synced: true };
    } catch (error) {
      queueAttempt(attempt);
      throw error;
    }
  }

  async function flushPending() {
    if (!configured || !group) return;
    const pending = readJson(PENDING_KEY, []);
    if (!pending.length) return;
    const remaining = [];
    for (const attempt of pending) {
      try {
        await uploadAttempt(attempt);
      } catch (_) {
        remaining.push(attempt);
      }
    }
    if (remaining.length) writeJson(PENDING_KEY, remaining);
    else localStorage.removeItem(PENDING_KEY);
  }

  async function loadGroupData() {
    if (!configured || !group) return { participants: [], attempts: [] };
    await ensureAnonymousUser();
    const [participantsResponse, attemptsResponse] = await Promise.all([
      client
        .from("participants")
        .select("id,nickname,created_at")
        .eq("group_id", group.id)
        .order("created_at", { ascending: true }),
      client
        .from("attempts")
        .select("participant_id,attempt_type,question_count,correct_count,accuracy,duration_seconds,completed_at")
        .eq("group_id", group.id)
        .order("completed_at", { ascending: false })
        .limit(2000),
    ]);
    if (participantsResponse.error) throw participantsResponse.error;
    if (attemptsResponse.error) throw attemptsResponse.error;
    return {
      participants: participantsResponse.data || [],
      attempts: attemptsResponse.data || [],
    };
  }

  global.MathToolsCloud = {
    init,
    snapshot,
    createGroup,
    joinGroup,
    leaveGroup,
    syncAttempt,
    flushPending,
    loadGroupData,
  };
})(window);
