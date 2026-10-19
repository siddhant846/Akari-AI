/**
 * Network configuration and host resolution helper for Akari AI.
 * Handles desktop (localhost / relative), mobile (Capacitor), and remote LAN usage.
 */

export function isMobileApp(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as any).Capacitor !== undefined ||
    (window as any).AndroidBridge !== undefined ||
    window.location.protocol === "capacitor:" ||
    (window.location.protocol === "https:" && window.location.hostname === "localhost" && !window.location.port)
  );
}

export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  if (isMobileApp()) return true;
  const ua = window.navigator?.userAgent || "";
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

export function getServerHost(): string {
  if (typeof window === "undefined") return "192.168.1.12:3000";
  const saved = localStorage.getItem("akari_server_host");
  if (saved && saved.trim()) return saved.trim();
  
  if (isMobileApp()) {
    return "192.168.1.12:3000";
  }
  return window.location.host;
}

export function setServerHost(host: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("akari_server_host", host.trim());
  }
}

export function getApiBaseUrl(): string {
  if (typeof window === "undefined") return "";
  if (isMobileApp()) {
    const host = getServerHost();
    return `http://${host}`;
  }
  return "";
}

export function getWsBaseUrl(): string {
  if (typeof window === "undefined") return "ws://192.168.1.12:3000";
  if (isMobileApp()) {
    const host = getServerHost();
    return `ws://${host}`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}
