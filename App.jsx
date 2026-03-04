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
    return { field: f.label, onPkg, inDb, match, note };
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
    if (/^[A-Z0-9][A-Z0-9-]{2,}$/.test(val) && /[A-Z]/.test(val) && /\d/.test(val)) candidates.add(val);
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

function inferDraftFromDb({ formData, allImages, productIndex, getProductByPn }) {
  const pnCandidates = detectPnCandidates({
    formData,
    allImages,
    productIndex,
    productName: formData["品名"] || formData["產品名稱"] || "",
  });
  for (const pn of pnCandidates) {
    const row = getProductByPn(pn);
    if (!row) continue;
    return {
      品號: pn,
      品名: formData["品名"] || formData["產品名稱"] || row.data.品名 || "",
      條碼: formData["條碼"] || row.data.條碼 || "",
      成份: row.data.成份 || "",
      分析值: row.data.分析值 || "",
      淨重: formData["淨重"] || formData["規格"] || row.data.淨重 || "",
    };
  }

  const context = `${JSON.stringify(formData || {})} ${(allImages || []).map((x) => x.name || "").join(" ")}`;
  const contextNorm = normalizeText(context);
  for (const [pn, row] of Object.entries(productIndex || {})) {
    const nameNorm = normalizeText(row?.data?.品名);
    if (nameNorm && contextNorm.includes(nameNorm)) {
      return {
        品號: normalizePn(pn),
        品名: row.data.品名 || "",
        條碼: row.data.條碼 || "",
        成份: row.data.成份 || "",
        分析值: row.data.分析值 || "",
        淨重: row.data.淨重 || "",
      };
    }
  }
  return null;
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

    const inferred = inferDraftFromDb({ formData, allImages, productIndex, getProductByPn });
    if (inferred) {
      COMPARE_FIELDS.forEach((f) => {
        if (!initialDraft[f.key] && inferred[f.key]) initialDraft[f.key] = inferred[f.key];
      });
    }

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
    setGroups((prev) => prev.map((g, i) => (i === gid ? { ...g, pkgDraft: { ...g.pkgDraft, [key]: value } } : g)));
  };

  const autofillFromDb = (gid) => {
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== gid) return g;
        const found = g.pn ? getProductByPn(g.pn) : null;
        if (!found) {
          setErr(g.pn ? `品號 ${g.pn} 在總表中查無資料，無法補欄位。` : "請先輸入或自動抓到品號，再補入總表欄位。");
          return g;
        }
        const nextDraft = { ...g.pkgDraft };
        COMPARE_FIELDS.forEach((f) => {
          if (!nextDraft[f.key] && found.data[f.key]) nextDraft[f.key] = found.data[f.key];
        });
        return { ...g, pkgDraft: nextDraft };
      }),
    );
  };

  const splitToNewGroup = (imgIdx, gid) => {
    setGroups((prev) => {
      const next = prev.map((g, i) => (i === gid ? { ...g, imageIndices: g.imageIndices.filter((x) => x !== imgIdx) } : g));
      const cleaned = next.filter((g) => g.imageIndices.length > 0);
      const oneImage = [allImages[imgIdx]].filter(Boolean);
      const inferred = inferDraftFromDb({ formData: {}, allImages: oneImage, productIndex, getProductByPn });
      cleaned.push({
        id: Date.now(),
        label: inferred?.品名 || `商品${cleaned.length + 1}`,
        pn: inferred?.品號 || "",
        imageIndices: [imgIdx],
        pkgDraft: { 品號: inferred?.品號 || "", 品名: inferred?.品名 || "", 條碼: inferred?.條碼 || "", 成份: inferred?.成份 || "", 分析值: inferred?.分析值 || "", 淨重: inferred?.淨重 || "" },
      });
      return cleaned;
    });
  };

  const goConfirm = () => {
    if (!groups.length) {
      setErr("請先建立至少一個商品分組。");
      return;
    }
    setErr("");
    setStage("confirm");
  };

  const runReview = () => {
    if (!groups.length) {
      setErr("請先建立至少一個商品分組。");
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

      const missing = [];
      if (!mergedDraft.品名) missing.push("包裝草稿未提供品名");
      if (!mergedDraft.品號) missing.push("包裝草稿未提供品號（已嘗試自動抓取）");
      if (!g.imageIndices.length) missing.push("此商品沒有圖片");

      const score = Math.max(0, 100 - missing.length * 15 - comparison.mismatched * 8 - (found ? 0 : 10));

      return {
        group: g,
        pn,
        found,
        comparison,
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
                <input value={g.label} onChange={(e) => updateGroup(gi, { label: e.target.value })} />
                <label>
                  品號：
                  <input
                    value={g.pn}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateGroup(gi, { pn: v });
                      updateGroupDraft(gi, "品號", normalizePn(v));
                    }}
                  />
                </label>
                <button className="ghost" onClick={() => autofillFromDb(gi)}>從總表補入空白欄位</button>
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
            {stage === "grouping" && <button className="primary" onClick={goConfirm}>下一步：確認擷取文字</button>}
            {stage === "confirm" && <button className="primary" onClick={runReview}>執行法規檢核</button>}
            {stage === "done" && <button className="ghost" onClick={() => setStage("confirm")}>返回文字確認</button>}
          </div>
        </section>
      )}

      {(stage === "confirm" || stage === "done") && (
        <section className="card">
          <h2>包裝擷取文字（可編輯確認）</h2>
          <p className="muted">檢核前可先人工修正欄位，會用這份資料比對總表。</p>
          {groups.map((g, gi) => (
            <div key={`draft-${g.id}`} className="resultCard">
              <h3>{g.label}</h3>
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
