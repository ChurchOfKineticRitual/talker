import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

interface VapiMessage {
  type: string;
  endedReason?: string;
  call?: {
    id: string;
    startedAt?: string;
    endedAt?: string;
  };
  artifact?: {
    transcript?: string;
    messages?: Array<{
      role: string;
      message: string;
    }>;
  };
}

interface WebhookPayload {
  message: VapiMessage;
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload: WebhookPayload = await req.json();
    const message = payload.message;

    if (message?.type !== "end-of-call-report") {
      return new Response("OK", { status: 200 });
    }

    const callId = message.call?.id;
    const transcript = message.artifact?.transcript;
    const messages = message.artifact?.messages;

    if (!callId || !transcript) {
      console.log("Missing callId or transcript");
      return new Response("OK", { status: 200 });
    }

    // Generate session ID in VS_DDMmmYY-N format
    const now = new Date();
    const day = now.getDate();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[now.getMonth()];
    const year = now.getFullYear().toString().slice(-2);
    const dateStr = `${day}${month}${year}`;

    // Get store and count existing transcripts for today to determine N
    const store = getStore("transcripts");
    const { blobs } = await store.list({ prefix: `VS_${dateStr}` });
    const sessionNum = blobs.length + 1;
    const sessionId = `VS_${dateStr}-${sessionNum}`;

    const transcriptData = {
      sessionId,
      callId,
      timestamp: now.toISOString(),
      endedReason: message.endedReason,
      transcript,
      messages,
      processed: false,
    };

    // Save to blobs with sessionId as key
    await store.setJSON(sessionId, transcriptData);

    // Also update a "latest" pointer for easy access
    await store.setJSON("_latest", {
      sessionId,
      timestamp: now.toISOString(),
    });

    console.log(`Saved transcript: ${sessionId}`);

    return new Response(JSON.stringify({ success: true, sessionId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response("Internal error", { status: 500 });
  }
};

export const config: Config = {
  path: "/api/transcript",
};
