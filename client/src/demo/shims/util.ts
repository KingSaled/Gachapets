export function promisify<T extends (...args: any[]) => unknown>(fn: T) {
  return fn;
}
export default { promisify };
