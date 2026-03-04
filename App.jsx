const { useState, useCallback, useEffect } = React;

const LEGAL_KNOWLEDGE = `【正確法規架構】
1. 包裝標示必要項目 → 法源：《動物保護法》第22-5條
2. 業者申報義務 → 《寵物食品業者申報辦法》第4條（後台行政申報，與包裝標示無關）
3. 廣告/宣傳用詞規範 → 《動物保護法》第22-5條第2項＋《寵物食品標示宣傳廣告涉及不實誇張或易生誤解認定原則》（113年7月1日生效）
4. 罰則 → 違反第22-5條：依《動物保護法》第29條，限期改善後可處 3~15萬元罰鍰`;

const COMPARE_FIELDS = [
  { key: "品號", label: "品號" },
  { key: "條碼", label: "條碼" },
  { key: "品名", label: "品名" },
  { key: "成份", label: "成份" },
  { key: "分析值", label: "分析值" },
  { key: "淨重", label: "淨重" },
];

const COL_VARIANTS = {
  品號: ["品號", "產品編號", "品號 (productCode)", "貨 號", "貨號"],
  條碼: ["國條", "條  碼", "條碼(方便複製)", "亞馬遜條碼"],
  品名: ["產品名稱", "品名", "產品名稱 (productName)"],
  成份: ["成分", "成份", "主要原料與添加物名稱", "主要原料", "原料"],
  分析值: ["營養成分及含量", "營養成分及含量(每100g含量)", "主要營養成分及含量", "保證分析值"],
  淨重: ["規格(g/包(入); 包/袋) (KG/包) (g/罐; 罐/盒)", "內容量", "內容量(淨重KG ; 毛重KG)", "規格lb or oz/包(g)", "規格"],
};

const storageApi = {
  async get(key) {
    if (window.storage?.get) return window.storage.get(key);
    const value = localStorage.getItem(key);
    return value == null ? null : { value };
  },
  async set(key, value) {
    if (window.storage?.set) return window.storage.set(key, value);
    localStorage.setItem(key, value);
  },
};

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, "").trim().toLowerCase();
}

function normalizePn(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function findCol(headers, variants) {
  for (const v of variants) {
    const f = headers.find((h) => h.replace(/\s+/g, "") === v.replace(/\s+/g, ""));
    if (f) return f;
  }
  for (const v of variants) {
    const kw = v.split("(")[0].trim().replace(/\s+/g, "");
    const f = headers.find((h) => h.replace(/\s+/g, "").includes(kw));
    if (f) return f;
  }
  return null;
}

function buildProductIndex(workbook) {
  const index = {};
  const sheetSummary = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (raw.length < 2) continue;

    let headerRowIdx = -1;
    let headerRow = [];
    for (let i = 0; i < Math.min(raw.length, 5); i++) {
      const row = raw[i].map((c) => String(c || ""));
      if (COL_VARIANTS.品號.some((v) => row.some((c) => c.replace(/\s+/g, "").includes(v.split("(")[0].replace(/\s+/g, ""))))) {
        headerRowIdx = i;
        headerRow = row;
        break;
      }
    }
    if (headerRowIdx === -1) continue;

    const colMap = {};
    for (const [field, variants] of Object.entries(COL_VARIANTS)) {
      const col = findCol(headerRow, variants);
      colMap[field] = col ? headerRow.indexOf(col) : -1;
    }
    if (colMap["品號"] === -1) continue;

    let count = 0;
    for (let i = headerRowIdx + 1; i < raw.length; i++) {
      const row = raw[i];
      const pn = String(row[colMap["品號"]] || "").trim();
      if (pn && !pn.startsWith("#") && pn !== "undefined" && !index[pn]) {
        index[pn] = {
          sheetName,
          data: Object.fromEntries(Object.entries(colMap).map(([f, idx]) => [f, idx >= 0 ? String(row[idx] || "").trim() : ""])),
        };
        count += 1;
      }
    }
    if (count > 0) sheetSummary.push({ sheetName, count });
  }

  return { index, sheetSummary };
}

