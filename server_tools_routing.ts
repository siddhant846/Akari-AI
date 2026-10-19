import { Type } from "@google/genai";

export type ToolCategory = "browser" | "files" | "system" | "google" | "search" | "coding" | "mobile";

export const CORE_TOOLS: any[] = [
  {
                  name: "saveCustomMemory",
                  description: "Allows Akari to immediately save a piece of critical user information to her persistent memory core.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      category: {
                        type: Type.STRING,
                        description: "The memory category.",
                        enum: ["identity", "preference", "goal", "project", "relationship", "emotional", "behavior"]
                      },
                      text: {
                        type: Type.STRING,
                        description: "Precise third-person statement."
                      }
                    },
                    required: ["category", "text"]
                  }
                },
  {
                  name: "setReminder",
                  description: "Schedule a timed reminder. Akari will notify the user when the time is up. Use when the user says 'remind me to X in Y minutes/hours'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      text: {
                        type: Type.STRING,
                        description: "The reminder message to deliver."
                      },
                      minutes: {
                        type: Type.NUMBER,
                        description: "Number of minutes from now to fire the reminder."
                      }
                    },
                    required: ["text", "minutes"]
                  }
                },
  {
                  name: "listReminders",
                  description: "List all pending reminders the user has set.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
  {
                  name: "cancelReminder",
                  description: "Cancel a specific reminder by its ID.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      id: {
                        type: Type.STRING,
                        description: "The reminder ID to cancel."
                      }
                    },
                    required: ["id"]
                  }
                },
  {
                  name: "openApplication",
                  description: "Open any desktop application natively on Windows OS (e.g. WhatsApp, YouTube, Spotify, Discord, Telegram, VS Code, Notepad, Calculator, File Explorer, Task Manager, Steam, Netflix, Camera, Settings, CMD, PowerShell, Word, Excel). Only open when user asks.",
                  parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING, description: "Application name, e.g. 'whatsapp', 'youtube', 'spotify', 'discord', 'telegram', 'vscode', 'notepad', 'calculator', 'steam'." } }, required: ["name"] }
                },
  {
                  name: "closeApplication",
                  description: "Close a running desktop application by name.",
                  parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING, description: "Application name." }, force: { type: Type.BOOLEAN, description: "Force close (default false)." } }, required: ["name"] }
                },
  {
                  name: "switchApplication",
                  description: "Switch to a named application window, or cycle Alt+Tab if no title given.",
                  parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING, description: "Window title to switch to." } } }
                },
  {
                  name: "volumeUp",
                  description: "Increase system volume.",
                  parameters: { type: Type.OBJECT, properties: { amount: { type: Type.NUMBER, description: "Step amount 0-1 (default 0.1)." } } }
                },
  {
                  name: "volumeDown",
                  description: "Decrease system volume.",
                  parameters: { type: Type.OBJECT, properties: { amount: { type: Type.NUMBER, description: "Step amount 0-1 (default 0.1)." } } }
                },
  {
                  name: "setVolume",
                  description: "Set system volume to a specific percentage.",
                  parameters: { type: Type.OBJECT, properties: { percent: { type: Type.NUMBER, description: "Volume percentage 0-100." } }, required: ["percent"] }
                },
  {
                  name: "muteToggle",
                  description: "Toggle mute/unmute on the system volume.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
  {
                  name: "takeScreenshot",
                  description: "Capture the full screen. Optionally include base64 image data.",
                  parameters: { type: Type.OBJECT, properties: { include_image: { type: Type.BOOLEAN, description: "Include base64 JPEG image (default false)." }, max_dim: { type: Type.INTEGER, description: "Max image dimension (default 1280)." } } }
                },
  {
                  name: "analyzeScreenshot",
                  description: "Take a screenshot and run OCR to extract visible text from the screen.",
                  parameters: { type: Type.OBJECT, properties: { max_chars: { type: Type.INTEGER, description: "Max OCR chars (default 1500)." } } }
                },
];

