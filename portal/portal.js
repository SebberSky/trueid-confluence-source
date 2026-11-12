(function () {
  const form = document.getElementById("upload-form");
  const tokenInput = document.getElementById("uploadToken");
  const pathInput = document.getElementById("path");
  const pathStatus = document.getElementById("path-status");
  const submitBtn = document.getElementById("submit-btn");
  const existingEl = document.getElementById("existing-paths");
  const resultPanel = document.getElementById("result");
  const resultSummary = document.getElementById("result-summary");
  const resultIframe = document.getElementById("result-iframe");
  const copyIframeBtn = document.getElementById("copy-iframe");
  const openPageLink = document.getElementById("open-page");
  const toastEl = document.getElementById("toast");

  let pathAvailable = false;
  let checkTimer = null;
  let lastIframe = "";

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(function () {
      toastEl.classList.remove("show");
    }, 1600);
  }

  function tokenHeaders() {
    return { "X-Upload-Token": tokenInput.value.trim() };
  }

  function setPathStatus(kind, message) {
    pathStatus.className = "path-status " + kind;
    pathStatus.textContent = message;
  }

  function updateSubmitState() {
    const hasToken = Boolean(tokenInput.value.trim());
    const hasPath = Boolean(pathInput.value.trim());
    const hasHtml = Boolean(form.html.files && form.html.files.length);
    submitBtn.disabled = !(hasToken && hasPath && hasHtml && pathAvailable);
  }

  async function apiGet(url) {
    const res = await fetch(url, { headers: tokenHeaders(), cache: "no-store" });
    const data = await res.json().catch(function () {
      return { ok: false, error: "invalid JSON" };
    });
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || "request failed");
    }
    return data;
  }

  async function refreshExistingPaths() {
    if (!tokenInput.value.trim()) {
      existingEl.textContent = "ใส่ token แล้วจะโหลดรายการ";
      return;
    }
    try {
      const data = await apiGet("/api/paths");
      existingEl.replaceChildren();
      if (!data.paths.length) {
        existingEl.textContent = "ยังไม่มี path";
        return;
      }
      data.paths.forEach(function (item) {
        const chip = document.createElement("span");
        chip.className = "path-chip";
        chip.textContent = item;
        existingEl.appendChild(chip);
      });
    } catch (error) {
      existingEl.textContent = error.message;
    }
  }

  async function checkPath() {
    const value = pathInput.value.trim();
    if (!tokenInput.value.trim()) {
      pathAvailable = false;
      setPathStatus("pending", "ใส่ upload token ก่อนเพื่อเช็คชื่อซ้ำ");
      updateSubmitState();
      return;
    }
    if (!value) {
      pathAvailable = false;
      setPathStatus("pending", "กรอก path แล้วระบบจะเช็คชื่อซ้ำ");
      updateSubmitState();
      return;
    }

    setPathStatus("pending", "กำลังเช็ค…");
    try {
      const data = await apiGet(
        "/api/check-path?path=" + encodeURIComponent(value)
      );
      pathAvailable = Boolean(data.available);
      if (data.available) {
        setPathStatus("ok", "ใช้ได้ → " + data.pageUrl);
      } else {
        setPathStatus("bad", data.reason || "ใช้ไม่ได้");
      }
    } catch (error) {
      pathAvailable = false;
      setPathStatus("bad", error.message);
    }
    updateSubmitState();
  }

  function scheduleCheck() {
    window.clearTimeout(checkTimer);
    checkTimer = window.setTimeout(checkPath, 280);
  }

  tokenInput.addEventListener("input", function () {
    updateSubmitState();
    scheduleCheck();
    refreshExistingPaths();
  });
  pathInput.addEventListener("input", function () {
    pathAvailable = false;
    updateSubmitState();
    scheduleCheck();
  });
  form.html.addEventListener("change", updateSubmitState);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    updateSubmitState();
    if (submitBtn.disabled) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "กำลังอัปโหลดและ deploy…";
    resultPanel.hidden = true;

    const body = new FormData();
    body.append("path", pathInput.value.trim());
    body.append("title", form.title.value.trim());
    body.append("description", form.description.value.trim());
    body.append("embedHeight", form.embedHeight.value);
    body.append("tags", form.tags.value.trim());
    body.append("html", form.html.files[0]);

    const resourceFiles = [];
    Array.from(form.resources.files || []).forEach(function (file) {
      resourceFiles.push({
        file: file,
        relative: file.name,
      });
    });
    Array.from(form.resourceFolder.files || []).forEach(function (file) {
      resourceFiles.push({
        file: file,
        relative: file.webkitRelativePath || file.name,
      });
    });
    resourceFiles.forEach(function (item) {
      body.append("resources", item.file);
      body.append("resourcePaths", item.relative);
    });

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: tokenHeaders(),
        body: body,
      });
      const data = await res.json().catch(function () {
        return { ok: false, error: "invalid JSON" };
      });
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "upload failed");
      }

      lastIframe = data.iframe || "";
      resultIframe.textContent = lastIframe;
      const deployNote = data.deploy?.skipped
        ? "deploy ข้าม: " + (data.deploy.reason || "skipped")
        : "deploy แล้ว commit " + (data.deploy?.commit || "?");
      resultSummary.textContent =
        "เผยแพร่ที่ " + data.pageUrl + " — " + deployNote;
      openPageLink.href = data.pageUrl;
      resultPanel.hidden = false;
      showToast("อัปโหลดสำเร็จ");
      await refreshExistingPaths();
      pathAvailable = false;
      pathInput.value = "";
      form.html.value = "";
      form.resources.value = "";
      setPathStatus("pending", "กรอก path ใหม่ได้");
    } catch (error) {
      showToast(error.message);
      setPathStatus("bad", error.message);
    } finally {
      submitBtn.textContent = "อัปโหลดและ deploy";
      updateSubmitState();
    }
  });

  copyIframeBtn.addEventListener("click", async function () {
    if (!lastIframe) return;
    try {
      await navigator.clipboard.writeText(lastIframe);
      showToast("คัดลอก iframe แล้ว");
    } catch (_error) {
      showToast("คัดลอกไม่สำเร็จ");
    }
  });

  updateSubmitState();
})();
