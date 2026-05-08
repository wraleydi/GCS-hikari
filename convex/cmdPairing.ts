/**
 * @module cmdPairing
 * @description Convex functions for the ADOS drone pairing system.
 * Supports two flows:
 * 1. Agent-initiated: agent generates code → user enters code in GCS
 * 2. User-initiated: user pre-generates code → agent uses it during install
 * @license GPL-3.0-only
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

const SAFE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const PAIRING_CODE_RE = new RegExp(
  `^[${SAFE_CHARSET}]{${CODE_LENGTH}}$`,
);
const MAX_DEVICE_ID_LENGTH = 96;
const MAX_LABEL_LENGTH = 128;
const MAX_API_KEY_LENGTH = 256;

function normalizePairingCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!PAIRING_CODE_RE.test(normalized)) {
    throw new Error("Pairing code must be six safe uppercase characters");
  }
  return normalized;
}

function generatePairingCode(): string {
  let pairingCode = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    pairingCode +=
      SAFE_CHARSET[Math.floor(Math.random() * SAFE_CHARSET.length)];
  }
  return pairingCode;
}

function requireBoundedString(value: string, name: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} required`);
  if (trimmed.length > max) throw new Error(`${name} too long`);
  return trimmed;
}

function optionalBoundedString(
  value: string | undefined,
  name: string,
  max: number,
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) throw new Error(`${name} too long`);
  return trimmed;
}

/** User claims a pairing code (enters code displayed on agent terminal). */
export const claimPairingCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const pairingCode = normalizePairingCode(code);

    const request = await ctx.db
      .query("cmd_pairingRequests")
      .withIndex("by_pairingCode", (q) =>
        q.eq("pairingCode", pairingCode)
      )
      .first();

    if (!request) throw new Error("Invalid pairing code");
    if (request.expiresAt < Date.now()) {
      await ctx.db.delete(request._id);
      throw new Error("Pairing code expired");
    }
    if (request.claimedBy) throw new Error("Code already claimed");

    // Mark as claimed
    await ctx.db.patch(request._id, {
      claimedBy: userId,
      claimedAt: Date.now(),
    });

    // Upsert: update existing drone record if same user + device
    const deviceId = request.deviceId || `device-${pairingCode}`;
    const existingDrone = await ctx.db
      .query("cmd_drones")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("deviceId"), deviceId))
      .first();

    let droneId;
    if (existingDrone) {
      await ctx.db.patch(existingDrone._id, {
        apiKey: request.apiKey || "",
        agentVersion: request.agentVersion,
        board: request.board,
        tier: request.tier,
        os: request.os,
        mdnsHost: request.mdnsHost,
        lastIp: request.localIp,
        lastSeen: Date.now(),
        pairedAt: Date.now(),
      });
      droneId = existingDrone._id;
    } else {
      droneId = await ctx.db.insert("cmd_drones", {
        userId,
        deviceId,
        name: request.agentName || `Drone ${pairingCode}`,
        apiKey: request.apiKey || "",
        agentVersion: request.agentVersion,
        board: request.board,
        tier: request.tier,
        os: request.os,
        mdnsHost: request.mdnsHost,
        lastIp: request.localIp,
        lastSeen: Date.now(),
        fcConnected: false,
        pairedAt: Date.now(),
      });
    }

    return {
      droneId,
      apiKey: request.apiKey || "",
      mdnsHost: request.mdnsHost,
      localIp: request.localIp,
      deviceId,
      name: existingDrone?.name || request.agentName,
    };
  },
});

/** User pre-generates a pairing code (for zero-touch install). */
export const preGenerateCode = mutation({
  args: { code: v.optional(v.string()) },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    let pairingCode = code ? normalizePairingCode(code) : "";
    for (let attempt = 0; attempt < 8; attempt++) {
      if (!pairingCode) pairingCode = generatePairingCode();
      const existing = await ctx.db
        .query("cmd_pairingRequests")
        .withIndex("by_pairingCode", (q) => q.eq("pairingCode", pairingCode))
        .first();
      if (!existing) break;
      if (existing.expiresAt < Date.now() && !existing.claimedBy) {
        await ctx.db.delete(existing._id);
        break;
      }
      if (code) throw new Error("Pairing code already exists");
      pairingCode = "";
    }

    if (!pairingCode) {
      throw new Error("Could not allocate pairing code");
    }

    const requestId = await ctx.db.insert("cmd_pairingRequests", {
      pairingCode,
      expiresAt: Date.now() + CODE_TTL_MS,
      createdBy: userId,
    });

    return { requestId, code: pairingCode };
  },
});

/**
 * Agent polls to check if its code was claimed.
 * No auth required — uses deviceId lookup.
 */
export const getPairingStatus = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const request = await ctx.db
      .query("cmd_pairingRequests")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
      .first();

    if (!request) return { registered: false };

    return {
      registered: true,
      claimed: !!request.claimedBy,
      claimedAt: request.claimedAt,
    };
  },
});

/** User sees their pre-generated (unclaimed) codes. */
export const getMyPendingCodes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("cmd_pairingRequests")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", userId))
      .filter((q) => q.eq(q.field("claimedBy"), undefined))
      .collect();
  },
});

/**
 * Called by HTTP handler when agent registers its pairing request.
 * No user auth — this is the agent-side of the pairing flow.
 * Handles upsert and auto-matching with pre-generated codes.
 */