export const BROWSER_TOOLS: any[] = [
  {
                  name: "desktopBrowserOpen",
                  description: "Open a URL in the desktop Playwright automation browser (real Chromium, separate from holographic UI).",
                  parameters: { type: Type.OBJECT, properties: { url: { type: Type.STRING, description: "URL to open." } }, required: ["url"] }
                },
  {
                  name: "desktopBrowserSearch",
                  description: "Search within the desktop automation browser.",
                  parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING, description: "Search query." }, engine: { type: Type.STRING, description: "Engine: google, youtube, github, duckduckgo, bing." } }, required: ["query"] }
                },
  {
                  name: "desktopBrowserClick",
                  description: "Click an element in the desktop automation browser by CSS selector or text.",
                  parameters: { type: Type.OBJECT, properties: { selector: { type: Type.STRING, description: "CSS selector." }, text: { type: Type.STRING, description: "Text to find and click." } } }
                },
  {
                  name: "desktopBrowserType",
                  description: "Type text into the active element in the desktop automation browser.",
                  parameters: { type: Type.OBJECT, properties: { text: { type: Type.STRING, description: "Text to type." }, selector: { type: Type.STRING, description: "Optional CSS selector for a specific input." }, clear: { type: Type.BOOLEAN, description: "Clear before typing (default true)." } }, required: ["text"] }
                },
  {
                  name: "desktopBrowserGoBack",
                  description: "Navigate back in the desktop automation browser history.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
  {
                  name: "desktopBrowserGoForward",
                  description: "Navigate forward in the desktop automation browser history.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
  {
                  name: "desktopBrowserScroll",
                  description: "Scroll the desktop automation browser page.",
                  parameters: { type: Type.OBJECT, properties: { direction: { type: Type.STRING, description: "Scroll direction: up or down." }, amount: { type: Type.INTEGER, description: "Pixels to scroll (default 500)." } } }
                },
  {
                  name: "desktopBrowserReadText",
                  description: "Read the visible text content of the current page in the desktop automation browser. Use when user asks 'what does this page say' or 'read this page'.",
                  parameters: { type: Type.OBJECT, properties: { max_chars: { type: Type.INTEGER, description: "Max chars to return (default 4000)." } } }
                },
  {
                  name: "desktopBrowserGetLinks",
                  description: "Extract all visible hyperlinks from the current page in the desktop automation browser.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
  {
                  name: "browserMediaControl",
                  description: "Controls ongoing video/audio stream media properties on YouTube, like play, pause, volume, mute, skip, and fullscreen.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "The media controller command operation.",
                        enum: ["play", "pause", "volume", "fullscreen", "exit_fullscreen", "mute", "unmute", "skip"]
                      },
                      value: {
                        type: Type.INTEGER,
                        description: "The value parameter; only relevant for set volume level, e.g. 50 for fifty percent."
                      }
                    },
                    required: ["action"]
                  }
                },
  {
                  name: "browserTabAction",
                  description: "Performs standard browser-tab actions: open new tab, close a tab, or switch index values.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "Tab action instruction.",
                        enum: ["new", "close", "switch"]
                      },
                      tabId: {
                        type: Type.STRING,
                        description: "The tab identifier string if closing or switching."
                      },
                      url: {
                        type: Type.STRING,
                        description: "The initial starting URL if creating a new tab."
                      }
                    },
                    required: ["action"]
                  }
                },
];

export const FILES_TOOLS: any[] = [
  {
                  name: "createFile",
                  description: "Create a new text file with optional content. Scoped to safe folders (Desktop, Documents, Downloads, etc.).",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "File path." }, content: { type: Type.STRING, description: "File content (default empty)." }, overwrite: { type: Type.BOOLEAN, description: "Overwrite if exists (default false)." } }, required: ["path"] }
                },
  {
                  name: "readFile",
                  description: "Read the contents of a text file.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "File path." }, max_chars: { type: Type.INTEGER, description: "Max chars to return (default 8000)." } }, required: ["path"] }
                },
  {
                  name: "renameFile",
                  description: "Rename a file.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "Current file path." }, new_name: { type: Type.STRING, description: "New file name." } }, required: ["path", "new_name"] }
                },
  {
                  name: "deleteFile",
                  description: "Delete a file. Sends to Recycle Bin by default (safe). Use permanent=true for hard delete.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "File path." }, permanent: { type: Type.BOOLEAN, description: "Permanently delete (default false)." } }, required: ["path"] }
                },
  {
                  name: "moveFile",
                  description: "Move a file to a new location.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "Source file path." }, destination: { type: Type.STRING, description: "Destination path or folder." } }, required: ["path", "destination"] }
                },
  {
                  name: "openFolder",
                  description: "Open a folder in File Explorer. Supports aliases: desktop, documents, downloads, pictures, music, videos, home.",
                  parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING, description: "Folder name or alias." }, path: { type: Type.STRING, description: "Full path if no alias." } } }
                },
  {
                  name: "listFiles",
                  description: "List files in a folder.",
                  parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING, description: "Folder name or alias." }, path: { type: Type.STRING, description: "Full path." }, pattern: { type: Type.STRING, description: "Glob pattern (default '*')." } } }
                },
  {
                  name: "searchFiles",
                  description: "Search for files by name glob or extension under a folder.",
                  parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING, description: "Filename glob (e.g. '*.py')." }, extension: { type: Type.STRING, description: "File extension (e.g. 'py')." }, folder: { type: Type.STRING, description: "Folder to search (default home)." }, limit: { type: Type.INTEGER, description: "Max results (default 100)." } } }
                },
  {
                  name: "openFile",
                  description: "Open any file (PowerPoint .pptx, Word .docx, PDF, image, Excel .xlsx, etc.) with its default Windows application or reveal it in File Explorer. Supports fuzzy search by filename across Desktop, Downloads, and Documents.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "Full or relative path to the file." }, name: { type: Type.STRING, description: "Filename or keyword to search for (e.g. 'presentation', 'Akari_AI_Demo.pptx')." }, reveal_in_explorer: { type: Type.BOOLEAN, description: "If true, opens File Explorer with the file selected/highlighted instead of directly launching." } } }
                },
];

