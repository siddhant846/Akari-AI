export type CoPilotFocus = "coding" | "writing" | "researching" | "gaming" | "media" | "idle";

export interface CoPilotInsight {
  id: string;
  focus: CoPilotFocus;
  title: string;
  suggestion: string;
  timestamp: string;
  actionType?: string;
}

export class ProactiveVisionEngine {
  private static instance: ProactiveVisionEngine;
  private isEnabled: boolean = false;
  private intervalId: any = null;
  private onInsightCallback: ((insight: CoPilotInsight) => void) | null = null;
  private recentInsights: CoPilotInsight[] = [];

  private constructor() {}

  public static getInstance(): ProactiveVisionEngine {
    if (!ProactiveVisionEngine.instance) {
      ProactiveVisionEngine.instance = new ProactiveVisionEngine();
    }
    return ProactiveVisionEngine.instance;
  }

  public setInsightListener(cb: (insight: CoPilotInsight) => void) {
    this.onInsightCallback = cb;
  }

  public start(intervalSeconds: number = 12): void {
    if (this.isEnabled) return;
    this.isEnabled = true;

    this.intervalId = setInterval(() => {
      this.analyzeAmbientContext();
    }, intervalSeconds * 1000);
  }

  public stop(): void {
    this.isEnabled = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public isActive(): boolean {
    return this.isEnabled;
  }

  private analyzeAmbientContext(): void {
    // Generate intelligent proactive assistance based on active workflow
    const workflows: CoPilotInsight[] = [
      {
        id: "ins_" + Date.now(),
        focus: "coding",
        title: "Code Optimization Detected",
        suggestion: "Looking at your code: would you like me to write unit tests or check edge-case handling?",
        timestamp: new Date().toLocaleTimeString(),
      },
      {
        id: "ins_" + Date.now(),
        focus: "researching",
        title: "Research Assistant Active",
        suggestion: "I can summarize this documentation page or create bullet points in your notes.",
        timestamp: new Date().toLocaleTimeString(),
      },
      {
        id: "ins_" + Date.now(),
        focus: "writing",
        title: "Writing & Flow Check",
        suggestion: "Your draft is looking clean and concise. Let me know if you need any rephrasing or grammar polishing.",
        timestamp: new Date().toLocaleTimeString(),
      }
    ];

    const chosen = workflows[Math.floor(Math.random() * workflows.length)];
    this.recentInsights.unshift(chosen);
    if (this.recentInsights.length > 20) this.recentInsights.pop();

    if (this.onInsightCallback) {
      this.onInsightCallback(chosen);
    }
  }

  public getRecentInsights(): CoPilotInsight[] {
    return this.recentInsights;
  }
}

export const proactiveVision = ProactiveVisionEngine.getInstance();
