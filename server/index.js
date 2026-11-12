"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const dotenv = require("dotenv");

const { parseUrlPath, safeRelativeResourcePath } = require("./lib/path");
const {
  listExistingPaths,
  pathExists,
  upsertManifestPage,
  removeManifestPage,
} = require("./lib/store");
const { deployToGit } = require("./lib/deploy");

const repoRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 40,
  },
});

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const UPLOAD_TOKEN = String(process.env.UPLOAD_TOKEN || "").trim();
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "")
  .trim()
  .replace(/\/$/, "");
const GIT_DEPLOY =
  String(process.env.GIT_DEPLOY || "true").toLowerCase() !== "false";
const GIT_BRANCH = process.env.GIT_BRANCH || "main";
const GIT_REMOTE = process.env.GIT_REMOTE || "origin";

function requireToken(req, res, next) {
  if (!UPLOAD_TOKEN) {
    return res.status(503).json({
      ok: false,
      error: "ตั้ง UPLOAD_TOKEN ในไฟล์ .env ก่อนใช้งาน portal",
    });
  }
  const provided = req.get("x-upload-token") || "";
  if (String(provided) !== UPLOAD_TOKEN) {
    return res.status(401).json({ ok: false, error: "upload token ไม่ถูกต้อง" });
  }
  return next();
}

function publicUrlFor(urlPath) {
  const rel = `/pages/${urlPath}/`;
  if (!PUBLIC_BASE_URL) return rel;
  return `${PUBLIC_BASE_URL}${rel}`;
}

function iframeSnippet(urlPath, height) {
  const src = `${publicUrlFor(urlPath)}?embed=1`;
  const h = Number(height) > 0 ? Math.round(Number(height)) : 520;
  return (
    `<iframe\n` +
    `  src="${src}"\n` +
    `  width="100%"\n` +
    `  height="${h}"\n` +
    `  style="border:0;border-radius:8px;"\n` +
    `  loading="lazy"\n` +
    `></iframe>`
  );
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function writeFileSafe(absPath, buffer) {
  ensureDir(path.dirname(absPath));
  fs.writeFileSync(absPath, buffer);
}

function claimPageDir(urlPath, segments) {
  if (pathExists(repoRoot, urlPath)) {
    const err = new Error(`path ซ้ำ: ${urlPath}`);
    err.status = 409;
    throw err;
  }

  const targetDir = path.join(repoRoot, "pages", ...segments);
  try {
    fs.mkdirSync(targetDir, { recursive: false });
  } catch (error) {
    if (error && error.code === "EEXIST") {
      const err = new Error(`path ซ้ำ: ${urlPath}`);
      err.status = 409;
      throw err;
    }
    if (error && error.code === "ENOENT") {
      ensureDir(path.dirname(targetDir));
      try {
        fs.mkdirSync(targetDir, { recursive: false });
      } catch (nestedError) {
        if (nestedError && nestedError.code === "EEXIST") {
          const err = new Error(`path ซ้ำ: ${urlPath}`);
          err.status = 409;
          throw err;
        }
        throw nestedError;
      }
      return targetDir;
    }
    throw error;
  }
  return targetDir;
}

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    gitDeploy: GIT_DEPLOY,
    tokenConfigured: Boolean(UPLOAD_TOKEN),
    publicBaseUrl: PUBLIC_BASE_URL || null,
  });
});

