"use node";
import { action } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";

const FREE_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
const GEMINI_MODEL = "gemini-3.1-flash-image-preview";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const PROMPT =
  "Blend image 1 and image 2 into a single photorealistic portrait following these rules: " +
  "1. STYLE: Keep the gigachad aesthetic from image 2 — black and white, cinematic, powerful, confident energy. " +
  "2. IDENTITY: The face (or animal head) from image 1 must be fully preserved. Every feature — eyes, nose, mouth, chin, jaw, skin, facial hair or lack of it — must come from image 1. The subject must be instantly recognizable. " +
  "3. HARMONY: The head and body must feel like they belong together. Match the head angle to the body pose. Lighting and perspective must be consistent throughout. " +
  "4. NO SEAMS: There must be no visible cut, hard edge, or transition anywhere. The result looks like a single photograph taken in one shot. " +
  "5. QUALITY: High resolution, photorealistic, no artifacts.";

export const run = action({
  args: {
    userPhotoStorageId: v.id("_storage"),
    referenceStorageId: v.optional(v.id("_storage")),
  },
  returns: v.string(), // served URL of the result image
  handler: async (ctx, { userPhotoStorageId, referenceStorageId }) => {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // ── 2. Entitlement gate ──────────────────────────────────────────────────
    const ent = await ctx.runQuery(internal.entitlements.getForUser, { userId });
    const now = Date.now();

    type Mode = "lifetime" | "credit" | "free";
    let mode: Mode;

    if (ent?.lifetimeAccess) {
      mode = "lifetime";
    } else if (ent && ent.credits > 0) {
      mode = "credit";
    } else {
      const elapsed = now - (ent?.lastFreeGenerationAt ?? 0);
      if (elapsed < FREE_COOLDOWN_MS) {
        const minutesLeft = Math.ceil((FREE_COOLDOWN_MS - elapsed) / 60000);
        const h = Math.floor(minutesLeft / 60);
        const m = minutesLeft % 60;
        throw new Error(
          `Your free generation will be ready in ${h > 0 ? `${h}h ` : ""}${m}m. Purchase credits for instant access.`
        );
      }
      mode = "free";
    }

    // ── 3. Resolve reference image ───────────────────────────────────────────
    let refId = referenceStorageId;
    if (!refId) {
      const ref = await ctx.runQuery(internal.referenceImages.getFirst);
      if (!ref) throw new Error("No reference images configured. Please contact support.");
      refId = ref.storageId;
    }

    // ── 4. Fetch both images from Convex storage ─────────────────────────────
    const [userBlob, gigachadBlob] = await Promise.all([
      ctx.storage.get(userPhotoStorageId),
      ctx.storage.get(refId),
    ]);
    if (!userBlob) throw new Error("User photo not found in storage.");
    if (!gigachadBlob) throw new Error("Reference image not found in storage.");

    // ── 5. Convert to base64 ─────────────────────────────────────────────────
    const [userBase64, gigachadBase64] = await Promise.all([
      blobToBase64(userBlob),
      blobToBase64(gigachadBlob),
    ]);

    // ── 6. Call Gemini (API key is a Convex env var — never in the app bundle) ──
    const resultBase64 = await callGemini(userBase64, gigachadBase64);

    // ── 7. Delete user's original photo immediately ──────────────────────────
    await ctx.storage.delete(userPhotoStorageId);

    // ── 8. Store result in Convex storage ────────────────────────────────────
    const resultBytes = base64ToUint8Array(resultBase64);
    const resultBlob = new Blob([resultBytes.buffer as ArrayBuffer], { type: "image/jpeg" });
    const resultStorageId = await ctx.storage.store(resultBlob);

    // ── 9. Persist metadata ──────────────────────────────────────────────────
    await ctx.runMutation(internal.transformations.insert, {
      userId,
      storageId: resultStorageId,
      createdAt: Date.now(),
    });

    // ── 9b. Deduct entitlement (after success — never penalise Gemini failures) ─
    if (mode === "credit") {
      await ctx.runMutation(internal.entitlements.deductCredit, { userId });
    } else if (mode === "free") {
      await ctx.runMutation(internal.entitlements.recordFreeGeneration, { userId });
    }

    // ── 10. Return served URL — never log it ─────────────────────────────────
    const url = await ctx.storage.getUrl(resultStorageId);
    if (!url) throw new Error("Failed to retrieve result URL.");
    return url;
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function callGemini(userBase64: string, refBase64: string): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured.");

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: "image/jpeg", data: userBase64 } },
          { inline_data: { mime_type: "image/webp", data: refBase64 } },
        ],
      }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    }),
  });

  if (!response.ok) {
    // Never log request contents or image data
    console.error("[chadify] Gemini error status:", response.status);
    throw new Error("Transformation failed. Please try again.");
  }

  const data = await response.json();
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p: any) => p.inline_data?.data || p.inlineData?.data);

  if (!imagePart) {
    console.error("[chadify] No image returned. finishReason:", data?.candidates?.[0]?.finishReason);
    throw new Error("Transformation failed. Please try again.");
  }

  const imgData = imagePart.inline_data ?? imagePart.inlineData;
  return imgData.data as string;
}