let _JSZip = null;
async function loadJSZip() {
  if (_JSZip) return _JSZip;
  if (window.JSZip) return (_JSZip = window.JSZip);
  const mod = await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
  return (_JSZip = mod.default || mod);
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(blob);
  });
}

function xmlParas(xml) {
  return [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)]
    .map((m) => [...m[1].matchAll(/<a:t[^>]*?>([^<]*)<\/a:t>/g)].map((t) => t[1]).join("").trim())
    .filter((t) => t);
}

function parseRels(relsXml) {
  const results = [];
  for (const m of relsXml.matchAll(/<Relationship([\s\S]*?)\/>/g)) {
    const attrs = m[1];
    const typeM = attrs.match(/Type="([^"]+)"/);
    const targetM = attrs.match(/Target="([^"]+)"/);
    if (typeM && targetM) results.push({ type: typeM[1], target: targetM[1] });
  }
  return results;
}


let _Tesseract = null;
async function loadTesseract() {
  if (_Tesseract) return _Tesseract;
  if (window.Tesseract) return (_Tesseract = window.Tesseract);
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Tesseract 載入失敗，請確認網路連線"));
    document.head.appendChild(script);
  });
  if (!window.Tesseract) throw new Error("Tesseract 初始化失敗");
  _Tesseract = window.Tesseract;
  return _Tesseract;
}

