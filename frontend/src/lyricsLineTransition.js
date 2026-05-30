/**
 * 独立歌词窗：双槽位切换。
 * JS 仅负责文本内容与 class 切换；动画、时长、收尾均由 CSS 驱动。
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
  let onAnimEnd = null;

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

  /** @param {HTMLElement} el @param {string} text */
  function setSlotText(el, text) {
    clearSlotMotion(el);
    el.replaceChildren();
    if (text) el.textContent = text;
  }

  function clearAnimClasses() {
    stage.classList.remove("is-animating");
    clearSlotMotion(slotA);
    clearSlotMotion(slotB);
  }

  function detachAnimEnd() {
    if (!onAnimEnd) return;
    stage.removeEventListener("animationend", onAnimEnd);
    onAnimEnd = null;
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
    detachAnimEnd();
  }

  function abortAnimation() {
    animGen++;
    detachAnimEnd();
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
    nextEl.textContent = next;
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
  }

  /** @param {HTMLElement} outgoing @param {HTMLElement} incoming @param {string} current */
  function watchTransitionEnd(outgoing, incoming, current) {
    detachAnimEnd();
    const gen = animGen;
    onAnimEnd = (event) => {
      if (gen !== animGen) return;
      if (event.target !== stage) return;
      if (event.animationName !== "lyricsTransitionCycle") return;
      completeTransition(outgoing, incoming, current);
    };
    stage.addEventListener("animationend", onAnimEnd);
  }

  /** @param {string} current */
  function runCurrentTransition(current) {
    if (animating) abortAnimation();

    const outgoing = activeSlot();
    const incoming = inactiveSlot();
    animGen++;

    setSlotText(incoming, current);
    showSlot(incoming, true);
    stage.classList.add("is-animating");
    outgoing.classList.add("is-exiting");
    incoming.classList.add("is-entering");
    animating = true;
    watchTransitionEnd(outgoing, incoming, current);
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
    commitInstant("", "");
  }

  return { apply, reset };
}
