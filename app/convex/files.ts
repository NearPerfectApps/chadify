import { mutation } from "./_generated/server";

// Exposes Convex's built-in upload URL generator to the client.
// The client POSTs the image blob to this URL, then passes the
// resulting storageId to the chadify action.
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