function preprocessImageForOcr(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.max(1, Math.min(2, 1800 / Math.max(img.width, img.height)));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        const v = gray > 168 ? 255 : gray < 70 ? 0 : gray;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function pickFirstMatch(lines, patterns) {
  for (const re of patterns) {
    for (const line of lines) {
      const m = line.match(re);
      if (m?.[1]) return m[1].trim();
    }
  }
  return "";
}

function isValidForField(field, value) {
  const v = String(value || "").trim();
  if (!v) return false;
  if (field === "品號") return /^[A-Z0-9-]{8,16}$/i.test(v) && /[A-Z]/i.test(v) && /\d/.test(v);
  if (field === "條碼") return /^\d{8,14}$/.test(v);
  if (field === "品名") return v.length >= 2 && v.length <= 40 && !/[{}<>]/.test(v);
  if (field === "淨重") return /(kg|g|mg|ml|l|公斤|公克|毫升)/i.test(v) && /\d/.test(v);
  if (field === "分析值") return /(蛋白|脂肪|纖維|灰分|水分|鈣|磷|熱量|kcal|%|mg|g)/i.test(v);
  if (field === "成份") return /(雞|魚|肉|穀|玉米|脂|纖維|維生素|礦物質|添加物|原料|成分|成份)/i.test(v);
  return true;
}

function parseDraftFromOcr(rawText, fallbackName = "", formData = {}) {
  const text = String(rawText || "").split("\r").join("\n");
  const rawLines = text.split("\n").map((x) => x.trim()).filter(Boolean);
  const lines = rawLines.map((line) => line.replace(/[｜|]/g, " ").replace(/\s+/g, " ").trim());

  const getSection = (headerRegex, stopRegex, maxLines = 14) => {
    const idx = lines.findIndex((line) => headerRegex.test(line));
    if (idx === -1) return "";
    const out = [];
    const inline = lines[idx].replace(headerRegex, "").replace(/^[：:\s]+/, "").trim();
    if (inline) out.push(inline);
    for (let i = idx + 1; i < Math.min(lines.length, idx + maxLines); i++) {
      const l = lines[i];
      if (!l) continue;
      if (stopRegex.test(l)) break;
      out.push(l);
    }
    return out.join(" ").replace(/\s{2,}/g, " ").trim();
  };

  const pnLabeled = pickFirstMatch(lines, [
    /(?:品號|產品編號|貨號)\s*[:：]\s*([A-Z0-9-]{8,16})/i,
    /(?:品號|產品編號|貨號)\s+([A-Z0-9-]{8,16})/i,
  ]);
  const pnFromForm = normalizePn(formData?.品號 || formData?.產品編號 || "");
  const pnExact10 = (text.match(/\b([A-Z0-9]{10})\b/g) || [])
    .map((x) => normalizePn(x))
    .find((x) => /[A-Z]/.test(x) && /\d/.test(x));
  const pnGeneric = (text.match(/\b([A-Z0-9]{8,16})\b/g) || [])
    .map((x) => normalizePn(x))
    .find((x) => /[A-Z]/.test(x) && /\d/.test(x));
  const pn = normalizePn(pnLabeled || pnFromForm || pnExact10 || pnGeneric || "");

  const barcodeLabeled = pickFirstMatch(lines, [
    /(?:條碼|國際條碼|barcode)\s*[:：]?\s*(\d{8,14})/i,
  ]);
  const barcodeGeneric = (text.match(/\b(\d{8,14})\b/) || [])[1] || "";
  const barcode = (barcodeLabeled || barcodeGeneric || "").trim();

  const nameLabeled = pickFirstMatch(lines, [
    /(?:品名|產品名稱)\s*[:：]\s*(.{2,40})/i,
  ]);
  let productName = nameLabeled;
  if (!productName) {
    for (const line of lines.slice(0, 14)) {
      if (line.length < 2 || line.length > 32) continue;
      if (/[:：]/.test(line)) continue;
      if (/\d{5,}/.test(line)) continue;
      if (/(成分|成份|營養|分析|保存|注意事項|製造|產地|條碼|重量|淨重|內容量|規格)/.test(line)) continue;
      productName = line;
      break;
    }
  }

  let weight = pickFirstMatch(lines, [
    /(?:淨重|內容量|規格)\s*[:：]?\s*([^\n]{1,30})/i,
  ]);
  if (!weight) {
    weight = lines.find((line) => /\b\d+(?:\.\d+)?\s?(?:kg|g|mg|ml|l|公斤|公克|毫升)\b/i.test(line)) || "";
  }

  let ingredient = getSection(
    /(?:成分|成份|原料|主要原料|配方)\s*[：:]?/i,
    /(?:營養|分析|保證分析|淨重|內容量|保存|注意事項|製造|產地|使用方式|餵食)/i,
  );
  if (!ingredient) {
    const cand = lines.filter((l) => /(雞|魚|肉|穀|玉米|脂|纖維|維生素|礦物質|添加物|原料)/.test(l));
    ingredient = cand.slice(0, 4).join(" ");
  }

  let analysis = getSection(
    /(?:營養成分|分析值|保證分析|主要營養成分|營養分析)\s*[：:]?/i,
    /(?:成分|成份|原料|淨重|內容量|保存|注意事項|製造|產地|餵食|使用方式)/i,
  );
  if (!analysis) {
    const cand = lines.filter((l) => /(蛋白|脂肪|纖維|灰分|水分|鈣|磷|熱量|kcal|%|mg|g)/i.test(l));
    analysis = cand.slice(0, 6).join(" ");
  }

  const draft = {
    品號: isValidForField("品號", pn) ? pn : "",
    條碼: isValidForField("條碼", barcode) ? barcode : "",
    品名: isValidForField("品名", productName || fallbackName) ? (productName || fallbackName) : "",
    成份: isValidForField("成份", ingredient) ? ingredient : "",
    分析值: isValidForField("分析值", analysis) ? analysis : "",
    淨重: isValidForField("淨重", weight) ? weight.trim() : "",
  };

  return draft;
}


async function parsePptx(file) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideKeys = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => +a.match(/(\d+)\.xml$/)[1] - +b.match(/(\d+)\.xml$/)[1]);

  const allImages = [];
  const seenMedia = new Set();

  for (let si = 0; si < slideKeys.length; si++) {
    const relsKey = `ppt/slides/_rels/slide${si + 1}.xml.rels`;
    if (!zip.files[relsKey]) continue;
    const relsXml = await zip.files[relsKey].async("text");

    for (const { type, target } of parseRels(relsXml)) {
      if (!type.toLowerCase().includes("image")) continue;
      const mediaPath = target.startsWith("../") ? `ppt/${target.slice(3)}` : target;
      if (!mediaPath.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i) || !zip.files[mediaPath] || seenMedia.has(mediaPath)) continue;
      seenMedia.add(mediaPath);

      const blob = await zip.files[mediaPath].async("blob");
      const dataUrl = await blobToDataUrl(blob);
      const name = mediaPath.split("/").pop();
      allImages.push({ dataUrl, name, slideIndex: si });
    }
  }

  const formData = {};
  if (slideKeys[0]) {
    const s1xml = await zip.files[slideKeys[0]].async("text");
    const paras = xmlParas(s1xml);
    for (let i = 0; i < paras.length - 1; i++) {
      const p = paras[i];
      if ((p.endsWith(":") || p.endsWith("：")) && p.length < 20) {
        const val = paras[i + 1];
        if (val && val.length < 100 && !val.endsWith(":") && !val.endsWith("：")) formData[p.slice(0, -1).trim()] = val;
      }
    }
  }

  return { allImages, formData };
}

