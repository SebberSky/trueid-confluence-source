"use strict";

const SEGMENT_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set([
  "portal",
  "api",
  "assets",
  "pages",
  "node_modules",
  "server",
  ".git",
]);

function normalizePathInput(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/");
}

function parseUrlPath(raw) {
  const normalized = normalizePathInput(raw);
  if (!normalized) {
    return { ok: false, error: "กรอก URL path" };
  }
  if (normalized.includes("..")) {
    return { ok: false, error: "path ห้ามมี .." };
  }

  const segments = normalized.split("/");
  if (segments.length > 4) {
    return { ok: false, error: "path ลึกได้สูงสุด 4 ชั้น" };
  }

  for (const segment of segments) {
    if (!SEGMENT_RE.test(segment)) {
      return {
        ok: false,
        error:
          "ใช้ได้เฉพาะ a-z 0-9 และขีดกลาง เช่น promo-q1 หรือ docs/onboarding",
      };
    }
    if (RESERVED.has(segment)) {
      return { ok: false, error: `ชื่อสำรองใช้ไม่ได้: ${segment}` };
    }
  }

  return { ok: true, path: segments.join("/"), segments };
}

function safeRelativeResourcePath(raw) {
  const cleaned = String(raw || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
  if (!cleaned || cleaned.includes("..")) return null;
  if (/^[a-zA-Z]:/.test(cleaned)) return null;
  const parts = cleaned.split("/").filter(Boolean);
  if (!parts.length) return null;
  if (parts.some((part) => part === "." || part === "..")) return null;
  return parts.join("/");
}

module.exports = {
  normalizePathInput,
  parseUrlPath,
  safeRelativeResourcePath,
  SEGMENT_RE,
};
