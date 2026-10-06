/** Current time in ms. Wrapped so tests (and the in-browser demo) can control it. */
export let now = () => Date.now();
export function setClock(fn: () => number) {
  now = fn;
}