export const registerAgent = mutation({
  args: {
    deviceId: v.string(),
    pairingCode: v.string(),
    apiKey: v.optional(v.string()),
    name: v.optional(v.string()),
    version: v.optional(v.string()),
    board: v.optional(v.string()),
    tier: v.optional(v.number()),
    os: v.optional(v.string()),
    mdnsHost: v.optional(v.string()),
    localIp: v.optional(v.string()),
    // Agent-authoritative pairing-code expiry (epoch seconds). Mirrors
    // the timer the agent's local wizard is showing the operator so
    // the cloud-side UI countdown matches the physical device.
    pairingCodeExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const deviceId = requireBoundedString(
      args.deviceId,
      "deviceId",
      MAX_DEVICE_ID_LENGTH,
    );
    const pairingCode = normalizePairingCode(args.pairingCode);
    const name = optionalBoundedString(args.name, "name", MAX_LABEL_LENGTH);
    const version = optionalBoundedString(
      args.version,
      "version",
      MAX_LABEL_LENGTH,
    );
    const board = optionalBoundedString(args.board, "board", MAX_LABEL_LENGTH);
    const os = optionalBoundedString(args.os, "os", MAX_LABEL_LENGTH);
    const apiKey = optionalBoundedString(args.apiKey, "apiKey", MAX_API_KEY_LENGTH);
    const mdnsHost = optionalBoundedString(
      args.mdnsHost,
      "mdnsHost",
      MAX_LABEL_LENGTH,
    );
    const localIp = optionalBoundedString(args.localIp, "localIp", MAX_LABEL_LENGTH);
    if (
      args.tier !== undefined &&
      (!Number.isInteger(args.tier) || args.tier < 0 || args.tier > 10)
    ) {
      throw new Error("tier out of range");
    }
    // Validate the agent-side expiry. Reject negatives or absurd values
    // so a malformed beacon can never poison the row. Epoch seconds
    // beyond year 2100 are obvious noise.
    let pairingCodeExpiresAt: number | undefined = args.pairingCodeExpiresAt;
    if (pairingCodeExpiresAt !== undefined) {
      if (
        !Number.isFinite(pairingCodeExpiresAt) ||
        pairingCodeExpiresAt < 0 ||
        pairingCodeExpiresAt > 4_102_444_800
      ) {
        pairingCodeExpiresAt = undefined;
      }
    }

    // Re-register the same device/code without letting a mismatched public
    // request delete an active pending pairing window.
    const existing = await ctx.db
      .query("cmd_pairingRequests")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
      .first();
    if (existing) {
      if (existing.claimedBy) return { alreadyClaimed: true };
      if (existing.expiresAt < now) {
        await ctx.db.delete(existing._id);
      } else if (existing.pairingCode !== pairingCode) {
        return { error: "device_pending_with_different_code" };
      } else {
        await ctx.db.patch(existing._id, {
          agentName: name,
          agentVersion: version,
          board,
          tier: args.tier,
          os,
          apiKey,
          mdnsHost,
          localIp,
          expiresAt: now + CODE_TTL_MS,
          ...(pairingCodeExpiresAt !== undefined ? { pairingCodeExpiresAt } : {}),
        });
        return { registered: true };
      }
    }

    // Check if a pre-generated code matches (zero-touch flow)
    const preGenerated = await ctx.db
      .query("cmd_pairingRequests")
      .withIndex("by_pairingCode", (q) =>
        q.eq("pairingCode", pairingCode)
      )
      .first();
    if (preGenerated && preGenerated.createdBy && !preGenerated.claimedBy) {
      if (preGenerated.expiresAt < now) {
        await ctx.db.delete(preGenerated._id);
        return { error: "pairing_code_expired" };
      }
      // Auto-match: pre-generated code found, auto-claim it
      await ctx.db.patch(preGenerated._id, {
        deviceId,
        agentName: name,
        agentVersion: version,
        board,
        tier: args.tier,
        os,
        apiKey,
        mdnsHost,
        localIp,
        claimedBy: preGenerated.createdBy!,
        claimedAt: now,
      });
      // Upsert drone record
      const ownerId = preGenerated.createdBy!;
      const existingDrone = await ctx.db
        .query("cmd_drones")
        .withIndex("by_userId", (q) => q.eq("userId", ownerId))
        .filter((q) => q.eq(q.field("deviceId"), deviceId))
        .first();

      if (existingDrone) {
        await ctx.db.patch(existingDrone._id, {
          apiKey: apiKey || "",
          agentVersion: version,
          board,
          tier: args.tier,
          os,
          mdnsHost,
          lastIp: localIp,
          lastSeen: now,
          pairedAt: now,
        });
      } else {
        await ctx.db.insert("cmd_drones", {
          userId: ownerId,
          deviceId,
          name: name || `Drone ${pairingCode}`,
          apiKey: apiKey || "",
          agentVersion: version,
          board,
          tier: args.tier,
          os,
          mdnsHost,
          lastIp: localIp,
          lastSeen: now,
          fcConnected: false,
          pairedAt: now,
        });
      }
      return { autoMatched: true, userId: ownerId };
    }

    // Insert new pairing request
    await ctx.db.insert("cmd_pairingRequests", {
      deviceId,
      pairingCode,
      agentName: name,
      agentVersion: version,
      board,
      tier: args.tier,
      os,
      apiKey,
      mdnsHost,
      localIp,
      expiresAt: now + CODE_TTL_MS,
      ...(pairingCodeExpiresAt !== undefined ? { pairingCodeExpiresAt } : {}),
    });

    return { registered: true };
  },
});

/** Cron job: clean expired pairing requests. */
export const cleanExpiredRequests = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("cmd_pairingRequests")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();
    for (const req of expired) {
      await ctx.db.delete(req._id);
    }
    return { deleted: expired.length };
  },
});
