const { useState, useCallback, useEffect } = React;

// 使用說明：
// 1) 這份檔案可直接由 index.html 透過 Babel 載入。
// 2) 需於執行環境提供 `window.storage`（get/set/delete）與 `window.CLAUDE_API_KEY`。
// 3) 若沒有 `window.storage`，會自動 fallback 到 localStorage。

const LEGAL_KNOWLEDGE = `【正確法規架構】
1. 包裝標示必要項目 → 法源：《動物保護法》第22-5條
2. 業者申報義務 → 《寵物食品業者申報辦法》第4條（後台行政申報，與包裝標示無關）
3. 廣告/宣傳用詞規範 → 《動物保護法》第22-5條第2項＋《寵物食品標示宣傳廣告涉及不實誇張或易生誤解認定原則》（113年7月1日生效）
4. 罰則 → 違反第22-5條：依《動物保護法》第29條，限期改善後可處 3~15萬元罰鍰

【必要標示項目（依《動物保護法》第22-5條）】
1. 品名
2. 淨重、容量、數量或度量（法定度量衡單位）
3. 主要原料與添加物名稱（依含量由多至少排列）
4. 主要營養成分及含量
5. 製造或加工業者名稱、地址及電話
   ※ 輸入品：另須加註輸入業者及國內負責廠商名稱、地址、電話及原產地
6. 有效日期或製造日期（須清楚標示年月日）
7. 保存期限、保存方法與條件
8. 適用寵物種類、使用方法及注意事項

【禁止標示/廣告內容（依《動物保護法》第22-5條第2項）】
- 不得有不實、誇張或易生誤解之情形
- 不得宣稱「預防」「改善」「治療」「減輕」特定動物疾病
- 禁止用詞：預防皮膚炎、消除紅腫、預防白內障、防止脫毛、降血壓、抗炎
- 「無添加」「不使用」等詞須載明具體成分名稱，否則視為不實
- 「獲獎」「認證」等詞須說明授獎機構、時間及獎項名稱

【合法正面宣稱（不視為誇大）】
維持：體型、活力、消化道機能、關節健康、心臟功能
保健：視力、口腔、皮膚、骨質
幫助：維護牙齦健康、控制牙垢形成`;

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
        index[pn] = { sheetName, data: Object.fromEntries(Object.entries(colMap).map(([f, idx]) => [f, idx >= 0 ? String(row[idx] || "").trim() : ""])) };
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
  const slideKeys = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => +a.match(/(\d+)\.xml$/)[1] - +b.match(/(\d+)\.xml$/)[1]);

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

  if (!dbInit) return null;

  return (
    <main className="container">
      <h1>寵物食品包裝法規校稿系統</h1>
      <p className="muted">現在 index.html 已可直接掛載 App.jsx（React + Babel），不需 bundler 也能跑。</p>

      <section className="card">
        <h2>產品總表 Excel</h2>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => handleExcel(e.target.files?.[0])} />
        <p>{dbReady ? `✅ 已載入 ${dbMeta?.filename}（${productCount} 筆）` : "尚未載入產品總表"}</p>
      </section>

      <section className="card">
        <h2>包裝檔案（圖片 / PPTX）</h2>
        <input type="file" multiple accept="image/*,.pptx,.ppt" onChange={(e) => handleFiles(e.target.files)} />
        <p>已載入圖片數：{allImages.length}</p>
        {allImages.length > 0 && (
          <div className="grid">
            {allImages.map((img, i) => (
              <figure key={i} className="thumb">
                <img src={img.dataUrl} alt={img.name} />
                <figcaption>圖 {i + 1}：{img.name}</figcaption>
              </figure>
            ))}
          </div>
        )}
        {Object.keys(formData).length > 0 && <pre>{JSON.stringify(formData, null, 2)}</pre>}
      </section>

      <section className="card">
        <h2>法規知識庫（節錄）</h2>
        <pre>{LEGAL_KNOWLEDGE.slice(0, 300)}...</pre>
      </section>

      {err && <p className="error">⚠️ {err}</p>}
    </main>
  );
}

window.App = App;
