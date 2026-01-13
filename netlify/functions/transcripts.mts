import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("id");
  const latest = url.searchParams.get("latest");
  const unprocessed = url.searchParams.get("unprocessed");
  const markProcessed = url.searchParams.get("markProcessed");

  const store = getStore("transcripts");

  try {
    // Mark a transcript as processed
    if (markProcessed && req.method === "POST") {
      const existing = await store.get(markProcessed, { type: "json" });
      if (existing) {
        existing.processed = true;
        existing.processedAt = new Date().toISOString();
        await store.setJSON(markProcessed, existing);
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    }

    // Get specific transcript by ID
    if (sessionId) {
      const data = await store.get(sessionId, { type: "json" });
      if (!data) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get latest transcript
    if (latest === "true") {
      const latestPointer = await store.get("_latest", { type: "json" });
      if (!latestPointer) {
        return new Response(JSON.stringify({ message: "No transcripts yet" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const data = await store.get(latestPointer.sessionId, { type: "json" });
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get unprocessed transcripts
    if (unprocessed === "true") {
      const { blobs } = await store.list();
      const unprocessedTranscripts = [];

      for (const blob of blobs) {
        if (blob.key.startsWith("_")) continue; // Skip meta keys
        const data = await store.get(blob.key, { type: "json" });
        if (data && !data.processed) {
          unprocessedTranscripts.push(data);
        }
      }

      return new Response(JSON.stringify(unprocessedTranscripts), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // List all transcripts (just metadata)
    const { blobs } = await store.list();
    const transcriptList = blobs
      .filter((b) => !b.key.startsWith("_"))
      .map((b) => ({ sessionId: b.key, etag: b.etag }));

    return new Response(JSON.stringify(transcriptList), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response("Internal error", { status: 500 });
  }
};

export const config: Config = {
  path: "/api/transcripts",
};
