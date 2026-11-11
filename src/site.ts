let siteTitle = "JUNCTION LAB";
export const getSiteTitle = () => siteTitle;
export function connectSite() {
  fetch("/api/site")
    .then((r) => (r.ok ? r.json() : null))
    .then((site) => {
      if (!site) return;
      siteTitle = site.title;
      if (!location.hash.startsWith("#post/")) document.title = site.title;
      const title = document.querySelector(".brand h1");
      if (title) title.textContent = site.title;
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute("content", site.description);
      if (!site.analytics || navigator.doNotTrack === "1") return;
      const track = () => {
        const hash = location.hash;
        const path = /^#post\/\d+$/.test(hash) ? "/" + hash : "/";
        fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, referrer: document.referrer }),
          keepalive: true,
        }).catch(() => {});
      };
      track();
      window.addEventListener("hashchange", track);
      window.addEventListener("junction:read", track);
    })
    .catch(() => {});
}