function compareWithDb(pkgDraft, dbRow) {
  const rows = COMPARE_FIELDS.map((f) => {
    const onPkg = pkgDraft[f.key] || "";
    const inDb = dbRow?.data?.[f.key] || "";
    const pkgNorm = normalizeText(onPkg);
    const dbNorm = normalizeText(inDb);
    const match = pkgNorm && dbNorm ? pkgNorm === dbNorm : null;
    let note = "";
    if (match === false) note = "內容不一致";
    if (!pkgNorm && dbNorm) note = "包裝草稿未填";
    if (pkgNorm && !dbNorm) note = "總表無資料";
    return { key: f.key, field: f.label, onPkg, inDb, match, note };
  });

  const matched = rows.filter((r) => r.match === true).length;
  const mismatched = rows.filter((r) => r.match === false).length;
  const missingOnPkg = rows.filter((r) => !normalizeText(r.onPkg) && normalizeText(r.inDb)).map((r) => r.field);
  const missingInDb = rows.filter((r) => normalizeText(r.onPkg) && !normalizeText(r.inDb)).map((r) => r.field);
  const mismatchFields = rows.filter((r) => r.match === false).map((r) => r.field);
  return { rows, matched, mismatched, missingOnPkg, missingInDb, mismatchFields };
}

function detectPnCandidates({ formData, allImages, productIndex, productName }) {
  const candidates = new Set();
  const addIfPnLike = (text) => {
    if (!text) return;
    const val = normalizePn(text);
    if (/^[A-Z0-9-]{8,16}$/.test(val) && /[A-Z]/.test(val) && /\d/.test(val)) candidates.add(val);
  };

  addIfPnLike(formData["品號"] || formData["產品編號"] || formData["productCode"]);

  const allFormText = JSON.stringify(formData || {});
  for (const m of allFormText.matchAll(/[A-Za-z0-9-]{3,}/g)) addIfPnLike(m[0]);
  for (const img of allImages || []) {
    for (const m of String(img.name || "").matchAll(/[A-Za-z0-9-]{3,}/g)) addIfPnLike(m[0]);
  }

  const normName = normalizeText(productName);
  if (normName) {
    for (const [pn, entry] of Object.entries(productIndex || {})) {
      if (normalizeText(entry?.data?.品名) === normName) candidates.add(normalizePn(pn));
    }
  }

  return [...candidates];
}

function createPnResolver(productIndex) {
  const map = new Map();
  Object.entries(productIndex || {}).forEach(([pn, entry]) => {
    map.set(normalizePn(pn), entry);
  });
  return (pn) => map.get(normalizePn(pn)) || null;
}


function buildGroupChecklist(group) {
  const draft = group?.pkgDraft || {};
  const requiredMissing = [];
  if (!normalizePn(group?.pn || draft.品號)) requiredMissing.push("品號");
  if (!String(draft.品名 || "").trim()) requiredMissing.push("品名");
  return {
    requiredMissing,
    ready: requiredMissing.length === 0,
  };
}

