import https from "https";

export interface TelegramMessage {
  chatId: string;
  text: string;
  fromUser: string;
}

export class TelegramSyncGateway {
  private static instance: TelegramSyncGateway;
  private botToken: string = "";
  private isPolling: boolean = false;
  private lastUpdateId: number = 0;
  private onMessageCallback: ((msg: TelegramMessage) => Promise<string>) | null = null;

  private constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || "";
    if (this.botToken) {
      this.startPolling();
    }
  }

  public static getInstance(): TelegramSyncGateway {
    if (!TelegramSyncGateway.instance) {
      TelegramSyncGateway.instance = new TelegramSyncGateway();
    }
    return TelegramSyncGateway.instance;
  }

  public setMessageHandler(cb: (msg: TelegramMessage) => Promise<string>) {
    this.onMessageCallback = cb;
  }

  public setToken(token: string) {
    this.botToken = token.trim();
    if (this.botToken && !this.isPolling) {
      this.startPolling();
    }
  }

  public async sendMessage(chatId: string, text: string): Promise<boolean> {
    if (!this.botToken) return false;

    return new Promise((resolve) => {
      const data = JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      });

      const req = https.request(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data),
          },
        },
        (res) => {
          resolve(res.statusCode === 200);
        }
      );

      req.on("error", () => resolve(false));
      req.write(data);
      req.end();
    });
  }

  private async pollUpdates(): Promise<void> {
    if (!this.botToken) return;

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=20`;
      https.get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", async () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed.ok && Array.isArray(parsed.result)) {
              for (const update of parsed.result) {
                this.lastUpdateId = update.update_id;
                const msg = update.message;
                if (msg && msg.text) {
                  const chatId = String(msg.chat.id);
                  const userText = msg.text;
                  const sender = msg.from?.first_name || "User";

                  if (this.onMessageCallback) {
                    const reply = await this.onMessageCallback({
                      chatId,
                      text: userText,
                      fromUser: sender,
                    });
                    if (reply) {
                      await this.sendMessage(chatId, reply);
                    }
                  } else {
                    await this.sendMessage(
                      chatId,
                      `🌸 *Akari AI Desktop Sync*\n\nReceived: "${userText}"\nI am connected to your desktop!`
                    );
                  }
                }
              }
            }
          } catch (e) {}
          if (this.isPolling) setTimeout(() => this.pollUpdates(), 1000);
        });
      }).on("error", () => {
        if (this.isPolling) setTimeout(() => this.pollUpdates(), 5000);
      });
    } catch (e) {
      if (this.isPolling) setTimeout(() => this.pollUpdates(), 5000);
    }
  }

  public startPolling(): void {
    if (this.isPolling || !this.botToken) return;
    this.isPolling = true;
    console.log("[Telegram Gateway] Mobile Sync polling started.");
    this.pollUpdates();
  }

  public stopPolling(): void {
    this.isPolling = false;
  }
}

export const telegramGateway = TelegramSyncGateway.getInstance();
