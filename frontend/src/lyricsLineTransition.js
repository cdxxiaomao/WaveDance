/**
 * 独立歌词窗双槽位切换。
 * 驱动方式参考 AMLL / am-lyrics：JS 只同步文本与状态 class，动画与时长全部由 CSS 完成。
 * @param {HTMLElement} root
 * @param {HTMLElement | null} nextEl
 */
export function createLyricsLineTransition(root, nextEl) {
  const stage = root.querySelector(".now-playing-lyrics-current-stage");
  const slotA = root.querySelector('[data-lyric-slot="a"]');
  const slotB = root.querySelector('[data-lyric-slot="b"]');
  if (!stage || !slotA || !slotB) return null;

  /** @type {"a" | "b"} */
  let activeSlotId = "a";
  let displayedCurrent = "";
  let displayedNext = "";
  let animating = false;
  let animGen = 0;
  /** @type {((event: AnimationEvent) => void) | null} */
  let onEnterEnd = null;

  function activeSlot() {
    return activeSlotId === "a" ? slotA : slotB;
  }

  function inactiveSlot() {
    return activeSlotId === "a" ? slotB : slotA;
  }

  function getEffect() {
    const e = root.dataset.lyricsTransition;
    return e && e !== "none" ? e : "none";
  }

  /** @param {HTMLElement} el */
  function clearSlotMotion(el) {
    el.classList.remove("is-entering", "is-exiting");
  }

  /** @param {HTMLElement} el */
  function getVtextEl(el) {
    let v = el.querySelector(".now-playing-lyrics-vtext");
    if (!v) {
      v = document.createElement("span");
      v.className = "now-playing-lyrics-vtext";
      el.replaceChildren(v);
    }
    return v;
  }

  /** @param {HTMLElement} el @param {string} text */
  function setSlotText(el, text) {
    clearSlotMotion(el);
    const v = getVtextEl(el);
    v.replaceChildren();
    if (text) v.textContent = text;
  }

  /** 竖排 vertical-rl 在 grid 重排后宽度偶发塌陷，用实测宽度兜底 */
  function syncVerticalStageMinWidth() {
    if (!root.classList.contains("layout-vertical")) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        let maxW = 0;
        for (const el of [slotA, slotB]) {
          if (el.hidden) continue;
          maxW = Math.max(maxW, el.scrollWidth, el.offsetWidth);
        }
        if (maxW > 0) stage.style.minWidth = `${maxW}px`;
        else stage.style.removeProperty("min-width");
      });
    });
  }

  function clearAnimClasses() {
    stage.classList.remove("is-animating");
    clearSlotMotion(slotA);
    clearSlotMotion(slotB);
  }

  function detachEnterEnd() {
    if (!onEnterEnd) return;
    slotA.removeEventListener("animationend", onEnterEnd);
    slotB.removeEventListener("animationend", onEnterEnd);
    onEnterEnd = null;
  }

  function showSlot(el, visible) {
    el.hidden = !visible;
    if (visible) el.removeAttribute("aria-hidden");
    else el.setAttribute("aria-hidden", "true");
  }

  function deactivateSlot(el) {
    setSlotText(el, "");
    showSlot(el, false);
  }

  /** @param {HTMLElement} outgoing @param {HTMLElement} incoming @param {string} current */
  function completeTransition(outgoing, incoming, current) {
    displayedCurrent = current;
    activeSlotId = activeSlotId === "a" ? "b" : "a";
    deactivateSlot(outgoing);
    clearAnimClasses();
    showSlot(activeSlot(), Boolean(displayedCurrent));
    animating = false;
    detachEnterEnd();
    syncVerticalStageMinWidth();
  }

  function abortAnimation() {
    animGen++;
    detachEnterEnd();
    animating = false;
    deactivateSlot(inactiveSlot());
    clearAnimClasses();
    setSlotText(activeSlot(), displayedCurrent);
    showSlot(activeSlot(), Boolean(displayedCurrent));
  }

  /** @param {string} next */
  function updateNextLine(next) {
    if (!nextEl || next === displayedNext) return;
    displayedNext = next;
    const v = nextEl.querySelector(".now-playing-lyrics-vtext") ?? nextEl;
    v.textContent = next;
    nextEl.hidden = !next;
  }

  /** @param {string} current @param {string} next */
  function commitInstant(current, next) {
    abortAnimation();
    activeSlotId = "a";
    setSlotText(slotA, current);
    setSlotText(slotB, "");
    showSlot(slotA, Boolean(current));
    showSlot(slotB, false);
    displayedCurrent = current;
    updateNextLine(next);
    syncVerticalStageMinWidth();
  }

  /** @param {HTMLElement} outgoing @param {HTMLElement} incoming @param {string} current */
  function watchEnterAnimationEnd(outgoing, incoming, current) {
    detachEnterEnd();
    const gen = animGen;
    onEnterEnd = (event) => {
      if (gen !== animGen) return;
      if (event.target !== incoming) return;
      if (!incoming.classList.contains("is-entering")) return;
      completeTransition(outgoing, incoming, current);
    };
    incoming.addEventListener("animationend", onEnterEnd);
  }

  /** @param {string} current */
  function runCurrentTransition(current) {
    if (animating) abortAnimation();

    const outgoing = activeSlot();
    const incoming = inactiveSlot();
    animGen++;

    stage.classList.add("is-animating");
    setSlotText(incoming, current);
    outgoing.classList.add("is-exiting");
    incoming.classList.add("is-entering");
    showSlot(incoming, true);
    animating = true;
    syncVerticalStageMinWidth();
    watchEnterAnimationEnd(outgoing, incoming, current);
  }

  /**
   * @param {string} current
   * @param {string} next
   * @param {{ instant?: boolean }} [options]
   */
  function apply(current, next, options = {}) {
    const instant = Boolean(options.instant) || getEffect() === "none";

    if (instant) {
      if (current !== displayedCurrent || next !== displayedNext) {
        commitInstant(current, next);
      }
      return;
    }

    updateNextLine(next);
    if (current === displayedCurrent) return;
    runCurrentTransition(current);
  }

  function reset() {
    stage.style.removeProperty("min-width");
    commitInstant("", "");
  }

  return { apply, reset };
}