export const SYSTEM_TOOLS: any[] = [
  {
                  name: "systemInfo",
                  description: "Get system resource usage: CPU %, RAM %, disk usage, uptime, OS info.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
  {
                  name: "gpuInfo",
                  description: "Get NVIDIA GPU stats: utilization %, VRAM usage, temperature. Graceful fallback if no NVIDIA GPU.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
  {
                  name: "temperatureInfo",
                  description: "Get available temperature readings (CPU, GPU, etc.). Best-effort on Windows.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
  {
                  name: "brightnessUp",
                  description: "Increase screen brightness by a step (default 10%). Use when user says 'increase brightness' or 'make screen brighter'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      amount: { type: Type.NUMBER, description: "Percentage to increase (default 10)." }
                    }
                  }
                },
  {
                  name: "brightnessDown",
                  description: "Decrease screen brightness by a step (default 10%). Use when user says 'decrease brightness' or 'dim screen'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      amount: { type: Type.NUMBER, description: "Percentage to decrease (default 10)." }
                    }
                  }
                },
  {
                  name: "setBrightness",
                  description: "Set screen brightness to an exact level. Use when user says 'set brightness to 50%' or 'brightness 80'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      percent: { type: Type.NUMBER, description: "Target brightness 0-100." }
                    },
                    required: ["percent"]
                  }
                },
  {
                  name: "enableAutoStart",
                  description: "Enable AKARI to launch automatically when Windows starts. Creates a silent startup entry.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
  {
                  name: "disableAutoStart",
                  description: "Disable AKARI auto-start on Windows login. Removes the startup entry.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
  {
                  name: "getAutoStartStatus",
                  description: "Check whether AKARI is currently configured to auto-start on Windows login.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
  {
                  name: "requestPowerAction",
                  description: "FIRST STEP for dangerous power actions. Generates a confirmation token. Tell the user verbally, then call executePowerAction with the token if they confirm. Actions: shutdown, restart, sleep, lock.",
                  parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, description: "Power action: shutdown, restart, sleep, lock." } }, required: ["action"] }
                },
  {
                  name: "executePowerAction",
                  description: "SECOND STEP: execute a previously-confirmed power action. Requires a valid execute_token from requestPowerAction. Single-use, expires in 60 seconds.",
                  parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, description: "The confirmed power action." }, execute_token: { type: Type.STRING, description: "Confirmation token from requestPowerAction." } }, required: ["action", "execute_token"] }
                },
  {
                  name: "minimizeWindow",
                  description: "Minimize the active window or a named window.",
                  parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING, description: "Window title to match (optional, defaults to active window)." } } }
                },
  {
                  name: "maximizeWindow",
                  description: "Maximize the active window or a named window.",
                  parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING, description: "Window title to match." } } }
                },
  {
                  name: "closeWindow",
                  description: "Close the active window or a named window.",
                  parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING, description: "Window title to match." } } }
                },
  {
                  name: "copySelected",
                  description: "Copy selected text: sends Ctrl+C and reads the clipboard.",
                  parameters: { type: Type.OBJECT, properties: { wait: { type: Type.NUMBER, description: "Seconds to wait after Ctrl+C (default 0.35)." } } }
                },
  {
                  name: "pasteClipboard",
                  description: "Paste text into the active input. Writes text to clipboard then sends Ctrl+V.",
                  parameters: { type: Type.OBJECT, properties: { text: { type: Type.STRING, description: "Text to paste. If omitted, pastes current clipboard." } } }
                },
  {
                  name: "getClipboard",
                  description: "Read the current clipboard text content.",
                  parameters: { type: Type.OBJECT, properties: { max_chars: { type: Type.INTEGER, description: "Max chars (default 1000)." } } }
                },
  {
                  name: "clearClipboard",
                  description: "Empty the clipboard.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
  {
                  name: "readScreen",
                  description: "OCR the active window and return its title plus visible text.",
                  parameters: { type: Type.OBJECT, properties: { max_chars: { type: Type.INTEGER, description: "Max OCR chars (default 1500)." } } }
                },
  {
                  name: "saveScreenshot",
                  description: "Save a screenshot to Pictures/AkariScreenshots.",
                  parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING, description: "Optional filename prefix." } } }
                },
  {
                  name: "shutdownAkari",
                  description: "Gracefully shut down AKARI agent and server. Use only when user explicitly asks to close AKARI. Requires confirmation token from requestTerminalAction.",
                  parameters: { type: Type.OBJECT, properties: { execute_token: { type: Type.STRING, description: "Confirmation token from requestTerminalAction." } }, required: ["execute_token"] }
                },
  {
                  name: "cameraList",
                  description: "List available webcam devices on this computer. Use when the user asks what cameras are available or before turning a camera on.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
  {
                  name: "cameraOn",
                  description: "Turn the webcam ON in a floating viewer window. Use when user says 'camera on karo', 'webcam chalao', 'kamera kholo'. Optionally pass a specific device index.",
                  parameters: { type: Type.OBJECT, properties: { device: { type: Type.STRING, description: "Camera device index or path (default '0')." } } }
                },
  {
                  name: "cameraOff",
                  description: "Turn the webcam OFF and free the device for other applications. Use when user says 'camera band karo', 'webcam band karo'.",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
  {
                  name: "osType",
                  description: "Type text at the current cursor position using native OS keyboard events. Use for native apps (VS Code, terminal) or when Playwright DOM typing fails. Example: type code into a code editor.",
                  parameters: { type: Type.OBJECT, properties: { text: { type: Type.STRING, description: "Text to type at the current cursor position." } }, required: ["text"] }
                },
  {
                  name: "osPress",
                  description: "Press a specific keyboard key at native OS level. Example: osPress(key='enter'), osPress(key='ctrl+c'), osPress(key='alt+tab').",
                  parameters: { type: Type.OBJECT, properties: { key: { type: Type.STRING, description: "Key or key combination to press. Examples: 'enter', 'ctrl+c', 'alt+tab', 'escape', 'tab', 'f5'." } }, required: ["key"] }
                },
  {
                  name: "osClick",
                  description: "Click at a specific screen coordinate or perform a right-click at native OS level. Example: osClick(x=500, y=300) or osClick(x=500, y=300, button='right').",
                  parameters: { type: Type.OBJECT, properties: { x: { type: Type.INTEGER, description: "X coordinate on screen." }, y: { type: Type.INTEGER, description: "Y coordinate on screen." }, button: { type: Type.STRING, description: "Mouse button: 'left' (default) or 'right'." } }, required: ["x", "y"] }
                },
];

export const GOOGLE_TOOLS: any[] = [
  {
              name: "searchGoogleMaps",
                  description: "Searches Google Maps for local businesses, places, or directions near the user (e.g. 'restaurants near me', 'cafes near me'), opens Google Maps in their browser with pins and reviews, and summarizes the results.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: {
                        type: Type.STRING,
                        description: "Google Maps query, e.g. 'restaurants near me', 'coffee shops near me', 'bakeries in Pune'."
                      }
                    },
                    required: ["query"]
                  }
                },
  {
                  name: "playYouTubeVideo",
                  description: "Search, select, and directly play a YouTube video or song in the browser. Use when user says 'play X on YouTube', 'play song X', 'play lofi beats', 'start playing video'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: { type: Type.STRING, description: "Search keywords or song title to play." },
                      index: { type: Type.INTEGER, description: "Video number to pick (1 for 1st video, 2 for 2nd, default 1)." },
                      url: { type: Type.STRING, description: "Direct YouTube video URL if known." }
                    }
                  }
                },
  {
                  name: "sendEmail",
                  description: "Send an email or create an email draft. Supports direct sending via Gmail API/SMTP or opens Gmail web compose/default mail client with recipient, subject, and body pre-filled. Use when user says 'send email to X', 'email bhej de', 'write email to X'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      to: { type: Type.STRING, description: "Recipient email address (e.g. 'alex@example.com')." },
                      subject: { type: Type.STRING, description: "Subject of the email." },
                      body: { type: Type.STRING, description: "Main message body content." },
                      cc: { type: Type.STRING, description: "Optional CC email address." }
                    },
                    required: ["to", "subject", "body"]
                  }
                },
  {
                  name: "getEmails",
                  description: "Fetch and read recent emails from the user's Gmail inbox. Use when user says 'check my emails', 'read inbox', 'koi email aaya kya'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      max_results: { type: Type.INTEGER, description: "Number of emails to return (default 5, max 20)." },
                      query: { type: Type.STRING, description: "Optional search query filter." }
                    }
                  }
                },
  {
                  name: "getCalendarEvents",
                  description: "List upcoming Google Calendar events. Use when user asks 'what's on my calendar', 'mera schedule bata', 'upcoming events'.",
                  parameters: { type: Type.OBJECT, properties: { max_results: { type: Type.INTEGER, description: "Number of events (default 10)." }, days_ahead: { type: Type.INTEGER, description: "Days ahead to check (default 7)." }, show_all: { type: Type.BOOLEAN, description: "Include full details (default false)." } } }
                },
  {
                  name: "createCalendarEvent",
                  description: "Create a Google Calendar event. Use when user says 'meeting schedule kar', 'event bana', 'reminder add kar'.",
                  parameters: { type: Type.OBJECT, properties: { summary: { type: Type.STRING, description: "Event title (required)." }, start_time: { type: Type.STRING, description: "Start time in ISO format, e.g. '2026-07-24T14:00:00'." }, end_time: { type: Type.STRING, description: "End time in ISO format." }, description: { type: Type.STRING, description: "Event description." }, location: { type: Type.STRING, description: "Event location." }, attendees: { type: Type.STRING, description: "Comma-separated email addresses." } }, required: ["summary"] }
                },
  {
                  name: "getTasks",
                  description: "List tasks from Google Tasks. Use when user asks 'meri tasks dikha', 'to-do list bata', 'what tasks do I have'.",
                  parameters: { type: Type.OBJECT, properties: { tasklist: { type: Type.STRING, description: "Task list name (default 'My Tasks')." }, max_results: { type: Type.INTEGER, description: "Max tasks (default 10)." }, show_completed: { type: Type.BOOLEAN, description: "Include completed tasks (default false)." } } }
                },
  {
                  name: "createTask",
                  description: "Create a task in Google Tasks. Use when user says 'task add kar', 'reminder set kar', 'ek kaam yaad rakh'.",
                  parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING, description: "Task title (required)." }, notes: { type: Type.STRING, description: "Task description." }, due: { type: Type.STRING, description: "Due date in ISO format, e.g. '2026-07-30'." }, tasklist: { type: Type.STRING, description: "Task list name (default 'My Tasks')." } }, required: ["title"] }
                },
];

