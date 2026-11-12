"use strict";

const fs = require("fs");
const path = require("path");

function readManifest(repoRoot) {
  const manifestPath = path.join(repoRoot, "manifest.json");
  const raw = fs.readFileSync(manifestPath, "utf8");
  const data = JSON.parse(raw);
  if (!data || typeof data !== "object") {
    throw new Error("manifest.json invalid");
  }
  if (!Array.isArray(data.pages)) data.pages = [];
  return { manifestPath, data };
}

function listPageDirs(dir, prefix, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    const next = prefix ? `${prefix}/${entry.name}` : entry.name;
    const child = path.join(dir, entry.name);
    if (fs.existsSync(path.join(child, "index.html"))) {
      out.push(next);
    }
    listPageDirs(child, next, out);
  }
}

function listExistingPaths(repoRoot) {
  const { data } = readManifest(repoRoot);
  const fromManifest = data.pages
    .map((page) => String(page && page.slug ? page.slug : "").trim())
    .filter(Boolean);

  const fromDisk = [];
  listPageDirs(path.join(repoRoot, "pages"), "", fromDisk);

  return Array.from(new Set([...fromManifest, ...fromDisk])).sort();
}

function pathExists(repoRoot, urlPath) {
  if (listExistingPaths(repoRoot).includes(urlPath)) return true;

  const targetDir = path.join(repoRoot, "pages", ...urlPath.split("/"));
  if (!fs.existsSync(targetDir)) return false;
  return fs.readdirSync(targetDir).length > 0;
}

function upsertManifestPage(repoRoot, page) {
  const { manifestPath, data } = readManifest(repoRoot);
  const idx = data.pages.findIndex((item) => item.slug === page.slug);
  if (idx >= 0) {
    data.pages[idx] = { ...data.pages[idx], ...page };
  } else {
    data.pages.push(page);
  }
  data.pages.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  fs.writeFileSync(manifestPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return data;
}

function removeManifestPage(repoRoot, slug) {
  const { manifestPath, data } = readManifest(repoRoot);
  const next = data.pages.filter((item) => item.slug !== slug);
  if (next.length === data.pages.length) return data;
  data.pages = next;
  fs.writeFileSync(manifestPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return data;
}

module.exports = {
  readManifest,
  listExistingPaths,
  pathExists,
  upsertManifestPage,
  removeManifestPage,
};
