(function () {
  const params = new URLSearchParams(window.location.search);
  const isEmbed = params.get("embed") === "1";
  if (!isEmbed) return;

  document.documentElement.classList.add("is-embed");
  document.body.classList.add("is-embed");

  document.querySelectorAll("[data-hide-in-embed]").forEach(function (el) {
    el.hidden = true;
  });

  document.querySelectorAll(".shell, .content-page").forEach(function (el) {
    el.classList.add("embed");
  });
})();