export const SEARCH_TOOLS: any[] = [
  {
                  name: "searchWeb",
                  description: "Search a website engine (google, youtube, github, duckduckgo, bing) and open results in the default browser.",
                  parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING, description: "Search query." }, engine: { type: Type.STRING, description: "Engine name (default 'google')." } }, required: ["query"] }
                },
  {
                  name: "searchWebAnswer",
                  description: "MANDATORY LIVE SEARCH GROUNDING: Searches live sources (Google News, Wikipedia, DuckDuckGo) for real-time facts, current events, scores, weather, prices, election results, who holds a job/title, product releases, laws, or anything with 'latest', 'today', 'now', 'this week', or 'recent'. Cross-references 2-3 independent sources with publisher names and publication timestamps. Always call this before answering any factual or time-sensitive question. Never guess.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: {
                        type: Type.STRING,
                        description: "The specific question, event, topic, score, or entity to look up on live search."
                      }
                    },
                    required: ["query"]
                  }
                },
  {
                  name: "searchGitHub",
                  description: "Search GitHub repositories and open results in the default browser.",
                  parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING, description: "Search query." } }, required: ["query"] }
                },
  {
                  name: "getNews",
                  description: "Fetches live news headlines for briefings and current events. Supports categories: 'top', 'tech', 'world', 'india', 'sports', 'business', or any custom topic. Returns top 5 headlines in one-liner format with publisher name and publication time.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      category: {
                        type: Type.STRING,
                        description: "News category: 'top', 'tech', 'world', 'india', 'sports', 'business', or custom search topic."
                      },
                      count: {
                        type: Type.INTEGER,
                        description: "Number of headlines (default 5, max 10)."
                      }
                    }
                  }
                },
  {
                  name: "getWeather",
                  description: "Get current weather for a location. Use when user asks about weather, temperature, or climate.",
                  parameters: { type: Type.OBJECT, properties: { location: { type: Type.STRING, description: "City name (e.g. 'Mumbai', 'Delhi', 'New York')." } }, required: ["location"] }
                },
];

