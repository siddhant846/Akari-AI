/**
 * Desktop Pet Overlay Manager
 * Provides true OS-level Always-on-Top Floating Live2D Companion
 * across Electron, Chrome/Edge Document Picture-in-Picture, and Popouts.
 */

let pipWindowInstance: any = null;

export async function openDesktopPetOverlay(
  onCloseCallback?: () => void
): Promise<{ success: boolean; type: "electron" | "pip" | "popup" }> {
  // 1. Check Electron native transparent window first
  const electronAPI = (window as any).electronAPI;
  if (electronAPI && typeof electronAPI.togglePetMode === "function") {
    try {
      await electronAPI.togglePetMode(true);
      return { success: true, type: "electron" };
    } catch (err) {
      console.warn("[DesktopPet] Electron pet mode failed, trying fallback:", err);
    }
  }

  // 2. Check Document Picture-in-Picture API (Chrome 116+, Edge, Opera)
  // This creates a TRUE OS-level always-on-top floating window over all applications!
  if ("documentPictureInPicture" in window) {
    try {
      if (pipWindowInstance && !pipWindowInstance.closed) {
        pipWindowInstance.focus();
        return { success: true, type: "pip" };
      }

      const pipWindow = await (window as any).documentPictureInPicture.requestWindow({
        width: 300,
        height: 400,
      });

      pipWindowInstance = pipWindow;

      // Copy all stylesheets from main window into PiP window
      [...document.styleSheets].forEach((styleSheet) => {
        try {
          const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join("");
          const style = pipWindow.document.createElement("style");
          style.textContent = cssRules;
          pipWindow.document.head.appendChild(style);
        } catch (e) {
          const link = pipWindow.document.createElement("link");
          if (styleSheet.href) {
            link.rel = "stylesheet";
            link.type = styleSheet.type;
            link.media = styleSheet.media;
            link.href = styleSheet.href;
            pipWindow.document.head.appendChild(link);
          }
        }
      });

      // Style PiP document body
      pipWindow.document.title = "Akari AI - Desktop Companion";
      pipWindow.document.body.className =
        "bg-[#030712] text-white overflow-hidden m-0 p-0 select-none flex flex-col items-center justify-center min-h-screen";

      // Mount container for React portal or direct DOM
      const container = pipWindow.document.createElement("div");
      container.id = "akari-pip-root";
      container.style.width = "100vw";
      container.style.height = "100vh";
      container.style.overflow = "hidden";
      container.style.display = "flex";
      container.style.flexDirection = "column";
      container.style.alignItems = "center";
      container.style.justifyContent = "center";
      pipWindow.document.body.appendChild(container);

      pipWindow.addEventListener("pagehide", () => {
        pipWindowInstance = null;
        if (onCloseCallback) onCloseCallback();
      });

      return { success: true, type: "pip" };
    } catch (err) {
      console.warn("[DesktopPet] Document PiP failed, falling back to popup:", err);
    }
  }

  // 3. Fallback: Standalone popup window
  try {
    const left = window.screen.width - 340;
    const top = window.screen.height - 460;
    const popup = window.open(
      "/?mode=pet",
      "AkariDesktopPet",
      `width=300,height=400,left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=no`
    );
    if (popup) {
      popup.focus();
      return { success: true, type: "popup" };
    }
  } catch (err) {
    console.error("[DesktopPet] Failed opening popup window:", err);
  }

  return { success: false, type: "popup" };
}

export function closeDesktopPetOverlay(): void {
  const electronAPI = (window as any).electronAPI;
  if (electronAPI && typeof electronAPI.togglePetMode === "function") {
    electronAPI.togglePetMode(false);
  }

  if (pipWindowInstance && !pipWindowInstance.closed) {
    pipWindowInstance.close();
    pipWindowInstance = null;
  }
}

export function getPipContainer(): HTMLElement | null {
  if (pipWindowInstance && !pipWindowInstance.closed) {
    return pipWindowInstance.document.getElementById("akari-pip-root");
  }
  return null;
}
