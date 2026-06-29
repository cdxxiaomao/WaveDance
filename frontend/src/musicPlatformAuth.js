import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * @typedef {object} NeteaseAuthElements
 * @property {HTMLElement | null} [statusBadge]
 * @property {HTMLElement | null} [qrHint]
 * @property {HTMLImageElement | null} [qrImage]
 * @property {HTMLElement | null} [qrPlaceholder]
 * @property {HTMLElement | null} [refreshQrBtn]
 * @property {HTMLElement | null} [logoutBtn]
 * @property {HTMLElement | null} [profile]
 * @property {HTMLImageElement | null} [avatar]
 * @property {HTMLElement | null} [nickname]
 * @property {HTMLElement | null} [userId]
 */

/**
 * @typedef {object} QqAuthElements
 * @property {HTMLElement | null} [statusBadge]
 * @property {HTMLElement | null} [hint]
 * @property {HTMLElement | null} [playbackWarn]
 * @property {HTMLElement | null} [profile]
 * @property {HTMLImageElement | null} [avatar]
 * @property {HTMLElement | null} [nickname]
 * @property {HTMLElement | null} [userId]
 * @property {HTMLButtonElement | null} [loginBtn]
 * @property {HTMLButtonElement | null} [logoutBtn]
 */

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

/**
 * @param {NeteaseAuthElements} elements
 * @param {{ onToast?: (msg: string) => void; onLoginSuccess?: () => void }} options
 */
