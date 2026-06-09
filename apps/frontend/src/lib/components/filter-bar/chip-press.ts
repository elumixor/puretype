import type { Project } from "$lib/api";
import { tapMedium } from "$lib/haptics";
import { projects } from "$lib/projects.svelte";
import { chipDrag } from "./chip-drag.svelte";

const MOVE_THRESHOLD = 6;
const LONG_PRESS_MS = 450;

// Chip gesture (mirrors the task row gesture):
//   - tap (quick release, no move)     → toggle the project's task visibility
//   - move before the long-press fires → it's a horizontal bar scroll; bail
//   - hold still LONG_PRESS_MS         → open the context menu
//   - move *after* the menu opened     → close the menu and start a reorder
export function makeChipPressHandler(
  onOpenMenu: (p: Project, x: number, y: number) => void,
  onCloseMenu: () => void,
) {
  return (e: PointerEvent, p: Project) => {
    if (e.button !== undefined && e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const chip = e.currentTarget as HTMLElement;
    let longPressed = false;
    let dragging = false;
    let bailed = false; // early move → treat as a scroll, do nothing
    let down = true;

    const timer = setTimeout(() => {
      if (bailed || !down) return;
      longPressed = true;
      tapMedium();
      onOpenMenu(p, startX, startY);
    }, LONG_PRESS_MS);

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      clearTimeout(timer);
      down = false;
    };

    const onMove = (me: PointerEvent) => {
      if (dragging) return;
      if (Math.hypot(me.clientX - startX, me.clientY - startY) < MOVE_THRESHOLD) return;
      if (!longPressed) {
        // Moved before the long-press → let the bar scroll, drop the gesture.
        bailed = true;
        cleanup();
        return;
      }
      // Long-pressed, then moved → reorder. Swap the menu for a drag.
      dragging = true;
      cleanup();
      onCloseMenu();
      chipDrag.start(p, me.clientX, me.clientY, chip);
    };

    const onUp = () => {
      const tapped = !longPressed && !bailed && !dragging;
      cleanup();
      // Quick tap toggles this project's task visibility. After a long-press the
      // menu stays open; after a drag the reorder already committed.
      if (tapped) projects.toggleMuted(p.id);
    };
    const onCancel = () => cleanup();

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };
}
