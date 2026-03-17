import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';

// Nano Banana = Google's gemini-3.1-flash-image-preview (image generation/editing model)
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_AI_API_KEY;
const MODEL = 'gemini-3.1-flash-image-preview';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function uriToBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });
}

async function loadGigachadBase64(): Promise<string> {
  const asset = Asset.fromModule(require('../assets/gigachad.webp'));
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('Failed to load gigachad asset');
  return uriToBase64(asset.localUri);
}

export async function chadifyImage(userPhotoUri: string): Promise<string> {
  if (!API_KEY) {
    throw new Error(
      'Missing EXPO_PUBLIC_GOOGLE_AI_API_KEY in your .env file.\nGet one at aistudio.google.com/app/apikey'
    );
  }

  const [userBase64, gigachadBase64] = await Promise.all([
    uriToBase64(userPhotoUri),
    loadGigachadBase64(),
  ]);

  const response = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text:
                'Generate a portrait using the face from image 1 placed onto the body from image 2. ' +
                'RULE 1 — FACE IS SACRED: The final image must use 100% of the facial features from image 1 with zero alteration. This includes: the exact eye shape, eye spacing, eye color, eyebrows, nose shape and size, lip shape, chin shape, jaw contour, cheekbones, ear shape, skin tone, skin texture, facial hair pattern, forehead, and any distinctive marks. The person must be instantly and unmistakably recognizable as themselves. Do NOT borrow any facial geometry from image 2 — not the chin, not the jaw, not the cheekbones. The face from image 1 is transplanted as-is. ' +
                'RULE 2 — BODY AND STYLE FROM IMAGE 2: Take everything below the neck from image 2 — the muscular build, shoulders, chest, posture, and neck. Also adopt the dramatic black-and-white photography style, the cinematic lighting, the camera angle, and the overall high-contrast aesthetic from image 2. ' +
                'The result should look like a professional dramatic black-and-white portrait of the person from image 1, as if they had the physique shown in image 2 and were photographed in the same style.',
            },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: userBase64,
              },
            },
            {
              inline_data: {
                mime_type: 'image/webp',
                data: gigachadBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `API error ${response.status}`);
  }

  const data = await response.json();

  const debugCandidates = data?.candidates?.map((c: any) => ({
    finishReason: c.finishReason,
    safetyRatings: c.safetyRatings,
    parts: c.content?.parts?.map((p: any) => ({
      keys: Object.keys(p),
      text: p.text,
      inline_data_mime: p.inline_data?.mime_type,
      inline_data_length: p.inline_data?.data?.length,
      // catch any other top-level fields
      ...Object.fromEntries(
        Object.keys(p)
          .filter(k => k !== 'text' && k !== 'inline_data')
          .map(k => [k, p[k]])
      ),
    })),
  }));
  console.log('[Chadify] Raw response:', JSON.stringify({ candidates: debugCandidates, promptFeedback: data?.promptFeedback }, null, 2));

  // Find the image part in the response
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p: any) => p.inline_data?.data || p.inlineData?.data);

  if (!imagePart) {
    const candidate = data?.candidates?.[0];
    const textPart = parts.find((p: any) => p.text);
    const reason = candidate?.finishReason;
    const blocked = data?.promptFeedback?.blockReason;
    throw new Error(
      blocked ? `Blocked by API: ${blocked}` :
      reason && reason !== 'STOP' ? `Stopped with reason: ${reason}` :
      textPart?.text ? `Model responded with text only: ${textPart.text}` :
      'No image returned — check Metro logs for full response'
    );
  }

  // Save the base64 result to a local file and return its URI
  const imgData = imagePart.inline_data ?? imagePart.inlineData;
  const ext = imgData.mime_type?.includes('png') || imgData.mimeType?.includes('png') ? 'png' : 'jpg';
  const localUri = `${FileSystem.cacheDirectory}chadify_${Date.now()}.${ext}`;
  await FileSystem.writeAsStringAsync(localUri, imgData.data, {
    encoding: 'base64',
  });

  return localUri;
}
