(function () {
  const listEl = document.getElementById("page-list");
  const toastEl = document.getElementById("toast");
  if (!listEl) return;

  const baseUrl = new URL(".", window.location.href).href.replace(/\/$/, "");
  const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("show");
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(function () {
      toastEl.classList.remove("show");
    }, 1600);
  }

  function normalizeSlug(value) {
    const slug = String(value || "").trim();
    return SLUG_RE.test(slug) ? slug : null;
  }

  function normalizeHeight(value) {
    const height = Number(value);
    if (!Number.isFinite(height) || height < 120 || height > 4000) {
      return 480;
    }
    return Math.round(height);
  }

  function iframeSnippet(pagePath, height) {
    const src = baseUrl + "/pages/" + pagePath + "/?embed=1";
    const h = normalizeHeight(height);
    return (
      '<iframe\n' +
      '  src="' +
      src +
      '"\n' +
      '  width="100%"\n' +
      '  height="' +
      h +
      '"\n' +
      '  style="border:0;border-radius:8px;"\n' +
      '  loading="lazy"\n' +
      '  referrerpolicy="no-referrer-when-downgrade"\n' +
      "></iframe>"
    );
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "absolute";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    document.body.removeChild(area);
    return Promise.resolve();
  }

  function renderEmpty(messageHtml) {
    listEl.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = messageHtml;
    listEl.appendChild(empty);
  }

  function renderPages(pages) {
    const safePages = (pages || [])
      .map(function (page) {
        const slug = normalizeSlug(page && page.slug);
        if (!slug) return null;
        return {
          slug: slug,
          title: String((page && page.title) || slug),
          description: String((page && page.description) || ""),
          tags: Array.isArray(page.tags)
            ? page.tags.map(function (tag) {
                return String(tag);
              })
            : [],
          embedHeight: normalizeHeight(page && page.embedHeight),
        };
      })
      .filter(Boolean);

    if (!safePages.length) {
      renderEmpty(
        "ยังไม่มีหน้าใน <code>manifest.json</code> — เพิ่มรายการแล้ว push"
      );
      return;
    }

    listEl.replaceChildren();

    safePages.forEach(function (page) {
      const article = document.createElement("article");
      article.className = "card";
      article.dataset.slug = page.slug;

      const title = document.createElement("h2");
      title.textContent = page.title;
      article.appendChild(title);

      if (page.description) {
        const description = document.createElement("p");
        description.textContent = page.description;
        article.appendChild(description);
      }

      if (page.tags.length) {
        const meta = document.createElement("div");
        meta.className = "meta";
        page.tags.forEach(function (tag) {
          const chip = document.createElement("span");
          chip.className = "tag";
          chip.textContent = tag;
          meta.appendChild(chip);
        });
        article.appendChild(meta);
      }

      const actions = document.createElement("div");
      actions.className = "actions";

      const openLink = document.createElement("a");
      openLink.className = "btn primary";
      openLink.href = "pages/" + page.slug + "/";
      openLink.textContent = "เปิดหน้า";
      actions.appendChild(openLink);

      const embedLink = document.createElement("a");
      embedLink.className = "btn";
      embedLink.href = "pages/" + page.slug + "/?embed=1";
      embedLink.textContent = "โหมด embed";
      actions.appendChild(embedLink);

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "btn copy-embed";
      copyBtn.dataset.slug = page.slug;
      copyBtn.dataset.height = String(page.embedHeight);
      copyBtn.textContent = "คัดลอก iframe";
      copyBtn.addEventListener("click", function () {
        copyText(iframeSnippet(page.slug, page.embedHeight)).then(function () {
          showToast("คัดลอก iframe แล้ว");
        });
      });
      actions.appendChild(copyBtn);

      article.appendChild(actions);
      listEl.appendChild(article);
    });
  }

  fetch("manifest.json", { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("manifest missing");
      return res.json();
    })
    .then(function (data) {
      renderPages(Array.isArray(data.pages) ? data.pages : []);
    })
    .catch(function () {
      renderEmpty("โหลด <code>manifest.json</code> ไม่ได้");
    });
})();
