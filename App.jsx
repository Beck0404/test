const { useState, useCallback, useEffect } = React;

const LEGAL_KNOWLEDGE = `【正確法規架構】
1. 包裝標示必要項目 → 法源：《動物保護法》第22-5條
2. 業者申報義務 → 《寵物食品業者申報辦法》第4條（後台行政申報，與包裝標示無關）
3. 廣告/宣傳用詞規範 → 《動物保護法》第22-5條第2項＋《寵物食品標示宣傳廣告涉及不實誇張或易生誤解認定原則》（113年7月1日生效）
4. 罰則 → 違反第22-5條：依《動物保護法》第29條，限期改善後可處 3~15萬元罰鍰`;

const COL_VARIANTS = {
  品號: ["品號", "產品編號", "品號 (productCode)", "貨 號", "貨號"],
  條碼: ["國條", "條  碼", "條碼(方便複製)", "亞馬遜條碼"],
  品名: ["產品名稱", "品名", "產品名稱 (productName)"],
  成份: ["成分", "成份"],
  分析值: ["營養成分及含量", "營養成分及含量(每100g含量)"],
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
          data: Object.fromEntries(
            Object.entries(colMap).map(([f, idx]) => [f, idx >= 0 ? String(row[idx] || "").trim() : ""]),
          ),
        };
        count++;
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
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = (e) => res(e.target.result);
    r.readAsDataURL(blob);
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
      allImages.push({ dataUrl, name, slideIndex: si, file: new File([blob], name, { type: blob.type || "image/png" }) });
    }
  }

  const formData = {};
  if (slideKeys[0]) {
    const s1xml = await zip.files[slideKeys[0]].async("text");
    const s1paras = xmlParas(s1xml);
    for (let i = 0; i < s1paras.length - 1; i++) {
      const p = s1paras[i];
      if ((p.endsWith(":") || p.endsWith("：")) && p.length < 20) {
        const val = s1paras[i + 1];
        if (val && val.length < 100 && !val.endsWith(":") && !val.endsWith("：")) formData[p.slice(0, -1).trim()] = val;
      }
    }
  }

  return { allImages, formData };
}

function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbMeta, setDbMeta] = useState(null);
  const [dbInit, setDbInit] = useState(false);
  const [productCount, setProductCount] = useState(0);

  const [allImages, setAllImages] = useState([]);
  const [formData, setFormData] = useState({});
  const [err, setErr] = useState("");
  const [stage, setStage] = useState("upload");
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await storageApi.get("petfood-db-v3");
        if (r?.value) {
          const s = JSON.parse(r.value);
          setDbMeta(s.meta || null);
          setProductCount(Object.keys(s.index || {}).length);
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
      setStage("upload");

      if (pptx) {
        const parsed = await parsePptx(pptx);
        setAllImages(parsed.allImages);
        setFormData(parsed.formData);
      } else if (imgs.length) {
        const loaded = await Promise.all(
          imgs.map(
            (f) =>
              new Promise((res) => {
                const r = new FileReader();
                r.onload = (e) => res({ dataUrl: e.target.result, name: f.name, slideIndex: 0 });
                r.readAsDataURL(f);
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
        .map((g) => ({
          ...g,
          imageIndices: g.imageIndices
            .filter((i) => i !== idx)
            .map((i) => (i > idx ? i - 1 : i)),
        }))
        .filter((g) => g.imageIndices.length > 0),
    );
  };

  const createInitialGroup = () => {
    if (!allImages.length) {
      setErr("請先上傳至少一張圖片後再進下一步。");
      return;
    }
    setErr("");
    setGroups([
      {
        id: 0,
        label: "商品一",
        pn: formData["品號"] || "",
        imageIndices: allImages.map((_, i) => i),
      },
    ]);
    setStage("grouping");
  };

  const updateGroup = (gid, patch) => setGroups((prev) => prev.map((g, i) => (i === gid ? { ...g, ...patch } : g)));

  const splitToNewGroup = (imgIdx, gid) => {
    setGroups((prev) => {
      const next = prev.map((g, i) =>
        i === gid ? { ...g, imageIndices: g.imageIndices.filter((x) => x !== imgIdx) } : g,
      );
      const cleaned = next.filter((g) => g.imageIndices.length > 0);
      cleaned.push({ id: Date.now(), label: `商品${cleaned.length + 1}`, pn: "", imageIndices: [imgIdx] });
      return cleaned;
    });
  };

  if (!dbInit) return null;

  return (
    <main className="container">
      <h1>寵物食品包裝法規校稿系統</h1>
      <p className="muted">已補上「下一步」流程與「手動刪圖」功能。</p>

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

      {stage === "grouping" && (
        <section className="card">
          <h2>商品分組（可繼續調整）</h2>
          <p className="muted">現在你可以編輯品號，或把某張圖拆成新商品群組。</p>
          {groups.map((g, gi) => (
            <div key={g.id} className="groupCard">
              <div className="groupHead">
                <input value={g.label} onChange={(e) => updateGroup(gi, { label: e.target.value })} />
                <label>
                  品號：
                  <input value={g.pn} onChange={(e) => updateGroup(gi, { pn: e.target.value })} />
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
          <p className="ok">✅ 已可進入下一步分組流程（後續可再接審核邏輯）。</p>
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
