import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const neteaseStatusBadge = document.querySelector("#neteaseStatusBadge");
const neteaseQrHint = document.querySelector("#neteaseQrHint");
const neteaseQrImage = document.querySelector("#neteaseQrImage");
const neteaseQrPlaceholder = document.querySelector("#neteaseQrPlaceholder");
const neteaseProfile = document.querySelector("#neteaseProfile");
const neteaseAvatar = document.querySelector("#neteaseAvatar");
const neteaseNickname = document.querySelector("#neteaseNickname");
const neteaseUserId = document.querySelector("#neteaseUserId");
const neteaseRefreshQrBtn = document.querySelector("#neteaseRefreshQrBtn");
const neteaseLogoutBtn = document.querySelector("#neteaseLogoutBtn");

const qqStatusBadge = document.querySelector("#qqStatusBadge");
const qqHint = document.querySelector("#qqHint");
const qqPlaybackWarn = document.querySelector("#qqPlaybackWarn");
const qqProfile = document.querySelector("#qqProfile");
const qqAvatar = document.querySelector("#qqAvatar");
const qqNickname = document.querySelector("#qqNickname");
const qqUserId = document.querySelector("#qqUserId");
const qqLoginBtn = document.querySelector("#qqLoginBtn");
const qqLogoutBtn = document.querySelector("#qqLogoutBtn");
const mplToast = document.querySelector("#mplToast");

/** @type {number | null} */
let neteasePollTimer = null;
/** @type {string} */
let neteaseQrKey = "";

function showToast(message) {
  if (!mplToast) return;
  mplToast.textContent = message;
  mplToast.hidden = false;
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    mplToast.hidden = true;
  }, 3200);
}

function setBadge(el, kind, text) {
  if (!el) return;
  el.textContent = text;
  el.className = `mpl-status-badge mpl-status-badge--${kind}`;
}

function applyProfile(profileEl, avatarEl, nicknameEl, userIdEl, status) {
  const loggedIn = Boolean(status?.loggedIn);
  if (profileEl) profileEl.hidden = !loggedIn;
  if (!loggedIn) return;

  const nickname =
    typeof status.nickname === "string" && status.nickname.trim()
      ? status.nickname.trim()
      : "已登录用户";
  const userId =
    typeof status.userId === "string" && status.userId.trim()
      ? status.userId.trim()
      : "";

  if (nicknameEl) nicknameEl.textContent = nickname;
  if (userIdEl) userIdEl.textContent = userId ? `ID：${userId}` : "";

  if (avatarEl) {
    if (typeof status.avatar === "string" && status.avatar.trim()) {
      avatarEl.src = status.avatar.trim();
      avatarEl.hidden = false;
    } else {
      avatarEl.hidden = true;
      avatarEl.removeAttribute("src");
    }
  }
}

function stopNeteasePoll() {
  if (neteasePollTimer != null) {
    window.clearInterval(neteasePollTimer);
    neteasePollTimer = null;
  }
}

function showNeteaseQrLoading(text) {
  if (neteaseQrImage) neteaseQrImage.hidden = true;
  if (neteaseQrPlaceholder) {
    neteaseQrPlaceholder.hidden = false;
    neteaseQrPlaceholder.textContent = text;
  }
}

function showNeteaseQrImage(base64) {
  if (!neteaseQrImage || !neteaseQrPlaceholder) return;
  neteaseQrImage.src = `data:image/png;base64,${base64}`;
  neteaseQrImage.hidden = false;
  neteaseQrPlaceholder.hidden = true;
}

function renderNetease(status) {
  const loggedIn = Boolean(status?.loggedIn);
  if (loggedIn) {
    stopNeteasePoll();
    setBadge(neteaseStatusBadge, "ok", "已登录");
    if (neteaseQrHint) neteaseQrHint.textContent = "登录状态已保存";
    if (neteaseQrImage) neteaseQrImage.hidden = true;
    if (neteaseQrPlaceholder) neteaseQrPlaceholder.hidden = true;
    if (neteaseRefreshQrBtn) neteaseRefreshQrBtn.hidden = true;
    if (neteaseLogoutBtn) neteaseLogoutBtn.hidden = false;
  } else {
    setBadge(neteaseStatusBadge, "idle", "未登录");
    if (neteaseQrHint) neteaseQrHint.textContent = "使用手机网易云 App 扫码登录";
    if (neteaseRefreshQrBtn) neteaseRefreshQrBtn.hidden = false;
    if (neteaseLogoutBtn) neteaseLogoutBtn.hidden = true;
  }
  applyProfile(
    neteaseProfile,
    neteaseAvatar,
    neteaseNickname,
    neteaseUserId,
    status,
  );
}