export const CODING_TOOLS: any[] = [
  {
                  name: "createPythonFile",
                  description: "Create a Python (.py) file with content.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "File path." }, content: { type: Type.STRING, description: "Python code content." }, overwrite: { type: Type.BOOLEAN, description: "Overwrite if exists." } }, required: ["path"] }
                },
  {
                  name: "writeCodeFile",
                  description: "Create a code file in any language with appropriate extension.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "File path." }, content: { type: Type.STRING, description: "Code content." }, language: { type: Type.STRING, description: "Language name (e.g. 'python', 'javascript', 'html')." }, overwrite: { type: Type.BOOLEAN, description: "Overwrite if exists." } }, required: ["path"] }
                },
  {
                  name: "createProjectFolder",
                  description: "Create a project folder structure with optional subfolders and starter files.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "Project root folder path." }, subfolders: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of subfolder names." }, scaffold_standard: { type: Type.BOOLEAN, description: "Create src, tests, docs subfolders." }, files: { type: Type.OBJECT, description: "Object of relative-path -> content for starter files." } }, required: ["path"] }
                },
  {
                  name: "runPythonScript",
                  description: "Execute a Python script and capture stdout, stderr, and exit code. Has a configurable timeout.",
                  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: "Script path." }, args: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Script arguments." }, timeout: { type: Type.INTEGER, description: "Timeout in seconds (default 30)." } }, required: ["path"] }
                },
  {
                  name: "requestTerminalAction",
                  description: "FIRST STEP for terminal commands or package installation. Generates a confirmation token. Tell the user verbally, then call the execution tool if they confirm.",
                  parameters: { type: Type.OBJECT, properties: { command: { type: Type.STRING, description: "Terminal command to run." }, package: { type: Type.STRING, description: "Package name to install." } } }
                },
  {
                  name: "runTerminalCommand",
                  description: "SECOND STEP: execute a previously-confirmed terminal command. Requires a valid execute_token from requestTerminalAction.",
                  parameters: { type: Type.OBJECT, properties: { command: { type: Type.STRING, description: "The confirmed bash command." }, execute_token: { type: Type.STRING, description: "Confirmation token from requestTerminalAction." } }, required: ["command", "execute_token"] }
                },
  {
                  name: "isCommandAllowed",
                  description: "Checks whether a terminal command is allowed by the security blacklist before running. Use to validate a command before execution.",
                  parameters: { type: Type.OBJECT, properties: { command: { type: Type.STRING, description: "The terminal command to check." } }, required: ["command"] }
                },
  {
                  name: "createPresentation",
                  description: "Generate an executive designer-grade multi-slide PowerPoint presentation (.pptx) with curated 60-30-10 palettes, FLOWCHARTS with vector arrow connectors, MULTI-TIER SYSTEM ARCHITECTURE diagrams, REAL DOWNLOADED WEB IMAGES, branching decision logic, metric callouts, speaker notes, and auto-open it in Microsoft PowerPoint. Use when user says 'make a ppt', 'presentation banao', 'create slides on X'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      topic: { type: Type.STRING, description: "The presentation subject or topic." },
                      title: { type: Type.STRING, description: "Main presentation title." },
                      subtitle: { type: Type.STRING, description: "Subtitle or author tagline." },
                      audience: { type: Type.STRING, description: "Target audience (e.g. 'Investors', 'Executive Leadership', 'Students', 'Engineering Team')." },
                      purpose: { type: Type.STRING, description: "Primary goal (e.g. 'Pitch Deck', 'Product Launch', 'Technical Deep-Dive', 'Educational Lecture')." },
                      slides: {
                        type: Type.ARRAY,
                        description: "Optional custom list of slide objects. Layout options: 'flowchart' (connected process pipeline with vector arrows), 'architecture' (multi-tier system diagram), 'image_split' (downloaded web graphic + takeaways), 'decision_flow' (decision diamond + dual paths), 'big_stat', 'cards_3col', 'grid_2x2', 'two_column', 'timeline', 'quote', 'content', 'closing'.",
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            title: { type: Type.STRING },
                            subtitle: { type: Type.STRING },
                            layout: { type: Type.STRING, enum: ["flowchart", "architecture", "image_split", "decision_flow", "big_stat", "cards_3col", "grid_2x2", "two_column", "timeline", "quote", "content", "closing"] },
                            points: { type: Type.ARRAY, items: { type: Type.STRING } },
                            image_query: { type: Type.STRING, description: "Search query to automatically find, download and embed a web photo/diagram on this slide." },
                            notes: { type: Type.STRING }
                          },
                          required: ["title"]
                        }
                      },
                      theme: {
                        type: Type.STRING,
                        description: "Designer 60-30-10 palette: 'tech_obsidian', 'growth_emerald', 'luxe_gold', 'cyber_neon', 'nordic_clean', 'crimson_impact'.",
                        enum: ["tech_obsidian", "growth_emerald", "luxe_gold", "cyber_neon", "nordic_clean", "crimson_impact", "modern_dark", "cyber_cyan", "minimal_white", "corporate_blue", "sunset_gradient", "emerald_green"]
                      },
                      filename: { type: Type.STRING, description: "Optional output filename (e.g. 'AI_Overview.pptx')." },
                      save_folder: { type: Type.STRING, description: "Target folder: 'desktop' (default), 'documents', or custom folder." },
                      open_after: { type: Type.BOOLEAN, description: "Whether to open the presentation in PowerPoint immediately (default true)." }
                    },
                    required: ["topic"]
                  }
                },
  {
                  name: "openPowerPoint",
                  description: "Open Microsoft PowerPoint or view a specific .pptx presentation file. Use when user says 'open PowerPoint', 'open my presentation', 'show my PPT'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      file_path: { type: Type.STRING, description: "Optional specific .pptx file path or filename to open in PowerPoint." }
                    }
                  }
                },
  {
                  name: "readPresentation",
                  description: "Read, inspect, and summarize all slides, titles, and text contents of an existing PowerPoint (.pptx) file.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      file_path: { type: Type.STRING, description: "Path or filename of the .pptx presentation to read." }
                    },
                    required: ["file_path"]
                  }
                },
  {
                  name: "addSlideToPresentation",
                  description: "Append new slides with title and bullet points to an existing .pptx presentation.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      file_path: { type: Type.STRING, description: "Path to the existing .pptx file." },
                      title: { type: Type.STRING, description: "Title for the new slide." },
                      points: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Bullet points for the new slide." }
                    },
                    required: ["file_path", "title", "points"]
                  }
                },
  {
                  name: "createExcelSpreadsheet",
                  description: "Create an Excel spreadsheet (.xlsx) with headers, rows of data, financial tables, and auto-open it in Microsoft Excel. Use when user says 'make an excel sheet', 'excel spreadsheet banao', 'create budget spreadsheet'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "Title or subject of the spreadsheet." },
                      sheet_name: { type: Type.STRING, description: "Worksheet name (default 'Data')." },
                      headers: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of column header names." },
                      rows: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } }, description: "2D Array of rows containing cells." },
                      filename: { type: Type.STRING, description: "Optional output filename (e.g. 'Revenue_2026.xlsx')." },
                      save_folder: { type: Type.STRING, description: "Target folder: 'desktop' (default), 'documents', or custom folder." },
                      open_after: { type: Type.BOOLEAN, description: "Whether to open in Excel immediately (default true)." }
                    }
                  }
                },
  {
                  name: "createDocument",
                  description: "Generate a formatted Word document (.docx) or professional report with headers, bullet points, and auto-open it in Microsoft Word. Use when user says 'write a document', 'create report on X', 'doc banao'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "Main document title." },
                      subtitle: { type: Type.STRING, description: "Document subtitle or author." },
                      sections: {
                        type: Type.ARRAY,
                        description: "List of sections with 'heading' and 'content' or 'points'.",
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            heading: { type: Type.STRING },
                            content: { type: Type.STRING },
                            points: { type: Type.ARRAY, items: { type: Type.STRING } }
                          }
                        }
                      },
                      filename: { type: Type.STRING, description: "Optional filename (e.g. 'Project_Proposal.docx')." },
                      save_folder: { type: Type.STRING, description: "Target folder: 'desktop' (default), 'documents'." },
                      open_after: { type: Type.BOOLEAN, description: "Whether to open in Word immediately (default true)." }
                    },
                    required: ["title"]
                  }
                },
  {
                  name: "analyzeData",
                  description: "Perform statistical analysis on a dataset (CSV, JSON, TSV). Computes summary statistics (mean, median, stdev, quartiles, min/max), column null percentages, unique categories, correlations, and automatic insights.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      file_path: {
                        type: Type.STRING,
                        description: "Path to the dataset file (e.g. 'C:/Users/.../sales.csv' or 'data.json')."
                      }
                    },
                    required: ["file_path"]
                  }
                },
  {
                  name: "createDataChart",
                  description: "Generate an analytical SVG chart (bar chart or line chart) from data labels and numerical values, saving it to Desktop or workspace.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "Title of the chart." },
                      chart_type: { type: Type.STRING, description: "Type of chart: 'bar' or 'line'." },
                      labels: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Labels for each data point or category." },
                      values: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Numerical values for each data point." },
                      save_folder: { type: Type.STRING, description: "Folder to save chart: 'desktop' or 'workspace'." }
                    },
                    required: ["title", "labels", "values"]
                  }
                },
  {
                  name: "searchAndBuildLocalWebsite",
                  description: "Autonomous end-to-end tool: Searches local businesses near the user (e.g. restaurants), audits if they have websites, identifies ones that don't, and automatically generates a stunning animated website for one, immediately launching it in the browser.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      category: {
                        type: Type.STRING,
                        description: "Business category (e.g. 'restaurant', 'cafe', 'bakery', 'salon', 'bar'). Default is 'restaurant'."
                      },
                      location: {
                        type: Type.STRING,
                        description: "Optional city or neighborhood. If omitted, automatically detects user's location."
                      }
                    }
                  }
                },
  {
                  name: "akariBuilderPipeline",
                  description: "Autonomous AKARI-Builder: Discovers local businesses via Google Places API (radius 3 km), verifies they have no official website, builds bespoke animated React/Tailwind websites with real data and concept footer, runs mobile/desktop tests, and produces a report table with outreach message drafts.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      category: {
                        type: Type.STRING,
                        description: "Business category (e.g. 'businesses near me', 'restaurants near me', 'cafes near me')."
                      },
                      radius: {
                        type: Type.INTEGER,
                        description: "Search radius in meters (default 3000)."
                      },
                      location: {
                        type: Type.STRING,
                        description: "Optional city or locality. Automatically detected if omitted."
                      }
                    }
                  }
                },
  {
                  name: "researchDesignReferences",
                  description: "REFERENCE-DRIVEN DESIGN: Researches 3-5 real public design references from Framer Marketplace (framer.com/marketplace), MotionSites (motionsites.ai), and Awwwards fitting the site type (SaaS, store, portfolio, agency, restaurant, gym, clinic, salon, etc.). Analyzes layout patterns, typography hierarchy, 60-30-10 palettes, and motion signatures. Saves and returns a comprehensive STYLE BRIEF to show the user before the full build.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      name: {
                        type: Type.STRING,
                        description: "Name of the business, brand, app, or concept."
                      },
                      category: {
                        type: Type.STRING,
                        description: "Site type (e.g. 'saas', 'store', 'portfolio', 'agency', 'restaurant', 'fitness', 'salon', 'clinic', 'entertainment')."
                      },
                      concept: {
                        type: Type.STRING,
                        description: "Optional description or specific focus of the website."
                      }
                    },
                    required: ["name"]
                  }
                },
  {
                  name: "qualityCheckWebsite",
                  description: "QUALITY CHECK: Inspects a built website at desktop (1440x900) and mobile (390x844) viewports. Takes high-resolution Playwright screenshots, verifies spacing rhythm, typography contrast, and motion smoothness, and generates a Polish Score report.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      slug: {
                        type: Type.STRING,
                        description: "Slug of the website folder (e.g. 'aura-streetwear', 'cinepulse')."
                      },
                      file_path: {
                        type: Type.STRING,
                        description: "Optional path to the index.html file."
                      }
                    }
                  }
                },
  {
                  name: "buildAnimatedWebsite",
                  description: "Generates a complete, beautiful, responsive, animated website tailored to ANY requested domain (movies/films, clothing/brands, shops/ecommerce, gyms/fitness, salons/spas, clinics/medical, tech startups, portfolios, restaurants, or local businesses). Automatically crafts domain-authentic features (e.g. trailer player & watchlist for movies, product cards & cart for shops, workout schedules & tiers for gyms, treatment menus & booking for salons), saves to generated_websites/<slug>/index.html, and launches it in the browser.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      name: {
                        type: Type.STRING,
                        description: "Name of the business, brand, app, or concept (e.g. 'CinePulse - Movie Recommendations', 'Aura Streetwear', 'Iron Titan Gym', 'Luxe Hair & Spa', 'DentalCare')."
                      },
                      category: {
                        type: Type.STRING,
                        description: "Domain or category of the site (e.g. 'movie', 'entertainment', 'shop', 'brand', 'clothing', 'fitness', 'salon', 'clinic', 'tech', 'portfolio', 'restaurant')."
                      },
                      tagline: {
                        type: Type.STRING,
                        description: "Headline or slogan for the hero section."
                      },
                      description: {
                        type: Type.STRING,
                        description: "What the website does or showcases."
                      },
                      address: {
                        type: Type.STRING,
                        description: "Address or city location if a local business."
                      },
                      phone: {
                        type: Type.STRING,
                        description: "Phone number or contact info."
                      },
                      html: {
                        type: Type.STRING,
                        description: "Optional complete custom HTML/CSS/JS code if specifying bespoke layout."
                      }
                    },
                    required: ["name"]
                  }
                },
];