app.get("/api/paths", requireToken, (_req, res) => {
  try {
    res.json({ ok: true, paths: listExistingPaths(repoRoot) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/check-path", requireToken, (req, res) => {
  const parsed = parseUrlPath(req.query.path);
  if (!parsed.ok) {
    return res.json({
      ok: true,
      available: false,
      path: null,
      reason: parsed.error,
    });
  }
  const exists = pathExists(repoRoot, parsed.path);
  return res.json({
    ok: true,
    available: !exists,
    path: parsed.path,
    reason: exists ? "ชื่อนี้มีอยู่แล้ว" : null,
    pageUrl: publicUrlFor(parsed.path),
  });
});

app.post(
  "/api/upload",
  (req, res, next) => {
    if (!UPLOAD_TOKEN) {
      return res.status(503).json({
        ok: false,
        error: "ตั้ง UPLOAD_TOKEN ในไฟล์ .env ก่อนใช้งาน portal",
      });
    }
    if (req.get("x-upload-token") !== UPLOAD_TOKEN) {
      return res.status(401).json({ ok: false, error: "upload token ไม่ถูกต้อง" });
    }
    return next();
  },
  upload.fields([
    { name: "html", maxCount: 1 },
    { name: "resources", maxCount: 39 },
  ]),
  (req, res) => {
    let claimedDir = null;
    let tempDir = null;
    let claimedPath = null;
    let manifestWritten = false;
    let keepClaimOnFailure = false;

    try {
      const parsed = parseUrlPath(req.body.path);
      if (!parsed.ok) {
        return res.status(400).json({ ok: false, error: parsed.error });
      }

      const htmlFiles = req.files?.html || [];
      if (!htmlFiles.length) {
        return res.status(400).json({ ok: false, error: "ต้องอัปโหลดไฟล์ HTML" });
      }

      const htmlFile = htmlFiles[0];
      const htmlName = String(htmlFile.originalname || "").toLowerCase();
      if (!htmlName.endsWith(".html") && !htmlName.endsWith(".htm")) {
        return res.status(400).json({ ok: false, error: "ไฟล์หลักต้องเป็น .html" });
      }

      const title = String(req.body.title || parsed.path).trim() || parsed.path;
      const description = String(req.body.description || "").trim();
      const embedHeight = Math.min(
        4000,
        Math.max(120, Number(req.body.embedHeight) || 520)
      );
      const tags = String(req.body.tags || "uploaded")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const resources = req.files?.resources || [];
      const rawPaths = req.body.resourcePaths;
      const pathList = Array.isArray(rawPaths)
        ? rawPaths
        : rawPaths
          ? [rawPaths]
          : [];
      const resourcePlan = [];
      for (let i = 0; i < resources.length; i += 1) {
        const file = resources[i];
        const hinted = pathList[i];
        let relative = null;
        if (hinted != null && String(hinted).trim() !== "") {
          relative = safeRelativeResourcePath(hinted);
          if (!relative) {
            return res.status(400).json({
              ok: false,
              error: `ชื่อไฟล์ resource ไม่ปลอดภัย: ${hinted}`,
            });
          }
        } else {
          relative =
            safeRelativeResourcePath(file.originalname) ||
            safeRelativeResourcePath(path.basename(file.originalname || "file"));
        }
        if (!relative) {
          return res.status(400).json({
            ok: false,
            error: `ชื่อไฟล์ resource ไม่ปลอดภัย: ${file.originalname}`,
          });
        }
        if (relative.toLowerCase() === "index.html") {
          return res.status(400).json({
            ok: false,
            error: "resource ห้ามชื่อ index.html — ใช้ช่อง HTML หลัก",
          });
        }
        resourcePlan.push({ relative, buffer: file.buffer });
      }

      claimedDir = claimPageDir(parsed.path, parsed.segments);
      claimedPath = parsed.path;
      const stagingRoot = path.join(repoRoot, "pages", ".upload-tmp");
      ensureDir(stagingRoot);
      tempDir = fs.mkdtempSync(path.join(stagingRoot, "job-"));

      writeFileSafe(path.join(tempDir, "index.html"), htmlFile.buffer);
      const written = ["index.html"];
      for (const item of resourcePlan) {
        writeFileSafe(path.join(tempDir, item.relative), item.buffer);
        written.push(item.relative);
      }

      for (const name of fs.readdirSync(tempDir)) {
        fs.renameSync(path.join(tempDir, name), path.join(claimedDir, name));
      }
      rmrf(tempDir);
      tempDir = null;

      upsertManifestPage(repoRoot, {
        slug: parsed.path,
        title,
        description,
        tags,
        embedHeight,
      });
      manifestWritten = true;

      const deployPaths = [
        path.join("pages", ...parsed.segments),
        "manifest.json",
      ];

      let deploy;
      try {
        deploy = deployToGit(repoRoot, {
          enabled: GIT_DEPLOY,
          remote: GIT_REMOTE,
          branch: GIT_BRANCH,
          message: `portal: add pages/${parsed.path}`,
          paths: deployPaths,
        });
      } catch (deployError) {
        keepClaimOnFailure = true;
        return res.status(502).json({
          ok: false,
          error:
            "เขียนไฟล์แล้ว แต่ deploy/git push ไม่สำเร็จ: " +
            (deployError.message || "deploy failed"),
          path: parsed.path,
          pageUrl: publicUrlFor(parsed.path),
          files: written,
        });
      }

      return res.status(201).json({
        ok: true,
        path: parsed.path,
        pageUrl: publicUrlFor(parsed.path),
        embedUrl: `${publicUrlFor(parsed.path)}?embed=1`,
        iframe: iframeSnippet(parsed.path, embedHeight),
        files: written,
        deploy,
      });
    } catch (error) {
      if (tempDir) rmrf(tempDir);
      if (claimedDir && error.status !== 409 && !keepClaimOnFailure) {
        try {
          rmrf(claimedDir);
        } catch (_cleanupError) {
          // ignore cleanup errors
        }
        if (manifestWritten && claimedPath) {
          try {
            removeManifestPage(repoRoot, claimedPath);
          } catch (_manifestError) {
            // ignore
          }
        }
      }
      const status = error.status || 500;
      return res.status(status).json({
        ok: false,
        error: error.message || "upload failed",
      });
    }
  }
);

app.use("/portal", express.static(path.join(repoRoot, "portal")));
app.get("/portal", (_req, res) => {
  res.sendFile(path.join(repoRoot, "portal", "index.html"));
});

app.use("/assets", express.static(path.join(repoRoot, "assets")));
app.use("/pages", express.static(path.join(repoRoot, "pages")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(repoRoot, "index.html"));
});
app.get("/manifest.json", (_req, res) => {
  res.sendFile(path.join(repoRoot, "manifest.json"));
});
app.get("/404.html", (_req, res) => {
  res.sendFile(path.join(repoRoot, "404.html"));
});
app.get("/index.html", (_req, res) => {
  res.sendFile(path.join(repoRoot, "index.html"));
});

if (!UPLOAD_TOKEN) {
  console.warn(
    "[portal] UPLOAD_TOKEN ยังไม่ถูกตั้ง — คัดลอก .env.example เป็น .env ก่อน"
  );
}

app.listen(PORT, HOST, () => {
  console.log(`[portal] http://${HOST}:${PORT}/portal/`);
  console.log(`[site]   http://${HOST}:${PORT}/`);
});
