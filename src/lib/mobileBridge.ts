/**
 * Mobile Native Device Bridge
 * Bridges web UI and audio tool execution to Android native features via AndroidBridge
 * with graceful Web API fallbacks on mobile browsers.
 */

declare global {
  interface Window {
    AndroidBridge?: {
      openApp: (appNameOrPackage: string) => boolean;
      toggleTorch: (enable: boolean) => boolean;
      vibrate: (milliseconds: number) => void;
      getBatteryStatus: () => string;
      setVolume: (percent: number) => boolean;
      showToast: (message: string) => void;
      startVoiceService?: () => boolean;
      stopVoiceService?: () => boolean;
    };
  }
}

export function isAndroidNative(): boolean {
  return typeof window !== "undefined" && Boolean(window.AndroidBridge);
}

export async function openMobileApp(appName: string, packageName?: string): Promise<{ success: boolean; message: string }> {
  const target = packageName || appName;
  if (!target) return { success: false, message: "No app name provided." };

  if (isAndroidNative() && window.AndroidBridge) {
    const launched = window.AndroidBridge.openApp(target);
    if (launched) {
      return { success: true, message: `Opened ${appName} on your mobile phone.` };
    }
  }

  // Fallback for mobile browsers or when native bridge returns false
  const clean = appName.toLowerCase().trim();
  const schemes: Record<string, string> = {
    whatsapp: "whatsapp://",
    youtube: "vnd.youtube:",
    spotify: "spotify:",
    instagram: "instagram://",
    telegram: "tg://",
    chrome: "googlechrome://",
    gmail: "mailto:",
    maps: "geo:0,0?q=",
  };

  if (schemes[clean]) {
    try {
      window.location.href = schemes[clean];
      return { success: true, message: `Attempting to open ${appName} on phone via URL scheme.` };
    } catch (e) {}
  }

  return { success: false, message: `Could not launch ${appName} on this device.` };
}

export async function toggleMobileTorch(enable: boolean): Promise<{ success: boolean; message: string }> {
  if (isAndroidNative() && window.AndroidBridge) {
    const ok = window.AndroidBridge.toggleTorch(enable);
    return {
      success: ok,
      message: ok ? `Mobile flashlight turned ${enable ? "ON" : "OFF"}.` : "Flashlight control not supported on this device."
    };
  }

  // Web API fallback using MediaStream track torch constraint
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() as any;
      if (capabilities && capabilities.torch) {
        await (track as any).applyConstraints({ advanced: [{ torch: enable }] });
        return { success: true, message: `Mobile torch set to ${enable ? "ON" : "OFF"}.` };
      }
    }
  } catch (err) {}

  return { success: false, message: "Torch / Flashlight not available on this device." };
}

export function vibrateMobile(durationMs = 200): { success: boolean; message: string } {
  if (isAndroidNative() && window.AndroidBridge) {
    window.AndroidBridge.vibrate(durationMs);
    return { success: true, message: `Haptic vibration triggered (${durationMs}ms).` };
  }

  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(durationMs);
    return { success: true, message: `Web vibration triggered (${durationMs}ms).` };
  }

  return { success: false, message: "Vibration not supported on this device." };
}

export async function getMobileBattery(): Promise<{ level: number; isCharging: boolean; message: string }> {
  if (isAndroidNative() && window.AndroidBridge) {
    try {
      const raw = window.AndroidBridge.getBatteryStatus();
      const parsed = JSON.parse(raw);
      return {
        level: parsed.level,
        isCharging: parsed.isCharging,
        message: `Phone battery is at ${parsed.level}% (${parsed.isCharging ? "Charging" : "Discharging"}).`
      };
    } catch (e) {}
  }

  if (typeof navigator !== "undefined" && (navigator as any).getBattery) {
    try {
      const b = await (navigator as any).getBattery();
      const level = Math.round(b.level * 100);
      return {
        level,
        isCharging: b.charging,
        message: `Phone battery is at ${level}% (${b.charging ? "Charging" : "Discharging"}).`
      };
    } catch (e) {}
  }

  return { level: -1, isCharging: false, message: "Battery status not available." };
}

export function setMobileVolume(percent: number): { success: boolean; message: string } {
  if (isAndroidNative() && window.AndroidBridge) {
    const ok = window.AndroidBridge.setVolume(percent);
    return {
      success: ok,
      message: ok ? `Mobile volume set to ${percent}%.` : "Could not adjust mobile volume."
    };
  }

  return { success: false, message: "Volume control only supported on native mobile app." };
}

export function showMobileToast(message: string): void {
  if (isAndroidNative() && window.AndroidBridge) {
    window.AndroidBridge.showToast(message);
  }
}

export function ensureBackgroundVoiceService(): boolean {
  if (isAndroidNative() && window.AndroidBridge?.startVoiceService) {
    return window.AndroidBridge.startVoiceService();
  }
  return false;
}

export function stopBackgroundVoiceService(): boolean {
  if (isAndroidNative() && window.AndroidBridge?.stopVoiceService) {
    return window.AndroidBridge.stopVoiceService();
  }
  return false;
}