export const MOBILE_TOOLS: any[] = [
  {
    name: "openMobileApp",
    description: "Launch or open an application on the user's Android phone / mobile device directly without searching stores (e.g. WhatsApp, YouTube, Camera, Maps, Spotify, Instagram, Telegram, Settings, Gmail, Calculator, Dialer/Phone, etc.). Use this immediately whenever the user asks to open an app on their phone or is speaking from the mobile app.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: "Friendly name of the mobile application (e.g. 'whatsapp', 'camera', 'youtube', 'maps', 'spotify', 'settings', 'calculator', 'phone', 'instagram')."
        },
        package_name: {
          type: Type.STRING,
          description: "Optional exact Android package identifier (e.g. 'com.whatsapp', 'com.google.android.youtube')."
        }
      },
      required: ["name"]
    }
  },
  {
    name: "mobileTorch",
    description: "Turn the mobile phone's flashlight / torch on or off. Use when the user asks to turn on/off flashlight on their phone.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        enabled: {
          type: Type.BOOLEAN,
          description: "True to turn the flashlight on, false to turn it off."
        }
      },
      required: ["enabled"]
    }
  },
  {
    name: "mobileVibrate",
    description: "Vibrate the mobile phone with a tactile haptic pulse.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        durationMs: {
          type: Type.NUMBER,
          description: "Duration of vibration in milliseconds (default 200)."
        }
      }
    }
  },
  {
    name: "mobileBattery",
    description: "Check the mobile phone's current battery percentage and charging status.",
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: "mobileVolume",
    description: "Adjust the mobile phone's media volume level (0 to 100).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        volume: {
          type: Type.NUMBER,
          description: "Volume percentage from 0 to 100."
        }
      },
      required: ["volume"]
    }
  }
];

