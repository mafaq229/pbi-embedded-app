(() => {
  const models = window["powerbi-client"].models;
  const powerbi = window.powerbi;

  const container = document.getElementById("embedContainer");
  const emptyState = document.getElementById("emptyState");
  const loader = document.getElementById("loader");
  const currentName = document.getElementById("currentReportName");
  const currentType = document.getElementById("currentReportType");
  const refreshBtn = document.getElementById("refreshBtn");

  let activeItem = null;

  function setActive(button) {
    if (activeItem) activeItem.classList.remove("is-active");
    activeItem = button;
    if (activeItem) activeItem.classList.add("is-active");
  }

  function showLoader() {
    emptyState.hidden = true;
    container.classList.remove("is-ready");
    loader.hidden = false;
  }

  function showReady() {
    loader.hidden = true;
    emptyState.hidden = true;
    container.classList.add("is-ready");
  }

  function showError(message) {
    loader.hidden = true;
    container.classList.remove("is-ready");
    powerbi.reset(container);
    emptyState.hidden = false;
    emptyState.innerHTML = `
      <div class="empty-state__ornament" style="color: var(--danger)">
        <svg width="96" height="96" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1"/>
          <path d="M12 7v6M12 16.5v.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>
      <h1 class="empty-state__title"><span class="empty-state__title-main">Embed failed</span></h1>
      <p class="empty-state__body" style="color: var(--danger)"><code style="font-family: var(--font-mono); font-size: 12px;">${message}</code></p>
      <p class="empty-state__body">See <code>docs/03-troubleshooting.md</code>.</p>
    `;
  }

  function updateTopbar(name, kind, reportType) {
    currentName.textContent = name;
    let label = null;
    let cls = "type-badge";
    if (kind === "dashboard") {
      label = "Dashboard";
      cls += " type-badge--dashboard";
    } else if (reportType === "PaginatedReport") {
      label = "Paginated";
      cls += " type-badge--paginated";
    } else if (reportType === "PowerBIReport") {
      label = "Interactive";
    }
    if (!label) {
      currentType.hidden = true;
      return;
    }
    currentType.textContent = label;
    currentType.className = cls;
    currentType.hidden = false;
  }

  async function embedItem({ kind, id, name, reportType }) {
    updateTopbar(name, kind, reportType);
    showLoader();

    try {
      const endpoint =
        kind === "dashboard"
          ? `/api/embed-info/dashboard/${encodeURIComponent(id)}`
          : `/api/embed-info/${encodeURIComponent(id)}`;
      const resp = await fetch(endpoint);
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${body.slice(0, 240)}`);
      }
      const info = await resp.json();

      powerbi.reset(container);

      const isDashboard = info.embed_type === "dashboard";
      const isPaginated = info.report_type === "PaginatedReport";

      const config = {
        type: isDashboard ? "dashboard" : "report",
        id: info.embed_id,
        embedUrl: info.embed_url,
        accessToken: info.embed_token,
        tokenType: models.TokenType.Embed,
      };

      if (isDashboard) {
        config.pageView = "fitToWidth";
      } else if (isPaginated) {
        // Paginated reports (RDL) don't support panes, pageNavigation, or
        // BackgroundType — passing those settings causes the RDL viewer to
        // fail during cold initialization. Pass no settings for paginated.
      } else {
        config.settings = {
          panes: {
            filters: { visible: true, expanded: false },
            pageNavigation: { visible: true },
          },
          background: models.BackgroundType.Transparent,
        };
      }

      const embedded = powerbi.embed(container, config);

      if (isPaginated) {
        // Paginated reports (RDL) do not fire 'loaded' or 'rendered' — they
        // are explicitly unsupported per the Power BI SDK docs. Show the
        // container immediately so the RDL viewer's own loading indicator is
        // visible rather than the app's spinner blocking the content forever.
        showReady();
      } else {
        embedded.on("loaded", () => showReady());
        embedded.on("rendered", () => showReady());
      }
      embedded.on("error", (event) => {
        const detail = event.detail || {};
        showError(detail.message || "Power BI SDK reported an error. Check DevTools console.");
      });
    } catch (err) {
      showError(err.message || String(err));
    }
  }

  document.querySelectorAll(".report-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActive(btn);
      embedItem({
        kind: btn.dataset.embedKind || "report",
        id: btn.dataset.embedId,
        name: btn.dataset.embedName,
        reportType: btn.dataset.reportType,
      });
    });
  });

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => window.location.reload());
  }

  window.embedItem = embedItem;
})();