export function createNeteaseAuthController(elements, options = {}) {
  const { onToast = () => {}, onLoginSuccess = () => {} } = options;
  /** @type {number | null} */
  let pollTimer = null;
  /** @type {string} */
  let qrKey = "";

  function stopPoll() {
    if (pollTimer != null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function showQrLoading(text) {
    if (elements.qrImage) elements.qrImage.hidden = true;
    if (elements.qrPlaceholder) {
      elements.qrPlaceholder.hidden = false;
      elements.qrPlaceholder.textContent = text;
    }
  }

  function showQrImage(base64) {
    if (!elements.qrImage || !elements.qrPlaceholder) return;
    elements.qrImage.src = `data:image/png;base64,${base64}`;
    elements.qrImage.hidden = false;
    elements.qrPlaceholder.hidden = true;
  }

  function render(status) {
    const loggedIn = Boolean(status?.loggedIn);
    if (loggedIn) {
      stopPoll();
      setBadge(elements.statusBadge, "ok", "已登录");
      if (elements.qrHint) elements.qrHint.textContent = "登录状态已保存";
      if (elements.qrImage) elements.qrImage.hidden = true;
      if (elements.qrPlaceholder) elements.qrPlaceholder.hidden = true;
      if (elements.refreshQrBtn) elements.refreshQrBtn.hidden = true;
      if (elements.logoutBtn) elements.logoutBtn.hidden = false;
    } else {
      setBadge(elements.statusBadge, "idle", "未登录");
      if (elements.qrHint) elements.qrHint.textContent = "使用手机网易云 App 扫码登录";
      if (elements.refreshQrBtn) elements.refreshQrBtn.hidden = false;
      if (elements.logoutBtn) elements.logoutBtn.hidden = true;
    }
    applyProfile(
      elements.profile,
      elements.avatar,
      elements.nickname,
      elements.userId,
      status,
    );
  }

  async function pollOnce() {
    if (!qrKey) return;
    const result = await invoke("netease_qr_poll", { key: qrKey });
    const poll = result && typeof result === "object" ? result : {};
    const code = typeof poll.code === "number" ? poll.code : -1;

    if (poll.loggedIn) {
      stopPoll();
      onToast("网易云音乐登录成功");
      onLoginSuccess();
      return;
    }

    if (code === 802 && elements.qrHint) {
      elements.qrHint.textContent = "已扫码，请在手机上确认";
      setBadge(elements.statusBadge, "pending", "待确认");
    } else if (code === 801) {
      setBadge(elements.statusBadge, "pending", "等待扫码");
    } else if (code === 800) {
      onToast("二维码已过期，正在刷新");
      await startQr();
    }
  }

  async function startQr() {
    stopPoll();
    showQrLoading("正在准备二维码…");
    setBadge(elements.statusBadge, "pending", "登录中");

    const result = await invoke("netease_qr_start");
    const data = result && typeof result === "object" ? result : {};
    qrKey = typeof data.key === "string" ? data.key : "";

    if (typeof data.qrImgBase64 === "string" && data.qrImgBase64) {
      showQrImage(data.qrImgBase64);
      setBadge(elements.statusBadge, "pending", "等待扫码");
    } else {
      showQrLoading("二维码生成失败");
      return;
    }

    pollTimer = window.setInterval(() => {
      pollOnce().catch((err) => {
        console.error(err);
        onToast(String(err));
      });
    }, 2000);
    await pollOnce();
  }

  async function refresh(status) {
    render(status);
    if (!status?.loggedIn && pollTimer == null) {
      await startQr();
    }
  }

  function destroy() {
    stopPoll();
    qrKey = "";
  }

  elements.refreshQrBtn?.addEventListener("click", () => {
    startQr().catch((err) => onToast(String(err)));
  });

  elements.logoutBtn?.addEventListener("click", () => {
    invoke("netease_logout")
      .then(() => {
        onToast("已退出网易云音乐");
        return invoke("music_platform_get_status");
      })
      .then((payload) => {
        const data = payload && typeof payload === "object" ? payload : {};
        return refresh(data.netease);
      })
      .catch((err) => onToast(String(err)));
  });

  return { refresh, destroy, startQr };
}

/**
 * @param {QqAuthElements} elements
 * @param {{ onToast?: (msg: string) => void }} options
 */
export function createQqAuthController(elements, options = {}) {
  const { onToast = () => {} } = options;

  function render(status) {
    const loggedIn = Boolean(status?.loggedIn);
    const playbackReady = status?.playbackKeyReady !== false;

    if (loggedIn) {
      setBadge(elements.statusBadge, playbackReady ? "ok" : "warn", playbackReady ? "已登录" : "账号已同步");
      if (elements.logoutBtn) elements.logoutBtn.hidden = false;
      if (elements.loginBtn) elements.loginBtn.hidden = true;
    } else {
      setBadge(elements.statusBadge, "idle", "未登录");
      if (elements.logoutBtn) elements.logoutBtn.hidden = true;
      if (elements.loginBtn) elements.loginBtn.hidden = false;
    }

    if (elements.playbackWarn) {
      elements.playbackWarn.hidden = !(loggedIn && status?.playbackKeyReady === false);
    }

    applyProfile(
      elements.profile,
      elements.avatar,
      elements.nickname,
      elements.userId,
      status,
    );
  }

  elements.loginBtn?.addEventListener("click", () => {
    invoke("qq_login_open_webview").catch((err) => onToast(String(err)));
  });

  elements.logoutBtn?.addEventListener("click", () => {
    invoke("qq_logout")
      .then(() => {
        onToast("已退出 QQ 音乐");
        return invoke("music_platform_get_status");
      })
      .then((payload) => {
        const data = payload && typeof payload === "object" ? payload : {};
        render(data.qq);
      })
      .catch((err) => onToast(String(err)));
  });

  return {
    refresh: render,
    destroy() {},
  };
}

/**
 * @param {{ onToast?: (msg: string) => void }} options
 */
export function listenPlatformAuthEvents(options = {}) {
  const { onToast = () => {}, onQqFinished, onNeteaseFinished } = options;

  listen("qq-login-finished", (event) => {
    const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
    if (payload.ok) {
      if (payload.partial) {
        onToast("QQ 音乐账号已同步，播放授权可能未就绪");
      } else {
        onToast("QQ 音乐登录成功");
      }
    } else if (payload.error) {
      onToast(String(payload.error));
    }
    onQqFinished?.();
  }).catch(console.error);

  listen("netease-login-finished", (event) => {
    const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
    if (payload.ok) {
      onToast("网易云音乐登录成功");
    } else if (payload.error) {
      onToast(String(payload.error));
    }
    onNeteaseFinished?.();
  }).catch(console.error);
}
