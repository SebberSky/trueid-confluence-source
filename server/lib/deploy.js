"use strict";

const { spawnSync } = require("child_process");

function runGit(repoRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(detail || `git ${args.join(" ")} failed`);
  }
  return (result.stdout || "").trim();
}

function deployToGit(repoRoot, options) {
  const {
    enabled = true,
    remote = "origin",
    branch = "main",
    message,
    paths = [],
  } = options;

  if (!enabled) {
    return { skipped: true, reason: "GIT_DEPLOY=false" };
  }

  if (!paths.length) {
    throw new Error("deploy paths required");
  }

  runGit(repoRoot, ["rev-parse", "--is-inside-work-tree"]);

  const staged = runGit(repoRoot, ["diff", "--cached", "--name-only"]);
  if (staged) {
    const unexpected = staged
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((file) => !paths.some((p) => file === p || file.startsWith(p + "/")));
    if (unexpected.length) {
      throw new Error(
        "มีไฟล์ staged อื่นอยู่แล้ว ยกเลิก deploy เพื่อไม่ให้ commit พ่วง: " +
          unexpected.slice(0, 8).join(", ")
      );
    }
  }

  runGit(repoRoot, ["add", "--", ...paths]);
  runGit(repoRoot, ["commit", "-m", message, "--", ...paths]);
  const commit = runGit(repoRoot, ["rev-parse", "--short", "HEAD"]);
  runGit(repoRoot, ["push", remote, `HEAD:${branch}`]);

  return { skipped: false, commit, branch, remote };
}

module.exports = {
  deployToGit,
  runGit,
};