export const CATEGORY_MAP: Record<string, any[]> = {
  core: CORE_TOOLS,
  browser: BROWSER_TOOLS,
  files: FILES_TOOLS,
  system: SYSTEM_TOOLS,
  google: GOOGLE_TOOLS,
  search: SEARCH_TOOLS,
  coding: CODING_TOOLS,
  mobile: MOBILE_TOOLS,
};

/**
 * Returns routed tool declarations for Gemini Live.
 * Always includes the small CORE set, plus only the specified relevant categories.
 * Default: CORE + system + search + mobile (~30 tools instead of 116).
 */
export function getRoutedToolDeclarations(categories?: string[] | null): any[] {
  const selected = new Map<string, any>();

  // Always include core tools
  for (const t of CORE_TOOLS) {
    selected.set(t.name, t);
  }

  const ALL_CATEGORIES = ["browser", "files", "system", "google", "search", "coding", "mobile"];
  const requested = categories && categories.length > 0
    ? (categories.includes("all") ? ALL_CATEGORIES : categories.map(c => c.toLowerCase().trim()))
    : ALL_CATEGORIES;

  for (const cat of requested) {
    const list = CATEGORY_MAP[cat];
    if (list) {
      for (const t of list) {
        selected.set(t.name, t);
      }
    }
  }

  return Array.from(selected.values());
}

