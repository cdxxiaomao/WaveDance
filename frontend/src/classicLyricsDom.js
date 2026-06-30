/**
 * 恢复独立歌词窗「经典双行」DOM（与 lyrics.html 初始结构一致）。
 * @param {HTMLElement} root
 */
export function buildClassicLyricsDom(root) {
  root.classList.remove("uses-am-lyrics", "uses-mineradio-lyrics");
  root.replaceChildren();

  const stage = document.createElement("div");
  stage.className = "now-playing-lyrics-current-stage";

  const slotA = document.createElement("div");
  slotA.className = "now-playing-lyrics-line is-current";
  slotA.dataset.lyricSlot = "a";
  const vA = document.createElement("span");
  vA.className = "now-playing-lyrics-vtext";
  slotA.appendChild(vA);

  const slotB = document.createElement("div");
  slotB.className = "now-playing-lyrics-line is-current";
  slotB.dataset.lyricSlot = "b";
  slotB.hidden = true;
  slotB.setAttribute("aria-hidden", "true");
  const vB = document.createElement("span");
  vB.className = "now-playing-lyrics-vtext";
  slotB.appendChild(vB);

  stage.appendChild(slotA);
  stage.appendChild(slotB);

  const next = document.createElement("div");
  next.id = "nowPlayingLyricNext";
  next.className = "now-playing-lyrics-line is-next";
  const vNext = document.createElement("span");
  vNext.className = "now-playing-lyrics-vtext";
  next.appendChild(vNext);

  root.appendChild(stage);
  root.appendChild(next);

  return { nextEl: next };
}
