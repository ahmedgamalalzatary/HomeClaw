import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";
import type { proto } from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import type { MessageHandler, WhatsAppClient } from "./client.js";
import type { Logger } from "../../core/logger.js";
import { extractTextFromBaileysMessage } from "./baileys-parser.js";

type WebMessageInfo = proto.IWebMessageInfo

export class BaileysClient implements WhatsAppClient {
  private currentStatus = "disconnected";
  private onMessage: MessageHandler | null = null;
  private socket: ReturnType<typeof makeWASocket> | null = null;
  private readonly composingRefreshMs = 9000;
  private readonly seenMessageIds = new Set<string>();
  private readonly maxSeenMessageIds = 5000;
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectInFlight = false
  private reconnectAttempt = 0
  private readonly reconnectBaseDelayMs = 2000
  private readonly reconnectMaxDelayMs = 30000
  private readonly reconnectJitterMs = 500

  constructor(
    private readonly authPath: string,
    private readonly logger?: Logger
  ) { }

  async start(onMessage: MessageHandler): Promise<void> {
    this.onMessage = onMessage;
    await this.connect();
  }

  async sendText(chatId: string, text: string): Promise<void> {
    if (!this.socket) {
      throw new Error("WhatsApp socket is not connected.")
    }
    await this.safeSendPresenceUpdate("paused", chatId)
    await this.socket.sendMessage(chatId, { text })
  }
  status(): string {
    return this.currentStatus;
  }

  private async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      markOnlineOnConnect: false
    });
    this.socket = sock;

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", async (update) => {
      const { connection } = update;
      if (update.qr) {
        qrcode.generate(update.qr, { small: true });
        await this.logger?.info("Scan the QR code shown above to pair WhatsApp.");
      }

      if (connection === "open") {
        this.currentStatus = "connected";
        this.resetReconnectState()
        await this.logger?.info("WhatsApp connection opened.");
      }

      if (connection === "close") {
        this.currentStatus = "disconnected";
        await this.logger?.warn("WhatsApp connection closed. Reconnecting...");
        this.socket?.ev.removeAllListeners("creds.update");
        this.socket?.ev.removeAllListeners("connection.update");
        this.socket?.ev.removeAllListeners("messages.upsert");
        this.socket = null;
        this.scheduleReconnect()
      }
    });

    sock.ev.on("messages.upsert", async (event) => {
      await this.logger?.info(
        `messages.upsert type=${String(event?.type)} count=${event?.messages?.length ?? 0}`
      );

      if (event.type !== "notify" && event.type !== "append") {
        return;
      }

      for (const message of event.messages ?? []) {
        await this.handleIncomingMessage(message);
      }
    });
  }

  private async handleIncomingMessage(message: WebMessageInfo): Promise<void> {
    const onMessage = this.onMessage
    if (!onMessage) {
      return;
    }

    const remoteJid = message?.key?.remoteJid;
    const fromMe = Boolean(message?.key?.fromMe);
    if (!remoteJid || fromMe) {
      await this.logger?.info(
        `skip message: remoteJid=${String(remoteJid)} fromMe=${String(fromMe)}`
      );
      return;
    }

    // DM only for MVP.
    const isDirectMessage =
      remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@lid");
    if (!isDirectMessage) {
      await this.logger?.info(`skip non-dm message: remoteJid=${remoteJid}`);
      return;
    }

    const messageId = message?.key?.id as string | undefined
    if (messageId && this.isDuplicateMessageId(messageId)) {
      await this.logger?.info(`skip duplicate message id=${messageId}`)
      return
    }

    await this.safeMarkAsRead(message)

    const text = extractTextFromBaileysMessage(message);
    if (!text) {
      await this.logger?.info(`skip non-text message: remoteJid=${remoteJid}`);
      return;
    }

    const timestamp = message?.messageTimestamp;
    const receivedAt = timestamp
      ? new Date(Number(timestamp) * 1000).toISOString()
      : new Date().toISOString();

    await this.withComposingPresence(remoteJid, async () => {
      await onMessage({
        chatId: remoteJid,
        senderId: (message?.key?.participant as string | undefined) ?? remoteJid,
        text,
        receivedAt
      })
    })
  }

  private isDuplicateMessageId(messageId: string): boolean {
    if (this.seenMessageIds.has(messageId)) {
      return true
    }

    this.seenMessageIds.add(messageId)
    if (this.seenMessageIds.size > this.maxSeenMessageIds) {
      const oldest = this.seenMessageIds.values().next().value as string | undefined
      if (oldest) {
        this.seenMessageIds.delete(oldest)
      }
    }
    return false
  }

  private async safeMarkAsRead(message: WebMessageInfo): Promise<void> {
    const key = message?.key
    const sock = this.socket
    if (!sock || !key) {
      return
    }

    try {
      await sock.readMessages([key])
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error)
      await this.logger?.warn(
        `Failed to mark message as read for chatId=${String(key?.remoteJid)}: ${messageText}`
      )
    }
  }

  private async withComposingPresence(
    chatId: string,
    task: () => Promise<void>
  ): Promise<void> {
    await this.safeSendPresenceUpdate("composing", chatId)

    const composingRefresh = setInterval(() => {
      void this.safeSendPresenceUpdate("composing", chatId)
    }, this.composingRefreshMs)

    try {
      await task()
    } finally {
      clearInterval(composingRefresh)
      await this.safeSendPresenceUpdate("paused", chatId)
    }
  }

  private async safeSendPresenceUpdate(
    presence: "composing" | "paused",
    chatId: string
  ): Promise<void> {
    const sock = this.socket
    if (!sock) {
      return
    }

    try {
      await sock.sendPresenceUpdate(presence, chatId)
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error)
      await this.logger?.warn(
        `Failed to send presence=${presence} for chatId=${chatId}: ${messageText}`
      )
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.reconnectInFlight) {
      return
    }

    const nextAttempt = this.reconnectAttempt + 1
    const delayMs = this.computeReconnectDelayMs(nextAttempt)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.runReconnectAttempt()
    }, delayMs)

    void this.logger?.warn(
      `WhatsApp reconnect scheduled attempt=${nextAttempt} delayMs=${delayMs}`
    )
  }

  private async runReconnectAttempt(): Promise<void> {
    if (this.reconnectInFlight) {
      return
    }
    this.reconnectInFlight = true
    this.reconnectAttempt += 1
    let failed = false
    try {
      await this.connect()
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error)
      await this.logger?.error(`Reconnection failed: ${messageText}`)
      failed = true
    } finally {
      this.reconnectInFlight = false
    }

    if (failed) {
      this.scheduleReconnect()
    }
  }

  private computeReconnectDelayMs(attempt: number): number {
    const exponential = this.reconnectBaseDelayMs * 2 ** Math.max(0, attempt - 1)
    const baseDelay = Math.min(this.reconnectMaxDelayMs, exponential)
    const jitter = Math.floor(Math.random() * this.reconnectJitterMs)
    return baseDelay + jitter
  }

  private resetReconnectState(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.reconnectInFlight = false
    this.reconnectAttempt = 0
  }
}
