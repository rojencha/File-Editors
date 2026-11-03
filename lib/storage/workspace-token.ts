const KEY = "fileforge.workspace";

/** Anonymous workspace token: 32 random bytes, generated in the browser, never shown in the UI. */
export function getWorkspaceToken(): string {
  try {
    let t = localStorage.getItem(KEY);
    if (!t || !/^[A-Za-z0-9_-]{32,128}$/.test(t)) {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      t = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      localStorage.setItem(KEY, t);
    }
    return t;
  } catch {
    throw new Error("Browser storage is blocked, so a private workspace can't be created. Allow site data and reload.");
  }
}

export function hasWorkspaceToken(): boolean {
  try {
    return Boolean(localStorage.getItem(KEY));
  } catch {
    return false;
  }
}
