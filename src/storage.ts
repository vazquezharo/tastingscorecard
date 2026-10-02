// Keep participation and pending edits usable when a browser blocks storage.
const temporary = new Map<string, string>();
let durable = true;
export const hasDurableStorage = () => durable;
export function readLocal(key: string): string | null {
  if (temporary.has(key)) return temporary.get(key)!;
  try {
    return localStorage.getItem(key);
  } catch {
    durable = false;
    return null;
  }
}
export function writeLocal(key: string, value: string) {
  temporary.set(key, value);
  try {
    localStorage.setItem(key, value);
    temporary.delete(key);
  } catch {
    durable = false;
  }
}
export function removeLocal(key: string) {
  temporary.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    durable = false;
  }
}
