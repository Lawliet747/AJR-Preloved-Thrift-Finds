/* AJR Pre-Loved Finds: script.js
   Jobs: load the listings (live Google Sheet, then the last copy this device saw, then data/items.csv),
   turn the rows into items, search / filter / sort them, draw the cards, open an item pop-up with a
   Messenger inquiry, and keep each item shareable through the page address (#item=A001).
   Everything sits in one function so nothing leaks into the page.
   Item data is only ever put on the page with textContent, never innerHTML. */
(() => {
  "use strict";

  /* ======================================================================
     Settings: the part you may edit
     ====================================================================== */
  const CONFIG = {
    // Your Messenger username: the part after m.me/ in your Messenger link.
    messengerUser: "Anthony757",

    // Paste the "Publish to web" CSV link of your Google Sheet here (see README.md).
    // Leave it empty to use the saved copy in data/items.csv only.
    sheetCsvUrl: "",

    backupCsv: "data/items.csv",          // the saved copy; refresh it by exporting the sheet as CSV
    photoFolder: "assets/items/",         // item photos live here
    placeholderPhoto: "assets/placeholder.svg",
    currency: "PHP",
    locale: "en-PH",
    timeoutMs: 8000,                      // how long to wait for the live sheet before using a saved copy
    cacheKey: "preLovedFinds.csv.v1",     // where this device keeps the last live copy it loaded
  };

  /* @pure-start: nothing below this marker touches the page, so it can be tested on its own */

  const money = new Intl.NumberFormat(CONFIG.locale, {
    style: "currency",
    currency: CONFIG.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  /* ---------- CSV ---------- */
  // Handles quoted fields, "" for a quote inside a field, line breaks inside a field, a leading BOM
  // and both \n and \r\n line endings: what Google Sheets and Excel produce.
  function parseCsv(input) {
    const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 1; }
          else quoted = false;
        } else {
          field += ch;
        }
      } else if (ch === '"' && field === "") {
        quoted = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i += 1;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }
    if (field !== "" || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  }

  /* ---------- Cells to values ---------- */
  function normaliseStatus(raw) {
    const s = raw.trim().toLowerCase();
    if (s === "" || s === "available") return "available";
    if (s === "sold" || s === "sold out") return "sold";
    if (s === "reserved" || s === "on hold" || s === "hold" || s === "pending") return "reserved";
    if (s === "hidden" || s === "draft" || s === "unlisted" || s === "private") return "hidden";
    console.warn(`Unknown status "${raw}": treating it as Available. Use Available, Reserved, Sold or Hidden.`);
    return "available";
  }

  function parsePrice(raw) {
    const cleaned = raw.replace(/[^\d.]/g, ""); // drops ₱, PHP, commas and spaces
    if (cleaned === "") return null;
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
  }

  // Dates are kept as UTC midnight so the day shown never shifts with the viewer's time zone.
  function parseDate(raw) {
    const s = raw.trim();
    if (!s) return null;
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    const parsed = new Date(s); // for example 11/20/2026 or Nov 20, 2026
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  }

  // File names only (no folders, no web addresses), so a cell can never point the page somewhere else.
  const PHOTO_NAME = /^\w[\w .-]*\.(?:jpe?g|png|webp|avif|gif|svg)$/i;

  function parsePhotos(raw) {
    return raw
      .split(/[|;]/)
      .map((name) => name.trim())
      .filter((name) => PHOTO_NAME.test(name) && !name.includes(".."))
      .map((name) => CONFIG.photoFolder + encodeURIComponent(name));
  }

  /* ---------- Rows to items ---------- */
  function rowsToItems(rows) {
    if (rows.length === 0) return [];
    const head = rows[0].map((h) => h.trim().toLowerCase());
    if (!head.includes("title")) throw new Error('The sheet needs a "title" column in its first row.');

    const cell = (row, name) => {
      const index = head.indexOf(name);
      return index === -1 ? "" : (row[index] || "").trim();
    };

    const idCount = new Map();
    const categories = new Map(); // lower-case key -> label as first typed, so "books" and "Books" group together
    const items = [];

    rows.slice(1).forEach((row, order) => {
      const title = cell(row, "title");
      if (!title) return;
      const status = normaliseStatus(cell(row, "status"));
      if (status === "hidden") return;

      let id = cell(row, "id") || `item-${order + 1}`;
      const seen = (idCount.get(id) || 0) + 1;
      idCount.set(id, seen);
      if (seen > 1) id = `${id}-${seen}`; // two rows with the same ID would clash in the item link

      const categoryRaw = cell(row, "category") || "Other";
      const categoryKey = categoryRaw.toLowerCase();
      if (!categories.has(categoryKey)) categories.set(categoryKey, categoryRaw);
      const category = categories.get(categoryKey);

      const item = {
        id,
        title,
        price: parsePrice(cell(row, "price")),
        category,
        categoryKey,
        condition: cell(row, "condition"),
        description: cell(row, "description"),
        status,
        photos: parsePhotos(cell(row, "photos")),
        added: parseDate(cell(row, "added")),
        order,
      };
      item.haystack = `${item.title} ${item.category} ${item.condition} ${item.description} ${item.id}`.toLowerCase();
      items.push(item);
    });

    return items;
  }

  /* ---------- Wording ---------- */
  function priceLabel(item) {
    if (item.price === null) return "Ask for price";
    if (item.price === 0) return "Free";
    return money.format(item.price);
  }

  function inquiryText(item) {
    const details = [item.id, item.price ? priceLabel(item) : ""].filter(Boolean).join(", ");
    if (item.status === "reserved") {
      return `Hi! I'd like to be next in line for the "${item.title}" (${details}). Is that okay?`;
    }
    return `Hi! Is the "${item.title}" (${details}) still available?`;
  }

  /* ---------- Search and sort ---------- */
  function tokenise(query) {
    return query.toLowerCase().split(/\s+/).filter(Boolean);
  }

  function matches(item, tokens) {
    return tokens.every((token) => item.haystack.includes(token));
  }

  const dateValue = (item) => (item.added ? item.added.getTime() : 0);

  const SORTS = {
    // Rows added later sit lower in the sheet, so row order breaks ties (and orders undated rows).
    newest: (a, b) => dateValue(b) - dateValue(a) || b.order - a.order,
    "price-asc": (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || b.order - a.order,
    "price-desc": (a, b) => (b.price ?? -1) - (a.price ?? -1) || b.order - a.order,
  };

  /* @pure-end */

  /* ======================================================================
     Page elements and state
     ====================================================================== */
  const $ = (selector) => document.querySelector(selector);

  const grid = $("#grid");
  const soldGrid = $("#sold-grid");
  const soldSection = $("#sold");
  const soldCount = $("#sold-count");
  const chipsBox = $("#chips");
  const searchInput = $("#search");
  const sortSelect = $("#sort");
  const showSoldBox = $("#show-sold");
  const resultStatus = $("#result-status");
  const notice = $("#notice");
  const emptyBox = $("#empty");
  const emptyText = $("#empty-text");
  const loadError = $("#load-error");
  const introCount = $("#intro-count");

  const dialog = $("#item-dialog");
  const dPhotoBox = $("#dialog-photo-box");
  const dThumbs = $("#dialog-thumbs");
  const dTitle = $("#dialog-title");
  const dPrice = $("#dialog-price");
  const dBadge = $("#dialog-badge");
  const dFacts = $("#dialog-facts");
  const dDesc = $("#dialog-desc");
  const dActions = $("#dialog-actions");
  const dHint = $("#dialog-hint");

  const state = { items: [], categories: [], category: "all", query: "", sort: "newest", showSold: true };
  const chipRefs = new Map(); // category key -> { button, count }
  const pageTitle = document.title;
  const shopName = ($(".brand-name") || {}).textContent || pageTitle;
  const messengerBase = `https://m.me/${encodeURIComponent(CONFIG.messengerUser)}`;

  let lastTriggerId = null; // the card to give focus back to when the pop-up closes
  let openedByClick = false; // true when this page's own history entry opened the pop-up

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Photos that fail to load fall back to the placeholder, once.
  function photo(src, alt, width, height, eager) {
    const img = new Image(width, height);
    img.alt = alt;
    img.decoding = "async";
    if (!eager) img.loading = "lazy";
    img.addEventListener(
      "error",
      () => { if (!img.src.endsWith(CONFIG.placeholderPhoto)) img.src = CONFIG.placeholderPhoto; },
      { once: true }
    );
    img.src = src;
    return img;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      return false; // not allowed (older browser, or a file opened from disk): the hint just won't show
    }
  }

  function showNotice(text) {
    notice.textContent = text;
    notice.hidden = text === "";
  }

  /* ======================================================================
     Cards
     ====================================================================== */
  function card(item) {
    const li = el("li", `card is-${item.status}`);
    const link = el("a", "card-link");
    link.href = `#item=${encodeURIComponent(item.id)}`;
    link.dataset.id = item.id;

    const media = el("span", "card-media");
    // alt is empty on purpose: the title right below already names the item for screen readers
    media.append(photo(item.photos[0] || CONFIG.placeholderPhoto, "", 400, 500, false));
    media.append(el("span", "sticker", priceLabel(item)));
    if (item.status === "sold") media.append(el("span", "stamp", "Sold"));
    if (item.status === "reserved") media.append(el("span", "stamp stamp--reserved", "Reserved"));

    link.append(media, el("span", "card-title", item.title));
    if (item.condition) link.append(el("span", "card-meta", item.condition));
    li.append(link);
    return li;
  }

  /* ======================================================================
     Category tags
     ====================================================================== */
  function buildChips() {
    chipsBox.replaceChildren();
    chipRefs.clear();
    const entries = [{ key: "all", label: "All" }, ...state.categories];
    entries.forEach(({ key, label }) => {
      const button = el("button", "chip");
      button.type = "button";
      button.dataset.key = key;
      const count = el("span", "chip-count", "0");
      button.append(el("span", "chip-label", label), count);
      chipsBox.append(button);
      chipRefs.set(key, { button, count });
    });
    chipsBox.hidden = state.categories.length === 0;
  }

  function updateChips(pool) {
    const counts = new Map();
    pool.forEach((item) => counts.set(item.categoryKey, (counts.get(item.categoryKey) || 0) + 1));
    chipRefs.forEach(({ button, count }, key) => {
      const total = key === "all" ? pool.length : counts.get(key) || 0;
      count.textContent = String(total);
      button.setAttribute("aria-pressed", String(key === state.category));
      // A category with nothing in it under the current search is hidden, unless it is the selected one
      button.hidden = key !== "all" && key !== state.category && total === 0;
    });
  }

  /* ======================================================================
     Drawing the shop
     ====================================================================== */
  function render() {
    const tokens = tokenise(state.query);
    const pool = state.items.filter(
      (item) => matches(item, tokens) && (state.showSold || item.status !== "sold")
    );
    updateChips(pool);

    const shown = pool
      .filter((item) => state.category === "all" || item.categoryKey === state.category)
      .sort(SORTS[state.sort]);
    const forSale = shown.filter((item) => item.status !== "sold");
    const sold = shown.filter((item) => item.status === "sold");

    grid.replaceChildren(...forSale.map(card));
    soldGrid.replaceChildren(...sold.map(card));
    soldSection.hidden = sold.length === 0;
    soldCount.textContent = sold.length > 0 ? `(${sold.length})` : "";

    const parts = [`${forSale.length} ${forSale.length === 1 ? "item" : "items"} for sale`];
    if (sold.length > 0) parts.push(`${sold.length} sold`);
    resultStatus.textContent = parts.join(", ");

    const filtering = tokens.length > 0 || state.category !== "all";
    emptyBox.hidden = shown.length > 0 || state.items.length === 0;
    if (!emptyBox.hidden) {
      emptyText.textContent = filtering
        ? "Nothing matches that search. Try fewer words or another category."
        : "Nothing is listed right now. Check back soon.";
      $("#clear-filters").hidden = !filtering;
    }
  }

  function updateIntroCount() {
    const available = state.items.filter((item) => item.status === "available").length;
    introCount.textContent =
      available > 0
        ? `${available} ${available === 1 ? "item is" : "items are"} available right now.`
        : "Everything is spoken for right now. Check back soon.";
  }

  /* ======================================================================
     Item pop-up
     ====================================================================== */
  function showPhoto(item, index) {
    const sources = item.photos.length > 0 ? item.photos : [CONFIG.placeholderPhoto];
    const alt =
      sources.length > 1 ? `${item.title}, photo ${index + 1} of ${sources.length}` : item.title;
    dPhotoBox.replaceChildren(photo(sources[index], alt, 800, 1000, true));
    dThumbs.querySelectorAll("button").forEach((button, i) => {
      if (i === index) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
  }

  function fact(label, value) {
    if (!value) return;
    dFacts.append(el("dt", "", label), el("dd", "", value));
  }

  function openItem(item) {
    dTitle.textContent = item.title;
    dPrice.textContent = priceLabel(item);
    dPrice.className = item.status === "sold" ? "sticker sticker--static sticker--sold" : "sticker sticker--static";
    dBadge.textContent = item.status === "sold" ? "Sold" : item.status === "reserved" ? "Reserved" : "Available";
    dBadge.className = `badge badge--${item.status}`;
    dHint.textContent = "";

    // Photos: one big photo, plus small buttons to switch when there are several
    dThumbs.replaceChildren();
    item.photos.forEach((src, index) => {
      const li = el("li");
      const button = el("button");
      button.type = "button";
      button.setAttribute("aria-label", `Show photo ${index + 1} of ${item.photos.length}`);
      button.append(photo(src, "", 112, 140, false));
      button.addEventListener("click", () => showPhoto(item, index));
      li.append(button);
      dThumbs.append(li);
    });
    dThumbs.hidden = item.photos.length < 2;
    showPhoto(item, 0);

    // Facts
    dFacts.replaceChildren();
    fact("Condition", item.condition);
    fact("Category", item.category);
    fact("Item no.", item.id);
    if (item.added) {
      fact(
        "Listed",
        item.added.toLocaleDateString(CONFIG.locale, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" })
      );
    }
    dFacts.hidden = dFacts.children.length === 0;

    // Description: every line of the cell becomes its own paragraph
    dDesc.replaceChildren(
      ...item.description.split(/\n+/).filter((line) => line.trim() !== "").map((line) => el("p", "", line))
    );

    // Actions
    dActions.replaceChildren();
    if (item.status === "sold") {
      dActions.append(el("p", "dialog-note", "This item has found a new home."));
    } else {
      const message = inquiryText(item);
      const inquire = el("a", "btn btn--primary", item.status === "reserved" ? "Ask to be next in line" : "Inquire on Messenger");
      inquire.href = `${messengerBase}?text=${encodeURIComponent(message)}`;
      inquire.target = "_blank";
      inquire.rel = "noopener noreferrer";
      // Messenger may not fill in the message by itself, so a copy goes to the clipboard as well
      inquire.addEventListener("click", () => {
        copyText(message).then((copied) => {
          dHint.textContent = copied
            ? "Message copied. If Messenger opens with an empty box, paste it there."
            : "";
        });
      });
      dActions.append(inquire);
    }
    const copyLink = el("button", "btn btn--ghost", "Copy link to this item");
    copyLink.type = "button";
    copyLink.addEventListener("click", () => {
      const url = `${location.href.split("#")[0]}#item=${encodeURIComponent(item.id)}`;
      copyText(url).then((copied) => {
        dHint.textContent = copied ? "Link copied." : "Could not copy the link. Copy it from the address bar instead.";
      });
    });
    dActions.append(copyLink);

    document.title = `${item.title} | ${shopName}`;
    lastTriggerId = item.id;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }

  /* The item link (#item=A001) opens the pop-up, so a link can be shared and the Back button closes it. */
  function itemIdFromHash() {
    const match = /^#item=(.+)$/.exec(location.hash);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch (error) {
      return null;
    }
  }

  function syncWithHash() {
    const id = itemIdFromHash();
    if (id === null) {
      if (dialog.open) dialog.close();
      return;
    }
    const item = state.items.find((entry) => entry.id === id);
    if (item) {
      openItem(item);
    } else {
      if (dialog.open) dialog.close();
      showNotice("That item is no longer listed. Have a look at what is here now.");
    }
  }

  dialog.addEventListener("close", () => {
    document.title = pageTitle;
    if (itemIdFromHash() !== null) {
      // Closed with the button, Esc or a click outside: tidy the address bar
      if (openedByClick) {
        openedByClick = false;
        history.back();
      } else {
        history.replaceState(null, "", location.pathname + location.search);
      }
    }
    const trigger = Array.from(document.querySelectorAll("a.card-link")).find((a) => a.dataset.id === lastTriggerId);
    if (trigger) trigger.focus();
  });

  $("#dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close(); // a click on the dark area around the pop-up
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest && event.target.closest("a.card-link");
    const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (link && plain) openedByClick = true;
  });

  window.addEventListener("hashchange", syncWithHash);

  /* ======================================================================
     Loading the listings
     ====================================================================== */
  async function fetchText(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`${url} answered with status ${response.status}`);
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  function readSaved() {
    try { return localStorage.getItem(CONFIG.cacheKey); } catch (error) { return null; }
  }

  function writeSaved(text) {
    try { localStorage.setItem(CONFIG.cacheKey, text); } catch (error) { /* storage is full or blocked: fine */ }
  }

  // Live sheet first, then the copy this device saved last time, then the file that ships with the site.
  async function loadItems() {
    const attempts = [];
    if (CONFIG.sheetCsvUrl) {
      attempts.push({ source: "live", get: () => fetchText(CONFIG.sheetCsvUrl) });
      attempts.push({ source: "saved", get: async () => readSaved() });
    }
    attempts.push({ source: "backup", get: () => fetchText(CONFIG.backupCsv) });

    for (const attempt of attempts) {
      try {
        const text = await attempt.get();
        if (!text) continue;
        const items = rowsToItems(parseCsv(text));
        if (attempt.source === "live") writeSaved(text);
        return { items, source: attempt.source };
      } catch (error) {
        console.warn(`Could not use the ${attempt.source} listings:`, error);
      }
    }
    throw new Error("No listings could be loaded.");
  }

  /* ======================================================================
     Start-up
     ====================================================================== */
  function wireControls() {
    searchInput.addEventListener("input", () => {
      state.query = searchInput.value;
      render();
    });
    sortSelect.addEventListener("change", () => {
      state.sort = sortSelect.value;
      render();
    });
    showSoldBox.addEventListener("change", () => {
      state.showSold = showSoldBox.checked;
      render();
    });
    chipsBox.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-key]");
      if (!button) return;
      state.category = button.dataset.key;
      render();
    });
    $("#clear-filters").addEventListener("click", () => {
      state.query = "";
      state.category = "all";
      searchInput.value = "";
      render();
      searchInput.focus();
    });
  }

  function setUpMessengerLinks() {
    document.querySelectorAll("[data-messenger]").forEach((link) => {
      link.href = messengerBase;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
  }

  async function init() {
    const year = $("#year");
    if (year) year.textContent = String(new Date().getFullYear());
    setUpMessengerLinks();
    wireControls();

    // The browser can remember form choices across a reload; start from what is actually on screen
    state.query = searchInput.value;
    state.sort = SORTS[sortSelect.value] ? sortSelect.value : "newest";
    state.showSold = showSoldBox.checked;

    try {
      const { items, source } = await loadItems();
      state.items = items;
      state.categories = Array.from(
        new Map(items.map((item) => [item.categoryKey, item.category])).entries(),
        ([key, label]) => ({ key, label })
      ).sort((a, b) => a.label.localeCompare(b.label));

      if (source === "saved") {
        showNotice("The latest listings could not be reached, so this is the last copy this device loaded. It may be a little out of date.");
      } else if (source === "backup" && CONFIG.sheetCsvUrl) {
        showNotice("The latest listings could not be reached, so this is a saved copy. It may be a little out of date.");
      }

      buildChips();
      updateIntroCount();
      render();
      if (itemIdFromHash() !== null) syncWithHash(); // someone arrived through an item link
    } catch (error) {
      console.error(error);
      resultStatus.textContent = "";
      loadError.hidden = false;
    }
  }

  init();
})();