function renderQq(status) {
  const loggedIn = Boolean(status?.loggedIn);
  const playbackReady = status?.playbackKeyReady !== false;

  if (loggedIn) {
    setBadge(qqStatusBadge, playbackReady ? "ok" : "warn", playbackReady ? "已登录" : "账号已同步");
    if (qqLogoutBtn) qqLogoutBtn.hidden = false;
    if (qqLoginBtn) qqLoginBtn.hidden = true;
  } else {
    setBadge(qqStatusBadge, "idle", "未登录");
    if (qqLogoutBtn) qqLogoutBtn.hidden = true;
    if (qqLoginBtn) qqLoginBtn.hidden = false;
  }

  if (qqPlaybackWarn) {
    qqPlaybackWarn.hidden = !(loggedIn && status?.playbackKeyReady === false);
  }

  applyProfile(qqProfile, qqAvatar, qqNickname, qqUserId, status);
}

async function refreshStatus() {
  const payload = await invoke("music_platform_get_status");
  const data = payload && typeof payload === "object" ? payload : {};
  renderNetease(data.netease);
  renderQq(data.qq);

  if (!data.netease?.loggedIn && neteasePollTimer == null) {
    await startNeteaseQr();
  }
}

async function pollNeteaseOnce() {
  if (!neteaseQrKey) return;
  const result = await invoke("netease_qr_poll", { key: neteaseQrKey });
  const poll = result && typeof result === "object" ? result : {};
  const code = typeof poll.code === "number" ? poll.code : -1;

  if (poll.loggedIn) {
    stopNeteasePoll();
    showToast("网易云音乐登录成功");
    await refreshStatus();
    return;
  }

  if (code === 802 && neteaseQrHint) {
    neteaseQrHint.textContent = "已扫码，请在手机上确认";
    setBadge(neteaseStatusBadge, "pending", "待确认");
  } else if (code === 801) {
    setBadge(neteaseStatusBadge, "pending", "等待扫码");
  } else if (code === 800) {
    showToast("二维码已过期，正在刷新");
    await startNeteaseQr();
  }
}

async function startNeteaseQr() {
  stopNeteasePoll();
  showNeteaseQrLoading("正在准备二维码…");
  setBadge(neteaseStatusBadge, "pending", "登录中");

  const result = await invoke("netease_qr_start");
  const data = result && typeof result === "object" ? result : {};
  neteaseQrKey = typeof data.key === "string" ? data.key : "";

  if (typeof data.qrImgBase64 === "string" && data.qrImgBase64) {
    showNeteaseQrImage(data.qrImgBase64);
    setBadge(neteaseStatusBadge, "pending", "等待扫码");
  } else {
    showNeteaseQrLoading("二维码生成失败");
    return;
  }

  neteasePollTimer = window.setInterval(() => {
    pollNeteaseOnce().catch((err) => {
      console.error(err);
      showToast(String(err));
    });
  }, 2000);
  await pollNeteaseOnce();
}

neteaseRefreshQrBtn?.addEventListener("click", () => {
  startNeteaseQr().catch((err) => showToast(String(err)));
});

neteaseLogoutBtn?.addEventListener("click", () => {
  invoke("netease_logout")
    .then(() => {
      showToast("已退出网易云音乐");
      return refreshStatus();
    })
    .catch((err) => showToast(String(err)));
});

qqLoginBtn?.addEventListener("click", () => {
  invoke("qq_login_open_webview").catch((err) => showToast(String(err)));
});

qqLogoutBtn?.addEventListener("click", () => {
  invoke("qq_logout")
    .then(() => {
      showToast("已退出 QQ 音乐");
      return refreshStatus();
    })
    .catch((err) => showToast(String(err)));
});

listen("qq-login-finished", (event) => {
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  if (payload.ok) {
    if (payload.partial) {
      showToast("QQ 音乐账号已同步，播放授权可能未就绪");
    } else {
      showToast("QQ 音乐登录成功");
    }
  } else if (payload.error) {
    showToast(String(payload.error));
  }
  refreshStatus().catch(console.error);
}).catch(console.error);

listen("netease-login-finished", (event) => {
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  if (payload.ok) {
    showToast("网易云音乐登录成功");
  } else if (payload.error) {
    showToast(String(payload.error));
  }
  refreshStatus().catch(console.error);
}).catch(console.error);

refreshStatus().catch((err) => showToast(String(err)));

window.addEventListener("beforeunload", () => {
  stopNeteasePoll();
});