/**
 * Detects tool categories dynamically from user prompt or command text.
 */
export function detectCategoriesFromText(text: string): ToolCategory[] {
  const lower = (text || "").toLowerCase();
  const cats = new Set<ToolCategory>();

  if (/browse|chrome|webpage|website|url|click|scroll|tab|fills*form/i.test(lower)) {
    cats.add("browser");
  }
  if (/file|folder|directory|workspace|reads*file|creates*file|deletes*file|rename|moves*file/i.test(lower)) {
    cats.add("files");
  }
  if (/volume|mute|sound|audio|brightness|power|shutdown|restart|gpu|cpu|temp|specs|hardware|camera|webcam|window|minimize|maximize|clipboard|copy|paste/i.test(lower)) {
    cats.add("system");
  }
  if (/email|gmail|inbox|sends*email|mail|calendar|schedule|meeting|task|todo|maps|directions|route|restaurant|cafe/i.test(lower)) {
    cats.add("google");
  }
  if (/search|google|news|headline|briefing|weather|forecast|whos*is|stock|price|today|current/i.test(lower)) {
    cats.add("search");
  }
  if (/code|python|script|terminal|cmd|powershell|install|pip|presentation|powerpoint|slides|ppt|excel|sheet|spreadsheet|chart|plot|dataset|csv|builds*website|animateds*website/i.test(lower)) {
    cats.add("coding");
  }

  return Array.from(cats);
}
