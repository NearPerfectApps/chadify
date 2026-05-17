"use node";
import { action } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const FREE_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
const GEMINI_MODEL = "gemini-3.1-flash-image-preview";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const PROMPT =
  "Generate a single high-end editorial black-and-white portrait photograph in the exact style, pose, framing, and lighting of image 2, depicting the person from image 1. Treat this as a fashion magazine cover shot — shot on a medium-format camera with an 85mm prime lens, studio strobe lighting, large softbox key, professionally retouched. " +
  "1. TARGET PHOTOGRAPH: Image 2 IS the photograph you are recreating. Its pose, head angle, gaze direction, body posture, framing, composition, background, and cinematic black-and-white lighting must be preserved exactly. Do not change the camera angle or the direction the subject is facing. " +
  "2. IDENTITY (CRITICAL): Use image 1 as a precise likeness reference. The following features must be reproduced exactly so the person is unmistakably recognizable to anyone who knows them: eye shape and spacing, eyebrow shape, nose bridge and tip, philtrum, mouth shape and lip thickness, chin shape, jaw width, cheekbone structure, ear shape, hairline, hair texture and style, facial hair pattern, skin tone relative value, and any distinctive features (moles, freckles, scars). The person in the final image must look like the exact same individual as in image 1 — not a generic lookalike, not a younger or 'idealized' version. Do NOT copy image 1's pose, expression, camera angle, lighting, or framing. " +
  "3. RE-RENDER, DO NOT PASTE: The face must be re-drawn from scratch to match image 2's head angle and lighting — not cut, warped, or pasted from image 1. The neck, jaw, and hairline must flow naturally into the body with no seam, no edge, no compositing artifact, no halo, no color discontinuity. " +
  "4. LIGHTING: Reproduce image 2's lighting exactly — same key light direction and angle, same fill ratio, same deep blacks in the shadow side, same luminous highlights wrapping the cheekbone, brow, jawline, nose bridge, and collarbone, same micro-shadows under the lip and brow, same contrast curve and tonal range. Dramatic, sculpted, cinematic. Ignore image 1's lighting entirely. " +
  "5. QUALITY: Tack-sharp focus on the eyes and face. Resolve fine skin detail at the pore level — individual stubble hairs, eyebrow hairs, eyelashes, subtle skin micro-texture and micro-shadow. Deep, rich black point. Crisp specular highlights. Full editorial tonal range from pure black to pure white with smooth midtones. No plastic skin, no AI smoothing, no waxy look, no symmetry artifacts, no blur, no noise, no compression artifacts, no extra fingers or limbs. Output the highest resolution possible.";

export const run = action({
  args: {
    userPhotoStorageId: v.id("_storage"),
    referenceStorageId: v.optional(v.id("_storage")),
  },
  returns: v.object({
    url: v.string(),
    storageId: v.optional(v.id("_storage")), // only returned for anonymous users (for post-sign-in save)
  }),
  handler: async (ctx, { userPhotoStorageId, referenceStorageId }): Promise<{ url: string; storageId?: Id<"_storage"> }> => {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // ── 2. Entitlement gate ──────────────────────────────────────────────────
    const ent = await ctx.runQuery(internal.entitlements.getForUser, {
      userId,
    });
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
          `Your free generation will be ready in ${h > 0 ? `${h}h ` : ""}${m}m. Purchase credits for instant access.`,
        );
      }
      mode = "free";
    }

    // ── 3. Resolve reference image ───────────────────────────────────────────
    let refId: Id<"_storage">;
    if (referenceStorageId) {
      refId = referenceStorageId;
    } else {
      const ref = await ctx.runQuery(internal.referenceImages.getFirst);
      if (!ref)
        throw new Error(
          "No reference images configured. Please contact support.",
        );
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
    const userMimeType = userBlob.type || "image/jpeg";
    const resultBase64 = await callGemini(
      userBase64,
      userMimeType,
      gigachadBase64,
    );

    // ── 7. Delete user's original photo immediately ──────────────────────────
    await ctx.storage.delete(userPhotoStorageId);

    // ── 8. Store result in Convex storage ────────────────────────────────────
    const resultBytes = base64ToUint8Array(resultBase64);
    const resultBlob = new Blob([resultBytes.buffer as ArrayBuffer], {
      type: "image/jpeg",
    });
    const resultStorageId = await ctx.storage.store(resultBlob);

    // ── 9. Persist metadata (skip for anonymous users — they save after sign-in) ─
    const isAnonymous: boolean = await ctx.runQuery(internal.users.getIsAnonymous, { userId });
    if (!isAnonymous) {
      await ctx.runMutation(internal.transformations.insert, {
        userId,
        storageId: resultStorageId,
        createdAt: Date.now(),
      });
    }

    // ── 9b. Deduct entitlement (after success — never penalise Gemini failures) ─
    if (mode === "credit") {
      await ctx.runMutation(internal.entitlements.deductCredit, { userId });
    } else if (mode === "free") {
      await ctx.runMutation(internal.entitlements.recordFreeGeneration, {
        userId,
      });
    }

    // ── 10. Return served URL — never log it ─────────────────────────────────
    const url = await ctx.storage.getUrl(resultStorageId);
    if (!url) throw new Error("Failed to retrieve result URL.");
    return {
      url,
      storageId: isAnonymous ? resultStorageId : undefined,
    };
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

async function callGemini(
  userBase64: string,
  userMimeType: string,
  refBase64: string,
): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured.");

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: userMimeType, data: userBase64 } },
            { inline_data: { mime_type: "image/webp", data: refBase64 } },
          ],
        },
      ],
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
  const imagePart = parts.find(
    (p: any) => p.inline_data?.data || p.inlineData?.data,
  );

  if (!imagePart) {
    console.error(
      "[chadify] No image returned. finishReason:",
      data?.candidates?.[0]?.finishReason,
    );
    throw new Error("Transformation failed. Please try again.");
  }

  const imgData = imagePart.inline_data ?? imagePart.inlineData;
  return imgData.data as string;
}