function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbMeta, setDbMeta] = useState(null);
  const [dbInit, setDbInit] = useState(false);
  const [productCount, setProductCount] = useState(0);
  const [productIndex, setProductIndex] = useState({});
  const getProductByPn = createPnResolver(productIndex);

  const [allImages, setAllImages] = useState([]);
  const [formData, setFormData] = useState({});
  const [err, setErr] = useState("");
  const [stage, setStage] = useState("upload"); // upload | grouping | confirm | done
  const [groups, setGroups] = useState([]);
  const [reports, setReports] = useState([]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMsg, setOcrMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await storageApi.get("petfood-db-v3");
        if (r?.value) {
          const data = JSON.parse(r.value);
          setDbMeta(data.meta || null);
          setProductIndex(data.index || {});
          setProductCount(Object.keys(data.index || {}).length);
          setDbReady(true);
        }
      } finally {
        setDbInit(true);
      }
    })();
  }, []);

  const handleExcel = (file) => {
    if (!file) return;
    setErr("");
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const { index, sheetSummary } = buildProductIndex(wb);
        const meta = { filename: file.name, count: Object.keys(index).length, sheets: sheetSummary.length, updatedAt: new Date().toLocaleString("zh-TW") };
        await storageApi.set("petfood-db-v3", JSON.stringify({ index, sheetSummary, meta }));
        setDbMeta(meta);
        setProductIndex(index);
        setProductCount(meta.count);
        setDbReady(true);
      } catch (e2) {
        setErr(`Excel 解析失敗：${e2.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFiles = useCallback(async (files) => {
    const arr = Array.from(files || []);
    const pptx = arr.find((f) => /\.pptx?$/i.test(f.name));
    const imgs = arr.filter((f) => f.type.startsWith("image/"));

    try {
      setErr("");
      setGroups([]);
      setReports([]);
      setStage("upload");
      setOcrBusy(false);
      setOcrMsg("");

      if (pptx) {
        const parsed = await parsePptx(pptx);
        setAllImages(parsed.allImages);
        setFormData(parsed.formData);
      } else if (imgs.length) {
        const loaded = await Promise.all(
          imgs.map(
            (f) =>
              new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve({ dataUrl: e.target.result, name: f.name, slideIndex: 0 });
                reader.readAsDataURL(f);
              }),
          ),
        );
        setAllImages(loaded);
        setFormData({});
      }
    } catch (e) {
      setErr(`檔案解析失敗：${e.message}`);
    }
  }, []);

  const removeImage = (idx) => {
    setAllImages((prev) => prev.filter((_, i) => i !== idx));
    setGroups((prev) =>
      prev
        .map((g) => ({ ...g, imageIndices: g.imageIndices.filter((i) => i !== idx).map((i) => (i > idx ? i - 1 : i)) }))
        .filter((g) => g.imageIndices.length > 0),
    );
  };

  const createInitialGroup = () => {
    if (!allImages.length) {
      setErr("請先上傳至少一張圖片後再進下一步。");
      return;
    }
    const initialDraft = {
      品號: formData["品號"] || "",
      品名: formData["品名"] || formData["產品名稱"] || "",
      條碼: formData["條碼"] || "",
      成份: "",
      分析值: "",
      淨重: formData["淨重"] || formData["規格"] || "",
    };

    const detectedPn = detectPnCandidates({ formData, allImages, productIndex, productName: initialDraft.品名 })[0] || "";
    if (!initialDraft.品號 && detectedPn) initialDraft.品號 = detectedPn;

    setErr("");
    setGroups([
      {
        id: 0,
        label: initialDraft.品名 || "商品一",
        pn: normalizePn(initialDraft.品號),
        imageIndices: allImages.map((_, i) => i),
        pkgDraft: initialDraft,
      },
    ]);
    setStage("grouping");
  };

  const updateGroup = (gid, patch) =>
    setGroups((prev) =>
      prev.map((g, i) =>
        i === gid ? { ...g, ...patch, ...(patch.pn !== undefined ? { pn: normalizePn(patch.pn) } : {}) } : g,
      ),
    );

  const updateGroupDraft = (gid, key, value) => {
    setGroups((prev) =>
      prev.map((g, i) =>
        i === gid
          ? {
              ...g,
              pkgDraft: { ...g.pkgDraft, [key]: value },
            }
          : g,
      ),
    );
  };

  const splitToNewGroup = (imgIdx, gid) => {
    setGroups((prev) => {
      const next = prev.map((g, i) => (i === gid ? { ...g, imageIndices: g.imageIndices.filter((x) => x !== imgIdx) } : g));
      const cleaned = next.filter((g) => g.imageIndices.length > 0);
      cleaned.push({
        id: Date.now(),
        label: `商品${cleaned.length + 1}`,
        pn: "",
        imageIndices: [imgIdx],
        pkgDraft: { 品號: "", 品名: "", 條碼: "", 成份: "", 分析值: "", 淨重: "" },
      });
      return cleaned;
    });
  };

  const runAutoOcrForGroups = async () => {
    if (!groups.length) return;
    setOcrBusy(true);
    setOcrMsg("初始化 OCR 引擎中...");
    try {
      const Tesseract = await loadTesseract();
      const next = [...groups];
      for (let gi = 0; gi < next.length; gi++) {
        const g = next[gi];
        if (!g?.imageIndices?.length) continue;
        const needOcr = COMPARE_FIELDS.some((f) => !String(g.pkgDraft?.[f.key] || "").trim());
        if (!needOcr && g.ocrText) continue;

        const texts = [];
        for (let ii = 0; ii < g.imageIndices.length; ii++) {
          const imgIdx = g.imageIndices[ii];
          const img = allImages[imgIdx];
          if (!img?.dataUrl) continue;
          setOcrMsg(`OCR 辨識中：${g.label || `商品${gi + 1}`}（第 ${ii + 1}/${g.imageIndices.length} 張）`);
          const prepared = await preprocessImageForOcr(img.dataUrl);
          const result = await Tesseract.recognize(prepared, "chi_tra+eng", {
            tessedit_pageseg_mode: "6",
            preserve_interword_spaces: "1",
          });
          const textOut = (result?.data?.text || "").trim();
          if (textOut) texts.push(textOut);
        }

        const mergedText = texts.join("\n").trim();
        const guessed = parseDraftFromOcr(mergedText, g.label || "", formData);
        const nextDraft = { ...g.pkgDraft };
        COMPARE_FIELDS.forEach((f) => {
          const cand = String(guessed[f.key] || "").trim();
          if (!cand) return;
          if (!isValidForField(f.key, cand)) return;
          if (!String(nextDraft[f.key] || "").trim()) nextDraft[f.key] = cand;
        });
        next[gi] = { ...g, pn: normalizePn(g.pn || guessed.品號), pkgDraft: nextDraft, ocrText: mergedText };
      }
      setGroups(next);
      setOcrMsg("OCR 完成，請確認草稿內容。");
      return next;
    } catch (e) {
      setErr(`OCR 失敗：${e.message}`);
      setOcrMsg("");
      return groups;
    } finally {
      setOcrBusy(false);
    }
  };

  const goConfirm = async () => {
    if (!groups.length) {
      setErr("請先建立至少一個商品分組。");
      return;
    }
    const latestGroups = await runAutoOcrForGroups();
    const needFix = latestGroups
      .map((g) => ({ label: g.label || "未命名商品", check: buildGroupChecklist(g) }))
      .filter((x) => !x.check.ready);
    if (needFix.length) {
      setErr(`以下商品尚未填完必要欄位（品號/品名）：${needFix.map((x) => x.label).join("、")}`);
    } else {
      setErr("");
    }
    setStage("confirm");
  };

  const runReview = () => {
    if (!groups.length) {
      setErr("請先建立至少一個商品分組。");
      return;
    }

    const blockers = groups
      .map((g) => ({ label: g.label || "未命名商品", check: buildGroupChecklist(g) }))
      .filter((x) => !x.check.ready);
    if (blockers.length) {
      setErr(`無法送檢：以下商品缺少必要欄位（品號/品名）：${blockers.map((x) => x.label).join("、")}`);
      setStage("confirm");
      return;
    }

    const output = groups.map((g) => {
      let pn = normalizePn(g.pn || g.pkgDraft?.品號 || "");
      if (!pn) {
        pn =
          detectPnCandidates({
            formData,
            allImages: g.imageIndices.map((idx) => allImages[idx]).filter(Boolean),
            productIndex,
            productName: g.pkgDraft?.品名 || g.label,
          })[0] || "";
      }
      const found = pn ? getProductByPn(pn) : null;
      const mergedDraft = { ...g.pkgDraft, 品號: pn };
      const comparison = compareWithDb(mergedDraft, found);
      const checklist = buildGroupChecklist(g);

      const missing = [];
      if (!mergedDraft.品名) missing.push("包裝草稿未提供品名");
      if (!mergedDraft.品號) missing.push("包裝草稿未提供品號（已嘗試自動抓取）");
      if (!g.imageIndices.length) missing.push("此商品沒有圖片");

      const score = Math.max(0, 100 - missing.length * 10 - comparison.mismatched * 8 - (found ? 0 : 10));

      return {
        group: g,
        pn,
        found,
        comparison,
        checklist,
        missing,
        score,
      };
    });

    setReports(output);
    setStage("done");
  };

  if (!dbInit) return null;

  return (
    <main className="container">
      <h1>寵物食品包裝法規校稿系統</h1>
      <p className="muted">流程：上傳 → 分組 → 確認可編輯文字草稿 → 檢核結果</p>
      <section className="card">
        <h2>使用流程建議（先確認再比對）</h2>
        <ol className="flowList">
          <li>先上傳圖片/PPT，刪掉不相關圖片。</li>
          <li>在「商品分組」填好每個商品的品名與品號。</li>
          <li>進入確認頁前會先自動 OCR 讀圖，再由你人工覆核修正。</li>
          <li>送檢前確認必要欄位（品號、品名）已完成，再看差異報告。</li>
        </ol>
      </section>

      <section className="card">
        <h2>產品總表 Excel</h2>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => handleExcel(e.target.files?.[0])} />
        <p>{dbReady ? `✅ 已載入 ${dbMeta?.filename}（${productCount} 筆）` : "尚未載入產品總表"}</p>
      </section>

      <section className="card">
        <h2>包裝檔案（圖片 / PPTX）</h2>
        <input type="file" multiple accept="image/*,.pptx,.ppt" onChange={(e) => handleFiles(e.target.files)} />
        <p>已載入圖片數：{allImages.length}</p>

        {Object.keys(formData).length > 0 && <pre>{JSON.stringify(formData, null, 2)}</pre>}

        {allImages.length > 0 && (
          <>
            <div className="grid">
              {allImages.map((img, i) => (
                <figure key={`${img.name}-${i}`} className="thumb">
                  <img src={img.dataUrl} alt={img.name} />
                  <figcaption>
                    圖 {i + 1}：{img.name}
                    <button className="danger" onClick={() => removeImage(i)}>刪除</button>
                  </figcaption>
                </figure>
              ))}
            </div>
            <div className="actions">
              <button className="primary" onClick={createInitialGroup}>下一步：建立商品分組</button>
            </div>
          </>
        )}
      </section>

      {(stage === "grouping" || stage === "confirm" || stage === "done") && (
        <section className="card">
          <h2>商品分組</h2>
          {groups.map((g, gi) => (
            <div key={g.id} className="groupCard">
              <div className="groupHead">
                <label>
                  商品名稱（群組名稱）：
                  <input
                    value={g.label}
                    placeholder="例如：活力零食 雞肉切片"
                    onChange={(e) => updateGroup(gi, { label: e.target.value })}
                  />
                </label>
                <label>
                  品號（產品編號）：
                  <input
                    value={g.pn}
                    placeholder="例如：GL01、TPRL01J"
                    onChange={(e) => {
                      const v = e.target.value;
                      updateGroup(gi, { pn: v });
                      updateGroupDraft(gi, "品號", normalizePn(v));
                    }}
                  />
                </label>

              </div>
              <div className="grid">
                {g.imageIndices.map((idx) => {
                  const img = allImages[idx];
                  if (!img) return null;
                  return (
                    <figure key={`g-${gi}-${idx}`} className="thumb selected">
                      <img src={img.dataUrl} alt={img.name} />
                      <figcaption>
                        圖 {idx + 1}
                        <button className="ghost" onClick={() => splitToNewGroup(idx, gi)}>拆成新商品</button>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="actions">
            {stage === "grouping" && <button className="primary" onClick={goConfirm} disabled={ocrBusy}>{ocrBusy ? "OCR 辨識中..." : "下一步：自動OCR並確認文字"}</button>}
            {stage === "confirm" && <button className="primary" onClick={runReview} disabled={ocrBusy}>執行法規檢核</button>}
            {stage === "done" && <button className="ghost" onClick={() => setStage("confirm")}>返回文字確認</button>}
            {(ocrBusy || ocrMsg) && <p className="muted">{ocrMsg || "OCR 處理中..."}</p>}
          </div>
        </section>
      )}

      {(stage === "confirm" || stage === "done") && (
        <section className="card">
          <h2>包裝擷取文字（人工確認草稿）</h2>
          <p className="muted">系統會先自動 OCR 讀取你上傳的包裝圖片/PPT（含成份、分析值、淨重嘗試擷取），再請你人工覆核與修正。</p>
          {groups.map((g, gi) => (
            <div key={`draft-${g.id}`} className="resultCard">
              <h3>{g.label}</h3>
              {(() => {
                const ck = buildGroupChecklist(g);
                return (
                  <p className={ck.ready ? "ok" : "warn"}>
                    {ck.ready ? "✅ 必要欄位已填寫（可送檢）" : `⚠️ 缺少必要欄位：${ck.requiredMissing.join("、")}`}
                  </p>
                );
              })()}
              {g.ocrText && (
                <details>
                  <summary className="muted">查看 OCR 原始文字</summary>
                  <pre>{g.ocrText}</pre>
                </details>
              )}
              <div className="formGrid">
                {COMPARE_FIELDS.map((f) => (
                  <label key={`${g.id}-${f.key}`}>
                    {f.label}
                    <textarea
                      rows={f.key === "成份" || f.key === "分析值" ? 3 : 1}
                      value={g.pkgDraft?.[f.key] || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (f.key === "品號") updateGroup(gi, { pn: val });
                        updateGroupDraft(gi, f.key, f.key === "品號" ? normalizePn(val) : val);
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {stage === "done" && (
        <section className="card">
          <h2>檢核結果</h2>
          {reports.map((r, i) => (
            <div key={i} className="resultCard">
              <h3>{r.group.label}（{r.pn || "未填品號"}）</h3>
              <p>合規評分：<strong>{r.score}</strong> / 100</p>
              <p>總表比對：{r.found ? `產品總表有此品號（分頁：${r.found.sheetName}）` : "產品總表查無此品號"}</p>

              {r.missing.length > 0 && (
                <ul>
                  {r.missing.map((m, mi) => <li key={mi}>{m}</li>)}
                </ul>
              )}

              {r.found && (
                <>
                <div className="diffSummary">
                  <span>✅ 一致：{r.comparison.matched}</span>
                  <span>❌ 不一致：{r.comparison.mismatched}</span>
                  <span>🟡 包裝缺漏：{r.comparison.missingOnPkg.length}</span>
                  <span>🟣 總表缺漏：{r.comparison.missingInDb.length}</span>
                </div>
                <table className="cmpTable">
                  <thead>
                    <tr>
                      <th>欄位</th>
                      <th>包裝草稿</th>
                      <th>總表資料</th>
                      <th>結果</th>
                      <th>差異說明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.comparison.rows.map((row, ri) => (
                      <tr key={ri}>
                        <td>{row.field}</td>
                        <td>{row.onPkg || "（空白）"}</td>
                        <td>{row.inDb || "（空白）"}</td>
                        <td>
                          {row.match === true ? "✅ 一致" : row.match === false ? "❌ 不一致" : "— 未判定"}
                        </td>
                        <td>{row.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2>法規知識庫（節錄）</h2>
        <pre>{LEGAL_KNOWLEDGE}</pre>
      </section>

      {err && <p className="error">⚠️ {err}</p>}
    </main>
  );
}

window.App = App;
