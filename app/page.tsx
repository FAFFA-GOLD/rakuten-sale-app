"use client";
import { useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import { signOut } from "next-auth/react";

// ==========================================
// ▼ 設定・定義エリア
// ==========================================

const SHOPS = [
  { id: "goodlifeshop", name: "グットライフショップ" },
  { id: "marumoto", name: "まるげん" },
];

const TAX_THRESHOLD = 1;

const BG_COLORS = [
  { name: "白", code: "#ffffff" },
  { name: "クリーム", code: "#fffef0" },
  { name: "さくら", code: "#fff0f0" },
  { name: "グレー", code: "#f5f5f5" },
  { name: "黒(文字白)", code: "#333333" },
];

type Product = { 
  code: string; name: string; price: string; refPrice: string; imageUrl: string; url: string; comment: string; 
};
type ImageItem = { imageUrl: string; linkUrl: string; };
type BlockType = 'top_image' | 'banner_list' | 'coupon_list' | 'product_grid' | 'custom_html' | 'spacer' | 'timer_banner';

interface BaseBlock { id: string; type: BlockType; }
interface TopImageBlock extends BaseBlock { type: 'top_image'; imageUrl: string; linkUrl: string; }
interface BannerListBlock extends BaseBlock { 
  type: 'banner_list'; banners: ImageItem[]; layout: '1'|'2'|'3'|'4'; headerHtml: string;
}
interface CouponListBlock extends BaseBlock { type: 'coupon_list'; coupons: ImageItem[]; }
interface CustomHtmlBlock extends BaseBlock { type: 'custom_html'; content: string; }
interface SpacerBlock extends BaseBlock { type: 'spacer'; height: number; }
interface TimerBannerBlock extends BaseBlock {
  type: 'timer_banner'; imageUrl: string; linkUrl: string; startTime: string; endTime: string; banners?: TimerBannerItem[];
}
type TimerBannerItem = { imageUrl: string; linkUrl: string; startTime: string; endTime: string; };

interface ProductGridBlock extends BaseBlock {
  type: 'product_grid'; 
  title: string; 
  bgColor: string; 
  heroMode: 'product' | 'banner'; 
  heroProducts: Product[]; 
  heroBanners: ImageItem[]; 
  gridProducts: Product[];
  // ★復活: ボタン設定
  bottomButtonText?: string;
  bottomButtonLink?: string;
  bottomButtonBgColor?: string;
  bottomButtonTextColor?: string;
  nameFilter?: string;
  // スマホ用コメント設定
  mobileCommentShow?: boolean;
  mobileCommentDuration?: number;
  mobileCommentInterval?: number;
}

type Block = TopImageBlock | BannerListBlock | TimerBannerBlock | CouponListBlock | CustomHtmlBlock | SpacerBlock | ProductGridBlock;

const BLOCK_STYLES: Record<BlockType, { label: string; color: string; icon: string; bg: string; border: string }> = {
  top_image:    { label: "トップ画像", color: "text-blue-600", icon: "🖼️", bg: "bg-blue-50", border: "border-blue-200" },
  banner_list:  { label: "バナー一覧", color: "text-orange-600", icon: "📑", bg: "bg-orange-50", border: "border-orange-200" },
  timer_banner: { label: "期間バナー", color: "text-purple-600", icon: "⏳", bg: "bg-purple-50", border: "border-purple-200" },
  coupon_list:  { label: "クーポン",   color: "text-pink-600", icon: "🎟️", bg: "bg-pink-50", border: "border-pink-200" },
  product_grid: { label: "商品カテゴリ", color: "text-red-600", icon: "🛍️", bg: "bg-red-50", border: "border-red-200" },
  custom_html:  { label: "自由HTML",   color: "text-gray-600", icon: "💻", bg: "bg-gray-50", border: "border-gray-200" },
  spacer:       { label: "空白",       color: "text-gray-500", icon: "⬜", bg: "bg-gray-100", border: "border-gray-200" },
};

// ==========================================
// ▼ メインコンポーネント
// ==========================================

export default function Home() {
  const [shopId, setShopId] = useState("");
  const [csvData, setCsvData] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  
  const [popupImage, setPopupImage] = useState("");
  const [popupLink, setPopupLink] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ★プレビュー画面用 文字サイズ自動調整
  useEffect(() => {
    const adjustFontSize = () => {
      const buttons = document.querySelectorAll('.grid-btn-preview');
      buttons.forEach((btn: any) => {
        // 初期設定: 1行強制、パディング極小
        btn.style.whiteSpace = 'nowrap'; 
        btn.style.width = '100%';
        
        let size = 13;
        if(btn.innerText.length > 10) size = 10;
        else if(btn.innerText.length > 8) size = 11;
        else if(btn.innerText.length > 6) size = 12;
        
        btn.style.fontSize = size + 'px';
      });
    };
    const timer = setTimeout(adjustFontSize, 100);
    window.addEventListener('resize', adjustFontSize);
    return () => { clearTimeout(timer); window.removeEventListener('resize', adjustFontSize); };
  }, [blocks]);

  // --- 内部ロジック ---
  const calcTax = (priceStr: string): string => {
    if (!priceStr) return "";
    const num = Number(priceStr.replace(/,/g, ""));
    if (isNaN(num)) return priceStr;
    const taxIn = num * 1.1;
    const integerPart = Math.floor(taxIn);
    const decimalPart = taxIn - integerPart;
    return Math.floor(decimalPart * 10 + 0.00001) >= TAX_THRESHOLD ? (integerPart + 1).toString() : integerPart.toString();
  };

  const cleanName = (name: string, filterStr?: string) => {
    if (!filterStr) return name;
    let cleaned = name;
    const filters = filterStr.split(',').map(s => s.trim()).filter(s => s);
    filters.forEach(word => {
      cleaned = cleaned.split(word).join('');
    });
    return cleaned;
  };

  const findProductData = (code: string, data: any[], currentShopId: string): Product | null => {
    if (!currentShopId || !data || data.length === 0) return null;
    const rows = data.filter((row: any) => row['商品管理番号（商品URL）'] === code);
    if (rows.length === 0) return null;

    let mergedName = "", mergedPrice = "", mergedRefPrice = "", mergedImagePath = "";
    rows.forEach((row) => {
      if (row['商品名']?.trim()) mergedName = row['商品名'];
      const p = row['通常購入販売価格'] || row['販売価格'];
      if (p?.trim()) mergedPrice = p;
      const rp = row['表示価格'];
      if (rp?.trim()) mergedRefPrice = rp;
      if (row['商品画像パス1']?.trim()) mergedImagePath = row['商品画像パス1'];
    });
    if (!mergedPrice) mergedPrice = "0";

    let finalImageUrl = "";
    if (mergedImagePath.startsWith("http")) finalImageUrl = mergedImagePath;
    else if (mergedImagePath) finalImageUrl = `https://image.rakuten.co.jp/${currentShopId}/cabinet${mergedImagePath}`;
    else finalImageUrl = "https://placehold.jp/150x150.png?text=NoImage";

    return {
      code: code, 
      name: mergedName || "名称未設定",
      price: calcTax(mergedPrice), 
      refPrice: mergedRefPrice ? calcTax(mergedRefPrice) : "",
      imageUrl: finalImageUrl, 
      url: `https://item.rakuten.co.jp/${currentShopId}/${code}/`, 
      comment: "" 
    };
  };

  const searchCsvProduct = (code: string): Product | null => {
    if (!shopId) { alert("店舗を選択してください"); return null; }
    if (csvData.length === 0) { alert("CSVを読み込んでください"); return null; }
    const result = findProductData(code, csvData, shopId);
    if (!result) alert(`商品管理番号「${code}」が見つかりません`);
    return result;
  };

  // --- ファイル処理 ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    setCsvFileName(file.name);
    setTimeout(() => {
      Papa.parse(file, {
        header: true, skipEmptyLines: true, encoding: "Shift-JIS",
        complete: (results) => { 
          const newData = results.data;
          setCsvData(newData);
          if (blocks.length > 0 && shopId) {
            if (confirm("新しいCSVデータに基づいて、配置済み商品の価格や情報を更新しますか？")) {
              refreshBlocksWithNewData(newData, shopId);
            }
          } else {
            alert(`読み込み完了: ${newData.length}行`); 
          }
          setIsLoading(false);
        },
        error: () => { alert("読み込み失敗"); setIsLoading(false); }
      });
    }, 100);
  };

  const refreshBlocksWithNewData = (data: any[], currentShopId: string) => {
    const newBlocks = blocks.map(block => {
      if (block.type !== 'product_grid') return block;
      const b = block as ProductGridBlock;
      
      const newHeroProducts = b.heroProducts.map(hp => {
        const found = findProductData(hp.code, data, currentShopId);
        if (found) return { ...found, comment: hp.comment };
        return hp;
      });

      const newGrid = b.gridProducts.map(p => {
        const found = findProductData(p.code, data, currentShopId);
        if (found) return { ...found, comment: p.comment };
        return p;
      });
      return { ...b, heroProducts: newHeroProducts, gridProducts: newGrid };
    });
    setBlocks(newBlocks);
    alert("商品情報を最新のCSVデータで更新しました！");
  };

  const saveProject = () => {
    if (blocks.length === 0) { alert("保存する内容がありません"); return; }
    const data = { shopId, blocks, popupImage, popupLink, savedAt: new Date().toLocaleString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rakuten-sale-project_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const exportRegisteredProducts = () => {
    if (blocks.length === 0) { alert("出力する商品がありません"); return; }
    const rows: any[] = [];
    rows.push(["ブロック名", "タイプ", "商品管理番号", "商品名", "価格(税込)", "商品URL"]);
    blocks.forEach(b => {
      if (b.type === 'product_grid') {
        const pg = b as ProductGridBlock;
        pg.heroProducts.forEach(p => rows.push([pg.title, "目玉", p.code, p.name, p.price, p.url]));
        pg.gridProducts.forEach(p => rows.push([pg.title, "通常", p.code, p.name, p.price, p.url]));
      }
    });
    const csvContent = Papa.unparse(rows);
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registered_products_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const loadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.shopId) setShopId(json.shopId);
        if (json.popupImage) setPopupImage(json.popupImage);
        if (json.popupLink) setPopupLink(json.popupLink);
        
        if (json.blocks) {
          const migratedBlocks = json.blocks.map((b: any) => {
            if (b.type === 'product_grid') {
              if (!b.heroProducts) b.heroProducts = b.heroProduct ? [b.heroProduct] : [];
              if (!b.heroBanners) b.heroBanners = (b.heroBanner && b.heroBanner.imageUrl) ? [b.heroBanner] : [];
              if (!b.nameFilter) b.nameFilter = "";
              // 初期値設定
              if (b.mobileCommentShow === undefined) b.mobileCommentShow = true;
              if (b.mobileCommentDuration === undefined) b.mobileCommentDuration = 3;
              if (b.mobileCommentInterval === undefined) b.mobileCommentInterval = 1;
              // ボタン設定初期化
              if (!b.bottomButtonText) b.bottomButtonText = "もっと見る";
              if (!b.bottomButtonBgColor) b.bottomButtonBgColor = "#bf0000";
              if (!b.bottomButtonTextColor) b.bottomButtonTextColor = "#ffffff";
            }
            if (b.type === 'timer_banner') {
              if (!b.banners) {
                b.banners = [];
                if (b.imageUrl) b.banners.push({ imageUrl: b.imageUrl, linkUrl: b.linkUrl || "", startTime: b.startTime || "", endTime: b.endTime || "" });
              }
            }
            if (b.type === 'banner_list') {
               if (!b.layout) b.layout = '1';
               if (!b.headerHtml) b.headerHtml = "";
            }
            return b;
          });
          setBlocks(migratedBlocks);
        }
        alert("プロジェクトを復元しました。");
      } catch (err) {
        alert("ファイルの読み込みに失敗しました。");
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // --- ブロック操作 ---
  const addBlock = (type: BlockType) => {
    const base = { id: crypto.randomUUID() };
    let newBlock: Block;
    switch (type) {
      case 'top_image': newBlock = { ...base, type, imageUrl: "", linkUrl: "" }; break;
      case 'banner_list': newBlock = { ...base, type, banners: [], layout: '1', headerHtml: "" }; break; 
      case 'coupon_list': newBlock = { ...base, type, coupons: [] }; break;
      case 'custom_html': newBlock = { ...base, type, content: "" }; break;
      case 'spacer': newBlock = { ...base, type, height: 50 }; break;
      case 'timer_banner': newBlock = { ...base, type, imageUrl: "", linkUrl: "", startTime: "", endTime: "", banners: [] }; break;
      case 'product_grid': default:
        newBlock = { 
          ...base, type: 'product_grid', title: "カテゴリ名", bgColor: "#ffffff", 
          heroMode: 'product', heroProducts: [], heroBanners: [], 
          gridProducts: [], 
          // ボタン設定初期値
          bottomButtonText: "もっと見る",
          bottomButtonLink: "",
          bottomButtonBgColor: "#bf0000",
          bottomButtonTextColor: "#ffffff",
          nameFilter: "",
          // スマホコメント表示設定
          mobileCommentShow: true,
          mobileCommentDuration: 3,
          mobileCommentInterval: 1
        }; break;
    }
    setBlocks([...blocks, newBlock]);
    setTimeout(() => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }, 100);
  };

  const removeBlock = (id: string) => { if (confirm("削除しますか？")) setBlocks(blocks.filter(b => b.id !== id)); };
  const moveBlock = (index: number, direction: number) => {
    const newBlocks = [...blocks]; const target = index + direction;
    if (target < 0 || target >= newBlocks.length) return;
    [newBlocks[index], newBlocks[target]] = [newBlocks[target], newBlocks[index]];
    setBlocks(newBlocks);
  };
  const updateBlock = (id: string, updater: (b: Block) => Block) => setBlocks(blocks.map(b => b.id === id ? updater(b) : b));

  const addHeroProduct = (blockId: string, code: string) => {
    const p = searchCsvProduct(code);
    if (!p) return;
    updateBlock(blockId, (block) => {
      const b = block as ProductGridBlock;
      return { ...b, heroProducts: [...b.heroProducts, { ...p, comment: "" }] }; 
    });
  };
  const removeHeroProduct = (blockId: string, index: number) => {
    updateBlock(blockId, (block) => {
      const b = block as ProductGridBlock;
      const newHeroes = b.heroProducts.filter((_, i) => i !== index);
      return { ...b, heroProducts: newHeroes };
    });
  };
  const updateHeroProductInfo = (blockId: string, index: number, newCode: string) => {
    const p = searchCsvProduct(newCode);
    if (!p) return;
    updateBlock(blockId, (block) => {
      const b = block as ProductGridBlock;
      const newHeroes = [...b.heroProducts];
      newHeroes[index] = { ...p, comment: newHeroes[index].comment }; 
      return { ...b, heroProducts: newHeroes };
    });
  };
  const updateHeroProductComment = (blockId: string, index: number, comment: string) => {
    updateBlock(blockId, (block) => {
      const b = block as ProductGridBlock;
      const newHeroes = [...b.heroProducts];
      newHeroes[index] = { ...newHeroes[index], comment };
      return { ...b, heroProducts: newHeroes };
    });
  };
  
  const moveProduct = (blockId: string, index: number, direction: number) => {
    updateBlock(blockId, (block) => {
      const b = block as ProductGridBlock;
      const newGrid = [...b.gridProducts];
      const target = index + direction;
      if (target < 0 || target >= newGrid.length) return b;
      [newGrid[index], newGrid[target]] = [newGrid[target], newGrid[index]];
      return { ...b, gridProducts: newGrid };
    });
  };
  const updateProductInfo = (blockId: string, index: number, newCode: string) => {
    const p = searchCsvProduct(newCode);
    if (!p) return;
    updateBlock(blockId, (block) => {
      const b = block as ProductGridBlock;
      const newGrid = [...b.gridProducts];
      newGrid[index] = { ...p, comment: newGrid[index].comment }; 
      return { ...b, gridProducts: newGrid };
    });
  };

  // --- HTML生成 ---
  const generateHTML = () => {
    const categoryBlocks = blocks.filter(b => b.type === 'product_grid') as ProductGridBlock[];
    
    const popupScript = popupImage ? `<style>.overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:none;justify-content:center;align-items:center;z-index:10000}.popup-banner{background:transparent;padding:0;text-align:center;position:relative}.popup-banner img{width:900px;max-width:95%;display:block;margin:0 auto}.popup-banner .close-btn{display:inline-block;margin-top:15px;padding:10px 30px;font-size:24px;font-weight:bold;color:#fff;background:#333;border-radius:8px;cursor:pointer;box-shadow:0 0 6px rgba(0,0,0,0.4);transition:0.2s ease}.popup-banner .close-btn:hover{background:#555}</style><div class="overlay" id="popup"><div class="popup-banner">${popupLink?`<a href="${popupLink}" target="_blank">`:''}<img src="${popupImage}" border="0">${popupLink?`</a>`:''}<div class="close-btn" id="closeBtn">× 閉じる</div></div></div><script>window.onload=function(){let shownCount=localStorage.getItem("popupShown_${shopId}");shownCount=shownCount?parseInt(shownCount,10):0;if(shownCount<3){document.getElementById("popup").style.display="flex";localStorage.setItem("popupShown_${shopId}",shownCount+1);}};document.getElementById("closeBtn").onclick=function(){document.getElementById("popup").style.display="none"};</script>` : '';
    const timerScript = `<script>(function(){var now=new Date().getTime();var banners=document.querySelectorAll('.timer-banner');if(banners.length===0)return;banners.forEach(function(banner){var s=banner.getAttribute('data-start');var e=banner.getAttribute('data-end');var start=s?new Date(s).getTime():null;var end=e?new Date(e).getTime():null;if(start&&now<start){banner.style.display='none';return}if(end&&now>end){banner.style.display='none';return}banner.style.display='block'})})();</script>`;
    
    // ★修正: menuScriptの定義を追加 (Runtime Error解消)
    const menuScript = `<script>function toggleMobileMenu(){var n=document.getElementById('sale-nav-container');n.classList.toggle('mobile-open');}</script>`;

    // ★HTML出力用: JSによる文字サイズ自動調整
    const autoTextSizeScript = `<script>function fitText(){document.querySelectorAll('.grid-btn').forEach(b=>{b.style.whiteSpace='nowrap';b.style.width='100%';b.style.display='block';b.style.overflow='hidden';b.style.textOverflow='ellipsis'; var len=b.innerText.length; var s=12; if(len>10)s=10; else if(len>8)s=11; b.style.fontSize=s+'px';})}; window.addEventListener('load',fitText);window.addEventListener('resize',fitText);</script>`;

    // ★HTML構造修正: mobile-menu-btnを追加、sale-nav-containerにID付与
    let bodyContent = `<div id="rakuten-sale-app">${popupScript}
    <div id="mobile-menu-btn" class="mobile-menu-btn" onclick="toggleMobileMenu()">≡</div>
    <div id="sale-nav-container" class="sale-nav-container"><div class="sale-nav-trigger">MENU</div><div class="sale-nav-list"><div style="font-weight:bold;border-bottom:2px solid #bf0000;padding-bottom:5px;margin-bottom:5px">INDEX</div>${categoryBlocks.map(b => `<a href="#cat-${b.id}">${b.title}</a>`).join('')}</div></div>`;

    // ★ブロックごとの動的CSS用
    let dynamicStyles = "";

    blocks.forEach(block => {
      const isProduct = block.type === 'product_grid';
      const bgStyle = isProduct ? `background-color: ${(block as ProductGridBlock).bgColor}; color: ${(block as ProductGridBlock).bgColor === '#333333' ? '#fff' : '#333'}` : '';
      
      // ★スマホコメント表示制御用ID
      const sectionId = `section-${block.id}`;
      if(isProduct) bodyContent += `<div id="${sectionId}" class="cat-section-wrapper" style="${bgStyle}"><div class="sale-content-inner">`;
      else if(block.type !== 'spacer') bodyContent += `<div class="sale-content-inner">`;

      // ★スマホコメントCSS生成
      if (isProduct) {
        const pg = block as ProductGridBlock;
        const show = pg.mobileCommentShow !== false; // デフォルトON
        const duration = pg.mobileCommentDuration || 3;
        const interval = pg.mobileCommentInterval || 1;
        const totalTime = duration + interval;
        const percent = (duration / totalTime) * 100;

        if (!show) {
           // OFFの場合はスマホで非表示
           dynamicStyles += `@media screen and (max-width:1024px){ #${sectionId} .comment-bubble { display: none !important; } }`;
        } else {
           // ONの場合は指定時間でアニメーション
           dynamicStyles += `
             @media screen and (max-width:1024px){
               #${sectionId} .comment-bubble {
                 animation: bubbleLoop-${block.id} ${totalTime}s infinite !important;
                 opacity: 0; visibility: hidden;
               }
               @keyframes bubbleLoop-${block.id} {
                 0% { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(-5px); }
                 ${percent}% { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(-5px); }
                 ${percent + 1}% { opacity: 0; visibility: hidden; transform: translateX(-50%) translateY(0); }
                 100% { opacity: 0; visibility: hidden; transform: translateX(-50%) translateY(0); }
               }
             }
           `;
        }
      }

      if (block.type === 'top_image') bodyContent += block.imageUrl ? `<div class="top-image">${block.linkUrl ? `<a href="${block.linkUrl}" target="_blank" style="text-decoration:none; border:none;">` : ''}<img src="${block.imageUrl}" alt="Top">${block.linkUrl ? `</a>` : ''}</div>` : '';
      else if (block.type === 'spacer') bodyContent += `<div class="spacer" style="height: ${block.height}px;"></div>`;
      else if (block.type === 'timer_banner') {
        const tb = block as TimerBannerBlock;
        const targets = tb.banners && tb.banners.length > 0 ? tb.banners : (tb.imageUrl ? [tb] : []);
        targets.forEach(b => {
             bodyContent += `<div class="timer-banner banner-stack" data-start="${b.startTime}" data-end="${b.endTime}" style="margin-bottom:30px;">${b.linkUrl ? `<a href="${b.linkUrl}" target="_blank" style="text-decoration:none; border:none;">` : ''}<img src="${b.imageUrl}" style="width:100%">${b.linkUrl ? `</a>` : ''}</div>`;
        });
      } else if (block.type === 'banner_list') {
        const bl = block as BannerListBlock;
        if (bl.banners.length > 0) {
           if (bl.headerHtml) bodyContent += `<div class="banner-header-html" style="margin-bottom:15px;">${bl.headerHtml}</div>`;
           const layout = bl.layout || '1';
           const cols = Number(layout);
           const gridClass = cols > 1 ? `banner-grid-${cols}` : 'banner-stack';
           const gridStyle = cols > 1 ? `display:grid; grid-template-columns:repeat(${cols},1fr); gap:15px; margin-bottom:30px;` : 'display:flex; flex-direction:column; gap:15px; margin-bottom:30px;';
           bodyContent += `<div class="${gridClass}" style="${gridStyle}">`;
           bl.banners.forEach(b => {
             bodyContent += `<div class="banner-item">${b.linkUrl ? `<a href="${b.linkUrl}" target="_blank" style="text-decoration:none; border:none;">` : ''}<img src="${b.imageUrl}" style="width:100%">${b.linkUrl ? `</a>` : ''}</div>`;
           });
           bodyContent += `</div>`;
        }
      } else if (block.type === 'coupon_list') {
        if (block.coupons.length > 0) {
          bodyContent += `<div class="coupon-grid">${block.coupons.map(c => `<div class="coupon-item">${c.linkUrl ? `<a href="${c.linkUrl}" target="_blank" style="text-decoration:none; border:none;">` : ''}<img src="${c.imageUrl}" style="width:100%">${c.linkUrl ? `</a>` : ''}</div>`).join('')}</div>`;
        }
      } else if (block.type === 'custom_html') bodyContent += `<div class="custom-html">${block.content}</div>`;
      else if (block.type === 'product_grid') {
        const pg = block as ProductGridBlock;
        const filter = pg.nameFilter || "";
        const btnBg = pg.bottomButtonBgColor || '#bf0000';
        const btnTxt = pg.bottomButtonTextColor || '#ffffff';
        
        bodyContent += `<div id="cat-${block.id}" class="cat-title">${block.title}</div>`;
        
        if (pg.heroMode === 'product' && pg.heroProducts.length > 0) {
          pg.heroProducts.forEach(product => {
            const pPrice = Number(product.price.replace(/,/g, ''));
            const pRef = product.refPrice ? Number(product.refPrice.replace(/,/g, '')) : 0;
            const diff = (pRef > pPrice) ? (pRef - pPrice) : 0;
            
            // ★修正: OFFバッジ中央・赤文字・斜め, ボタン光沢・コンパクト
            bodyContent += `<div class="hero-area"><div class="hero-img-container"><img src="${product.imageUrl}">${product.comment ? `<div class="comment-bubble">${product.comment}</div>` : ''}</div><div class="hero-info"><div class="hero-name">${cleanName(product.name, filter)}</div><div class="price-box" style="display:flex; flex-direction:column; align-items:center; gap:0px; margin-bottom:10px;"><div style="height:24px; display:flex; align-items:center; width:100%; justify-content:center;">${diff > 0 ? `<span class="price-off-pop-top">\\ ${diff.toLocaleString()}円OFF /</span>` : `<span class="price-off-pop-top" style="visibility:hidden">\\ 0円OFF /</span>`}</div><div style="display:flex; align-items:baseline; justify-content:center; gap:5px; flex-wrap:wrap;">${product.refPrice ? `<span class="price-ref">${Number(product.refPrice).toLocaleString()}円</span><span class="price-arrow">➡</span>` : ''}<span class="price-sale">${Number(product.price).toLocaleString()}円</span></div></div><a href="${product.url}" target="_blank" class="btn-buy" style="text-decoration:none !important; background:#bf0000 !important;"><span style="position:relative; z-index:2;">商品ページへ</span><div class="shine"></div></a></div></div>`;
          });
        } else if (pg.heroMode === 'banner') {
           const banners = pg.heroBanners || [];
           if(banners.length === 0 && pg.heroBanner?.imageUrl) banners.push(pg.heroBanner!);
           banners.forEach(banner => {
             bodyContent += `<div style="margin-bottom: 20px;">${banner.linkUrl ? `<a href="${banner.linkUrl}" target="_blank" style="text-decoration:none; border:none;">` : ''}<img src="${banner.imageUrl}" class="hero-banner-img" alt="Featured" style="width:100%">${banner.linkUrl ? `</a>` : ''}</div>`;
           });
        }

        if (block.gridProducts.length > 0) {
          bodyContent += `<div class="grid-area">${block.gridProducts.map(p => {
             const pPrice = Number(p.price.replace(/,/g, ''));
             const pRef = p.refPrice ? Number(p.refPrice.replace(/,/g, '')) : 0;
             const diff = (pRef > pPrice) ? (pRef - pPrice) : 0;
             // ★修正: OFFバッジ中央・赤文字・斜め, ボタン光沢・コンパクト(padding 0)
             return `<a href="${p.url}" target="_blank" class="item-card" style="text-decoration:none; border:1px solid #f0f0f0; display:block; background:#fff; padding:10px; border-radius:6px;"><div class="img-wrap" style="position:relative; margin-bottom:5px;"><img src="${p.imageUrl}" style="width:100%; height:180px; object-fit:contain;">${p.comment ? `<div class="comment-bubble">${p.comment}</div>` : ''}</div><div class="grid-name" style="font-size:13px; height:40px; overflow:hidden; color:#555; line-height:1.4; text-align:left; margin-bottom:0;">${cleanName(p.name, filter)}</div><div style="text-align:center; margin-top:0; height:16px; display:flex; justify-content:center; align-items:center;">${diff > 0 ? `<span class="price-off-pop-grid">\\ ${diff.toLocaleString()}円OFF /</span>` : `<span class="price-off-pop-grid" style="visibility:hidden">\\ 0円OFF /</span>`}</div><div class="price-box" style="display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:baseline; gap:4px; margin-top:-2px;">${p.refPrice ? `<span class="price-ref" style="font-size:10px; color:#999; text-decoration:line-through;">${Number(p.refPrice).toLocaleString()}円</span><span class="price-arrow" style="font-size:10px; color:#999;">➡</span>` : ''}<span class="price-sale" style="font-size:20px; font-weight:bold; color:#bf0000; line-height:1.2;">${Number(p.price).toLocaleString()}円</span></div><div class="grid-btn" style="background:#bf0000 !important; color:#ffffff !important; text-align:center; padding:2px 0 !important; margin-top:4px; border-radius:4px; font-size:11px; font-weight:bold; white-space:nowrap; overflow:hidden; position:relative;"><span style="position:relative; z-index:2;">商品ページへ</span><div class="shine"></div></div></a>`;
          }).join('')}</div>`;
        }

        if (block.bottomButtonLink) {
          // ★修正: ボタンをコンパクトに (padding:12px 60px, font-size:16px)
          bodyContent += `<div style="text-align:center; margin-top:30px;"><a href="${block.bottomButtonLink}" class="section-bottom-btn" target="_blank" style="background-color: ${btnBg}; color: ${btnTxt} !important; display:inline-block; padding:12px 60px; border-radius:50px; font-weight:bold; text-decoration:none !important; font-size:16px;">${block.bottomButtonText || 'もっと見る'}</a></div>`;
        }
      }

      if(isProduct || block.type !== 'spacer') { bodyContent += `</div>`; if(isProduct) bodyContent += `</div>`; }
    });
    bodyContent += `</div>${timerScript}${autoTextSizeScript}${menuScript}`;

    // ★CSS修正: 既存CSS + スマホボタン改善 + MENU改善
    const fullHTML = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>楽天スーパーセール特設ページ</title><style>body{margin:0;padding:0;font-family:"Hiragino Kaku Gothic ProN","Meiryo",sans-serif;line-height:1.6;color:#333}*{box-sizing:border-box}img{max-width:100%;height:auto;display:block;margin:0 auto;border:none!important;outline:none!important}#rakuten-sale-app a{text-decoration:none!important;color:inherit!important;transition:opacity 0.3s;display:block;border:none!important;outline:none!important;box-shadow:none!important}#rakuten-sale-app a:hover{opacity:0.9;text-decoration:none!important;border:none!important}.sale-content-inner{max-width:900px;margin:0 auto;padding:0 10px;position:relative}.sale-nav-container{position:fixed;left:0;top:20%;z-index:9999;transform:translateX(-100%);transition:transform 0.3s;display:flex}.sale-nav-container:hover{transform:translateX(0)}
    /* PC用MENUボタン改善: 幅広・文字切れ防止 */
    .sale-nav-trigger{background:#333;color:#fff;width:60px;height:auto;padding:15px 5px;display:flex;align-items:center;justify-content:center;font-weight:bold;cursor:pointer;border-radius:0 8px 8px 0;writing-mode:vertical-rl;letter-spacing:2px;box-shadow:2px 2px 5px rgba(0,0,0,0.2);position:absolute;left:100%;top:0;white-space:nowrap;}
    .sale-nav-list{background:rgba(255,255,255,0.95);border:1px solid #ddd;border-left:none;box-shadow:2px 2px 10px rgba(0,0,0,0.1);padding:15px;min-width:200px;display:flex;flex-direction:column;gap:10px;border-radius:0 0 8px 0}.sale-nav-list a{display:block;font-size:14px;color:#333!important;padding:8px;border-bottom:1px dashed #eee!important}.sale-nav-list a:hover{color:#bf0000!important;padding-left:12px}.top-image{margin-bottom:20px;width:100%}.banner-stack{display:flex;flex-direction:column;gap:15px;margin-bottom:30px}.coupon-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:30px}.cat-section-wrapper{width:100%;padding:40px 0;margin-bottom:0}.cat-title{text-align:center;font-size:26px;font-weight:bold;margin:0 0 40px;padding:10px 0;letter-spacing:3px;position:relative;color:inherit;animation:titlePulse 3s ease-in-out infinite}.cat-title::after{content:'';display:block;width:50px;height:3px;background:#bf0000;margin:15px auto 0;transition:width 0.3s;animation:lineSway 3s ease-in-out infinite}.hero-area{display:flex;border:1px solid #eee;margin-bottom:30px;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.08);border-radius:8px;color:#333;position:relative;overflow:visible!important;z-index:10}.hero-area:hover{z-index:50}.hero-img-container{width:50%;position:relative}.hero-img-container img{width:100%;height:100%;object-fit:cover;border-radius:8px 0 0 8px}.hero-info{width:50%;padding:30px;display:flex;flex-direction:column;justify-content:center;text-align:center}.hero-name{font-size:18px;font-weight:bold;margin-bottom:15px}.price-box{margin:15px 0;display:flex;justify-content:center;align-items:baseline;gap:10px;flex-wrap:wrap;align-content:center}.price-ref{color:#999;text-decoration:line-through;font-size:14px}.price-arrow{color:#ccc;font-size:12px;margin:0 5px;display:inline-block}.price-sale{color:#bf0000;font-weight:bold;font-family:Arial}.hero-info .price-sale{font-size:36px}.btn-buy{background:linear-gradient(to bottom,#d90000,#bf0000);color:white!important;padding:12px 40px;border-radius:30px;font-weight:bold;display:inline-block;margin-top:15px;text-decoration:none!important;position:relative;overflow:hidden}.grid-area{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;color:#333}.item-card{border:1px solid #f0f0f0;padding:10px;text-align:center;background:#fff;display:flex;flex-direction:column;justify-content:space-between;height:100%;border-radius:6px;transition:all 0.3s;position:relative;top:0;overflow:visible!important;z-index:10}.item-card:hover{top:-5px;border-color:#ffd1d1;box-shadow:0 10px 20px rgba(0,0,0,0.1);z-index:50}.img-wrap{position:relative;width:100%;margin-bottom:8px}.img-wrap img{width:100%;height:180px;object-fit:contain}.grid-name{font-size:13px;height:40px;line-height:1.5;overflow:hidden;margin-bottom:5px;text-align:left;color:#555;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.item-card .price-box{justify-content:flex-end;padding-right:5px;margin:5px 0 0}.item-card .price-sale{font-size:18px}.section-bottom-btn{display:inline-block;padding:12px 60px;border-radius:50px;font-weight:bold;text-decoration:none!important;box-shadow:0 5px 15px rgba(0,0,0,0.2);transition:transform 0.2s;font-size:16px}.section-bottom-btn:hover{transform:translateY(-2px);opacity:0.9}.comment-bubble{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:10px;background:#333;color:#fff;padding:8px 12px;border-radius:6px;font-size:12px;font-weight:bold;width:180px;text-align:center;pointer-events:none;z-index:9999;box-shadow:0 4px 10px rgba(0,0,0,0.2);opacity:0;visibility:hidden;transition:all 0.3s}.comment-bubble::after{content:'';position:absolute;top:100%;left:50%;margin-left:-6px;border-width:6px;border-style:solid;border-color:#333 transparent transparent transparent}.item-card:hover .comment-bubble,.hero-img-container:hover .comment-bubble{opacity:1;visibility:visible;transform:translateX(-50%) translateY(-5px)}.spacer{width:100%} /* ★赤文字のみバッジ(中央) */ .price-off-pop-top, .price-off-pop-grid { display:inline-block; color:#bf0000; font-weight:bold; font-size:12px; animation:pop 1s infinite alternate; transform:rotate(-2deg); width:100%; text-align:center; } .price-off-pop-top{ font-size:16px; margin-bottom:8px; } .price-off-pop-grid{ font-size:11px; margin:0 0 2px 0; } /* ★ボタン光沢 */ .shine { position:absolute; top:0; left:-100%; width:50%; height:100%; background:linear-gradient(to right,transparent,rgba(255,255,255,0.5),transparent); transform:skewX(-25deg); animation:shine 3s infinite; z-index:1; } @keyframes shine{0%{left:-100%;opacity:0}20%{opacity:0.5}40%{left:200%;opacity:0}100%{left:200%;opacity:0}} @keyframes bubbleLoop{0%,75%{opacity:1;visibility:visible}76%,100%{opacity:0;visibility:hidden}}@keyframes titlePulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}@keyframes lineSway{0%,100%{width:50px}50%{width:100px}}@keyframes pop{0%{transform:rotate(-2deg) scale(1)}100%{transform:rotate(-2deg) scale(1.1)}}
    /* PCではスマホ用ボタン非表示 */
    .mobile-menu-btn { display: none; }
    
    @media screen and (max-width:1024px){
      .hero-area{flex-direction:column}.hero-img-container{width:100%}.hero-img-container img{border-radius:8px 8px 0 0}.hero-info{width:100%}.grid-area{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important}.grid-name{font-size:12px;height:40px}.banner-grid-2,.banner-grid-3,.banner-grid-4{grid-template-columns:repeat(2,1fr)!important}.price-off{display:block;font-size:12px;text-align:right;margin-top:4px}.comment-bubble{top:auto!important;bottom:0!important;left:0!important;width:100%!important;margin:0!important;border-radius:0 0 4px 4px!important;background:rgba(0,0,0,0.75)!important;transform:none!important;animation:bubbleLoop 4s infinite!important}.comment-bubble::after{display:block!important;top:auto!important;bottom:100%!important;left:50%!important;border-color:transparent transparent rgba(0,0,0,0.75) transparent!important} .item-card .price-box{justify-content:flex-end;gap:4px} .price-ref-row, .price-sale-row{display:inline-block} .price-ref{font-size:10px} .price-arrow{display:inline-block; font-size:10px} .price-sale{font-size:20px !important}
      
      /* スマホMENU設定: MENUボタン独立 */
      .sale-nav-trigger { display: none !important; } /* PC用トリガー非表示 */
      .mobile-menu-btn { display: flex; position: fixed; left: 10px; bottom: 90px; width: 50px; height: 50px; background: #333; color: #fff; border-radius: 50%; z-index: 10000; justify-content: center; align-items: center; font-size: 24px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); cursor: pointer; }
      .sale-nav-container { transform: translateX(-110%); transition: transform 0.3s; left: 0; top: auto; bottom: 150px; height: auto; max-height: 60vh; overflow-y: auto; border-radius: 0 8px 8px 0; z-index: 9999; }
      .sale-nav-container.mobile-open { transform: translateX(0); }
    }${dynamicStyles}</style></head><body>${bodyContent}</body></html>`;

    navigator.clipboard.writeText(fullHTML);
    alert("HTMLを作成しました！(クリップボードにコピーしました)");
  };

  // ---------------------------------------------------------
  // ▼ UIコンポーネント
  // ---------------------------------------------------------
  
  const PriceDisplay = ({ price, refPrice, isHero = false }: { price: string, refPrice: string, isHero?: boolean }) => {
    const p = Number(price.replace(/,/g, ''));
    const r = Number(refPrice.replace(/,/g, ''));
    const diff = r > p ? r - p : 0;
    
    return (
      <div className={`flex flex-col items-end justify-center w-full`}>
        {/* 修正: 常にバッジ枠を出力して高さを確保 (visibility制御) + 中央揃え */}
        <div className={`text-red-600 text-xs font-bold px-2 py-0.5 mb-0 transform -rotate-2 animate-pulse w-full text-center`} style={{ visibility: diff > 0 ? 'visible' : 'hidden' }}>
           \ {diff > 0 ? diff.toLocaleString() : '0'}円OFF /
        </div>
        <div className="flex items-baseline gap-2 flex-wrap justify-end mt-[-2px]">
          {refPrice && <div className="flex items-center gap-1"><span className="text-gray-400 line-through text-xs">{Number(refPrice).toLocaleString()}円</span><span className="text-gray-400 text-xs">➡</span></div>}
          <span className={`text-red-600 font-bold ${isHero ? 'text-3xl' : 'text-lg'}`}>{Number(price).toLocaleString()}円</span>
        </div>
      </div>
    );
  };

  const ImageLinkInput = ({ img, link, onChange, label = "画像" }: { img: string, link: string, onChange: (i: string, l: string) => void, label?: string }) => (
    <div className="flex flex-col gap-2 mb-3 p-3 border border-gray-200 bg-gray-50 rounded-lg shadow-sm hover:border-blue-200 transition-colors">
      <div className="flex gap-2 items-center">
        <span className="text-xs font-bold w-16 text-gray-500">{label}URL</span>
        <input type="text" value={img} onChange={e => onChange(e.target.value, link)} placeholder="https://..." className="border border-gray-200 bg-gray-50 p-2 text-sm w-full rounded focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none transition-all"/>
      </div>
      <div className="flex gap-2 items-center">
        <span className="text-xs font-bold w-16 text-gray-500">リンク先</span>
        <input type="text" value={link} onChange={e => onChange(img, e.target.value)} placeholder="https://..." className="border border-gray-200 bg-gray-50 p-2 text-sm w-full rounded focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none transition-all"/>
      </div>
      {img && <img src={img} className="h-24 object-contain self-center bg-gray-50 border border-dashed border-gray-300 rounded p-1 mt-2" />}
    </div>
  );

  const PreviewBubble = ({ text }: { text: string }) => (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 bg-gray-800 text-white text-xs p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 p-8 pb-40 font-sans text-slate-700">
      {isLoading && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white p-6 rounded-xl shadow-2xl flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-700 font-bold animate-pulse">データを読み込んでいます...</p>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex items-center justify-between bg-gradient-to-r from-red-600 to-orange-500 p-4 rounded-xl shadow-lg text-white">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛍️</span>
            <div>
              <h1 className="text-xl font-bold">楽天スーパーセール作成ツール</h1>
              <p className="text-xs opacity-90">Ver 1.0 - 2025-11-28</p>
            </div>
          </div>
          <button 
            onClick={() => signOut()} 
            className="bg-white/20 hover:bg-white/30 text-white font-bold py-2 px-4 rounded text-sm transition-colors flex items-center gap-2"
          >
            <span>🚪</span> ログアウト
          </button>
        </header>

        <div className="bg-white p-6 rounded-xl shadow-md mb-10 border border-gray-200">
          <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
            <h2 className="font-bold text-lg flex items-center gap-2 text-gray-700">
              <span className="bg-gray-100 text-gray-600 py-1 px-3 rounded-full text-xs border">STEP 1</span>
              基本設定
            </h2>
            <div className="flex gap-2">
              <label className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs px-3 py-2 rounded cursor-pointer font-bold transition-colors flex items-center gap-2 shadow-sm">
                📂 JSON読込
                <input type="file" accept=".json" onChange={loadProject} className="hidden" ref={fileInputRef} />
              </label>
              <button onClick={saveProject} className="bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 text-xs px-3 py-2 rounded font-bold transition-colors flex items-center gap-2 shadow-sm">
                💾 JSON保存
              </button>
              <button onClick={exportRegisteredProducts} className="bg-orange-50 border border-orange-200 text-orange-600 hover:bg-orange-100 text-xs px-3 py-2 rounded font-bold transition-colors flex items-center gap-2 shadow-sm">
                📤 商品リスト出力 (CSV)
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-xs font-bold mb-2 text-gray-500 uppercase tracking-wider">1. 店舗選択</label>
              <div className="flex gap-3">
                {SHOPS.map(s => (
                  <button 
                    key={s.id} 
                    onClick={() => setShopId(s.id)} 
                    className={`flex-1 py-3 px-4 border-2 rounded-xl font-bold transition-all duration-200 ${shopId === s.id ? "border-red-500 bg-red-50 text-red-600 shadow-md" : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"}`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold mb-2 text-gray-500 uppercase tracking-wider">2. データ読込</label>
              <label className={`cursor-pointer w-full py-3 rounded-xl font-bold border-2 border-dashed transition-all flex items-center justify-center gap-3 group ${csvFileName ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-500'}`}>
                <span className="text-xl group-hover:scale-110 transition-transform">📂</span>
                <span>{csvFileName ? `読込完了: ${csvFileName}` : 'CSVファイルを選択 (dl-normal-item.csv)'}</span>
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100">
             <details className="group">
               <summary className="font-bold text-xs text-gray-400 cursor-pointer flex items-center gap-2 hover:text-gray-600">
                 <span>⚙️ ポップアップ広告設定 (任意)</span>
                 <span className="group-open:rotate-180 transition-transform">▼</span>
               </summary>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg mt-3 border border-gray-200">
                  <input type="text" placeholder="ポップアップ画像URL" value={popupImage} onChange={e => setPopupImage(e.target.value)} className="border p-2 text-sm w-full rounded focus:ring-2 focus:ring-blue-400 outline-none"/>
                  <input type="text" placeholder="リンク先URL" value={popupLink} onChange={e => setPopupLink(e.target.value)} className="border p-2 text-sm w-full rounded focus:ring-2 focus:ring-blue-400 outline-none"/>
               </div>
             </details>
          </div>
        </div>

        {/* ブロックリスト */}
        <div className="space-y-8 pb-24">
          {blocks.map((block, index) => {
            const style = BLOCK_STYLES[block.type] || BLOCK_STYLES.product_grid;
            return (
            <div key={block.id} className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden transition-all hover:shadow-xl">
              
              <div className={`p-3 flex justify-between items-center border-b ${style.border} ${style.bg}`}>
                <div className="flex items-center gap-3">
                  <span className="bg-white/80 px-2 py-0.5 rounded text-xs font-bold text-gray-500 shadow-sm">#{index + 1}</span>
                  <span className={`font-bold text-sm flex items-center gap-2 ${style.color}`}>
                    <span className="text-lg">{style.icon}</span>
                    {style.label}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => moveBlock(index, -1)} disabled={index === 0} className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-30 rounded-lg text-gray-500 transition-colors">⬆</button>
                  <button onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1} className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-30 rounded-lg text-gray-500 transition-colors">⬇</button>
                  <button onClick={() => removeBlock(block.id)} className="w-8 h-8 flex items-center justify-center bg-white border border-red-100 text-red-500 hover:bg-red-50 rounded-lg ml-2 transition-colors">✖</button>
                </div>
              </div>

              <div className="p-6">
                {block.type === 'spacer' && (
                  <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <span className="font-bold text-gray-500 text-sm">縦幅: {block.height}px</span>
                    <input type="range" min="10" max="200" value={block.height} onChange={(e) => updateBlock(block.id, b => ({ ...b, height: Number(e.target.value) } as SpacerBlock))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-500"/>
                  </div>
                )}
                
                {block.type === 'top_image' && (
                  <ImageLinkInput img={block.imageUrl} link={block.linkUrl} onChange={(img, link) => updateBlock(block.id, b => ({ ...b, imageUrl: img, linkUrl: link } as TopImageBlock))} />
                )}
                
                {block.type === 'timer_banner' && (
                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                    <p className="text-xs font-bold text-purple-600 mb-3 flex items-center gap-1">📅 表示期間設定（HTML埋め込み時に自動制御）</p>
                    {(block.banners || []).map((b, i) => (
                      <div key={i} className="mb-4 p-4 bg-white rounded-lg border border-purple-100 shadow-sm">
                         <div className="flex justify-between items-center mb-3 pb-2 border-b border-purple-50">
                            <span className="text-xs font-bold bg-purple-100 text-purple-600 px-2 py-1 rounded">バナー {i+1}</span>
                            <button onClick={() => {
                               const newBanners = (block.banners || []).filter((_, idx) => idx !== i);
                               updateBlock(block.id, b => ({ ...b, banners: newBanners } as TimerBannerBlock));
                            }} className="text-gray-400 hover:text-red-500 text-sm">削除</button>
                         </div>
                         <div className="grid grid-cols-2 gap-4 mb-3">
                          <div><span className="text-xs font-bold block text-gray-500 mb-1">開始日時</span><input type="datetime-local" value={b.startTime} onChange={(e) => { const nb=[...(block.banners || [])]; nb[i].startTime=e.target.value; updateBlock(block.id, b => ({...b, banners:nb} as TimerBannerBlock)); }} className="border border-gray-200 p-2 w-full text-sm rounded bg-gray-50 focus:bg-white focus:ring-2 focus:ring-purple-200 outline-none"/></div>
                          <div><span className="text-xs font-bold block text-gray-500 mb-1">終了日時</span><input type="datetime-local" value={b.endTime} onChange={(e) => { const nb=[...(block.banners || [])]; nb[i].endTime=e.target.value; updateBlock(block.id, b => ({...b, banners:nb} as TimerBannerBlock)); }} className="border border-gray-200 p-2 w-full text-sm rounded bg-gray-50 focus:bg-white focus:ring-2 focus:ring-purple-200 outline-none"/></div>
                         </div>
                         <ImageLinkInput img={b.imageUrl} link={b.linkUrl} label="画像" onChange={(img, link) => { const nb=[...(block.banners || [])]; nb[i].imageUrl=img; nb[i].linkUrl=link; updateBlock(block.id, b => ({...b, banners:nb} as TimerBannerBlock)); }} />
                      </div>
                    ))}
                    <button onClick={() => updateBlock(block.id, b => ({ ...b, banners: [...(b as TimerBannerBlock).banners || [], { imageUrl: "", linkUrl: "", startTime: "", endTime: "" }] } as TimerBannerBlock))} className="w-full py-2 bg-white border-2 border-dashed border-purple-200 text-purple-500 font-bold rounded hover:bg-purple-50 hover:border-purple-300 transition-all">+ 期間バナーを追加</button>
                  </div>
                )}

                {block.type === 'banner_list' && (
                  <div>
                    <div className="mb-4">
                      <p className="text-xs font-bold text-orange-400 mb-1">📝 バナー上の自由HTML (見出しや装飾など)</p>
                      <textarea 
                        value={block.headerHtml} 
                        onChange={(e) => updateBlock(block.id, b => ({ ...b, headerHtml: e.target.value } as BannerListBlock))} 
                        className="w-full h-20 border border-orange-200 p-2 text-xs font-mono bg-orange-50/50 rounded focus:bg-white outline-none"
                        placeholder="<h2 style='color:red'>タイトル</h2>"
                      />
                    </div>

                    <div className="flex gap-2 mb-4 p-2 bg-gray-100 rounded-lg border border-gray-200">
                      <span className="text-xs font-bold self-center mr-2 text-gray-500">レイアウト:</span>
                      {['1','2','3','4'].map(n => (
                         <button key={n} onClick={() => updateBlock(block.id, b => ({ ...b, layout: n as any } as BannerListBlock))}
                           className={`px-3 py-1 text-xs font-bold rounded transition-all ${block.layout === n ? 'bg-orange-500 text-white shadow-md transform scale-105' : 'bg-white text-gray-500 hover:bg-gray-200'}`}>
                           {n}列
                         </button>
                      ))}
                    </div>

                    <div className={`grid gap-3 mb-4 ${block.layout === '4' ? 'grid-cols-4' : block.layout === '3' ? 'grid-cols-3' : block.layout === '2' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {block.banners.map((banner, i) => (
                        <div key={i} className="bg-gray-50 p-2 rounded border border-gray-200 relative group">
                           <button onClick={() => { const newBanners = block.banners.filter((_, idx) => idx !== i); updateBlock(block.id, b => ({ ...b, banners: newBanners } as BannerListBlock)); }} className="absolute -top-2 -right-2 text-white bg-red-500 rounded-full w-6 h-6 flex items-center justify-center shadow hover:bg-red-600 transition-colors z-10">×</button>
                           {banner.imageUrl ? <img src={banner.imageUrl} className="w-full h-24 object-contain bg-white mb-2 rounded border border-gray-100"/> : <div className="w-full h-24 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-400 mb-2">No Image</div>}
                           <ImageLinkInput img={banner.imageUrl} link={banner.linkUrl} label={`BN${i+1}`} onChange={(img, link) => { const newBanners = [...block.banners]; newBanners[i] = { imageUrl: img, linkUrl: link }; updateBlock(block.id, b => ({ ...b, banners: newBanners } as BannerListBlock)); }} />
                        </div>
                      ))}
                    </div>
                    <button onClick={() => updateBlock(block.id, b => ({ ...b, banners: [...(b as BannerListBlock).banners, { imageUrl: "", linkUrl: "", startTime: "", endTime: "" }] } as BannerListBlock))} className="w-full py-3 bg-white border-2 border-dashed border-orange-200 text-orange-500 font-bold rounded-xl hover:bg-orange-50 hover:border-orange-300 transition-all">+ バナーを追加</button>
                  </div>
                )}

                {block.type === 'coupon_list' && (
                  <div>
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      {block.coupons.map((coupon, i) => (
                        <div key={i} className="relative group">
                          <button onClick={() => { const newCoupons = block.coupons.filter((_, idx) => idx !== i); updateBlock(block.id, b => ({ ...b, coupons: newCoupons } as CouponListBlock)); }} className="absolute -top-2 -right-2 bg-white border border-gray-200 text-red-500 w-6 h-6 flex justify-center items-center rounded-full z-10 shadow hover:bg-red-50">×</button>
                          <ImageLinkInput img={coupon.imageUrl} link={coupon.linkUrl} label={`CP${i+1}`} onChange={(img, link) => { const newCoupons = [...block.coupons]; newCoupons[i] = { imageUrl: img, linkUrl: link }; updateBlock(block.id, b => ({ ...b, coupons: newCoupons } as CouponListBlock)); }} />
                        </div>
                      ))}
                    </div>
                    <button onClick={() => updateBlock(block.id, b => ({ ...b, coupons: [...(b as CouponListBlock).coupons, { imageUrl: "", linkUrl: "" }] } as CouponListBlock))} className="w-full py-3 bg-white border-2 border-dashed border-pink-200 text-pink-500 font-bold rounded-xl hover:bg-pink-50 hover:border-pink-300 transition-all">+ クーポンを追加</button>
                  </div>
                )}

                {block.type === 'custom_html' && (
                  <textarea value={block.content} onChange={e => updateBlock(block.id, b => ({ ...b, content: e.target.value } as CustomHtmlBlock))} className="w-full h-40 border border-gray-300 p-4 text-sm font-mono bg-gray-50 rounded-lg focus:ring-2 focus:ring-gray-400 focus:bg-white outline-none shadow-inner" placeholder="<div>ここにHTMLタグを入力...</div>"/>
                )}
                
                {block.type === 'product_grid' && (
                  <>
                    <input value={block.title} onChange={e => updateBlock(block.id, b => ({ ...b, title: e.target.value } as ProductGridBlock))} className="text-2xl font-bold w-full border-b-2 border-gray-100 mb-6 p-2 focus:border-red-400 outline-none transition-colors text-gray-700 placeholder-gray-300" placeholder="カテゴリ名を入力 (例: 半額セール)"/>
                    
                    <div className="flex flex-wrap gap-4 mb-6 bg-gray-50 p-4 rounded-lg border border-gray-100">
                       <div className="flex items-center gap-2">
                         <span className="text-xs font-bold text-gray-500">背景色</span>
                         <div className="flex gap-1 items-center bg-white p-1 rounded border border-gray-200">
                           <input type="color" value={block.bgColor || "#ffffff"} onChange={e => updateBlock(block.id, b => ({ ...b, bgColor: e.target.value } as ProductGridBlock))} className="w-6 h-6 cursor-pointer"/>
                           <input type="text" value={block.bgColor} onChange={e => updateBlock(block.id, b => ({ ...b, bgColor: e.target.value } as ProductGridBlock))} className="text-xs w-20 outline-none border-b"/>
                         </div>
                       </div>
                       <div className="flex-1">
                         <span className="text-xs font-bold text-gray-500 block mb-1">商品名から削除するワード (カンマ区切り)</span>
                         <input 
                           type="text" 
                           value={block.nameFilter || ""}
                           onChange={e => updateBlock(block.id, b => ({ ...b, nameFilter: e.target.value } as ProductGridBlock))}
                           placeholder="【送料無料】, 期間限定, あす楽"
                           className="w-full border border-gray-200 text-xs p-2 rounded focus:ring-2 focus:ring-red-100 outline-none"
                         />
                       </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-6 items-start -mx-6 px-6 py-8 border-t border-b border-gray-100" style={{ backgroundColor: block.bgColor, transition: 'background-color 0.3s' }}>
                      {/* 目玉エリア */}
                      <div className="w-full md:w-1/3 bg-red-50 p-5 rounded-2xl border border-red-100 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                          <p className="font-bold text-red-600 flex items-center gap-1"><span className="text-lg">★</span> 目玉エリア</p>
                          <div className="text-xs bg-white border border-red-100 rounded-lg flex overflow-hidden shadow-sm">
                            <button onClick={() => updateBlock(block.id, b => ({ ...b, heroMode: 'product' } as ProductGridBlock))} className={`px-3 py-1.5 transition-colors ${block.heroMode === 'product' ? 'bg-red-500 text-white font-bold' : 'text-gray-500 hover:bg-gray-50'}`}>商品</button>
                            <button onClick={() => updateBlock(block.id, b => ({ ...b, heroMode: 'banner' } as ProductGridBlock))} className={`px-3 py-1.5 transition-colors ${block.heroMode === 'banner' ? 'bg-red-500 text-white font-bold' : 'text-gray-500 hover:bg-gray-50'}`}>バナー</button>
                          </div>
                        </div>
                        
                        {block.heroMode === 'product' ? (
                          <div className="space-y-4">
                              {(block.heroProducts || []).map((p, i) => (
                                  <div key={i} className="text-center relative bg-white p-4 rounded-xl border border-red-100 shadow-sm transition-all hover:shadow-md group/item">
                                      <div className="group relative inline-block w-full">
                                          <img src={p.imageUrl} className="w-full h-40 object-contain bg-white mb-3 rounded-lg"/>
                                          {p.comment && <PreviewBubble text={p.comment} />}
                                      </div>
                                      <input type="text" placeholder="吹き出しコメント..." value={p.comment} onChange={(e) => updateHeroProductComment(block.id, i, e.target.value)} className="border border-yellow-200 p-2 w-full mb-3 text-xs bg-yellow-50 rounded-lg focus:ring-2 focus:ring-yellow-200 focus:bg-white outline-none transition-all"/>
                                      <p className="text-xs line-clamp-2 h-8 mb-2 text-gray-600 font-medium">{cleanName(p.name, block.nameFilter)}</p>
                                      <PriceDisplay price={p.price} refPrice={p.refPrice} isHero={true} />
                                      
                                      <div className="mt-3 flex justify-center gap-2 opacity-50 group-hover/item:opacity-100 transition-opacity">
                                          <button onClick={() => updateHeroProductInfo(block.id, i, prompt("新しい商品管理番号", p.code) || p.code)} className="bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors">🖊 変更</button>
                                          <button onClick={() => removeHeroProduct(block.id, i)} className="bg-gray-50 hover:bg-red-100 text-gray-400 hover:text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors">🗑</button>
                                      </div>
                                  </div>
                              ))}
                              <div className="flex gap-2 mt-4 p-3 bg-white/60 rounded-xl border-2 border-dashed border-red-200 items-center group hover:border-red-300 transition-colors">
                                  <input id={`hero-add-${block.id}`} placeholder="商品番号を入力してEnter" className="w-full p-2 bg-transparent text-sm outline-none placeholder-red-300 text-red-800 font-bold" onKeyDown={(e) => {
                                      if(e.key === 'Enter') {
                                          const val = (e.currentTarget as HTMLInputElement).value;
                                          if(val) { addHeroProduct(block.id, val); (e.currentTarget as HTMLInputElement).value = ""; }
                                      }
                                  }}/>
                                  <button onClick={() => { 
                                      const val = (document.getElementById(`hero-add-${block.id}`) as HTMLInputElement).value;
                                      if(val) { addHeroProduct(block.id, val); (document.getElementById(`hero-add-${block.id}`) as HTMLInputElement).value = ""; }
                                  }} className="bg-red-500 hover:bg-red-600 text-white w-8 h-8 rounded-full font-bold shadow-md transition-transform active:scale-95 flex items-center justify-center">＋</button>
                              </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                             {((block.heroBanners && block.heroBanners.length > 0) ? block.heroBanners : (block.heroBanner?.imageUrl ? [block.heroBanner] : [])).map((banner, i, arr) => (
                               <div key={i} className="mb-2 relative group">
                                 <ImageLinkInput img={banner.imageUrl} link={banner.linkUrl} label={`バナー${i+1}`} 
                                   onChange={(img, link) => {
                                      const newBanners = [...arr];
                                      newBanners[i] = { imageUrl: img, linkUrl: link };
                                      updateBlock(block.id, b => ({ ...b, heroBanners: newBanners } as ProductGridBlock));
                                   }} 
                                 />
                                 <button onClick={() => {
                                    const newBanners = arr.filter((_, idx) => idx !== i);
                                    updateBlock(block.id, b => ({ ...b, heroBanners: newBanners } as ProductGridBlock));
                                 }} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 bg-white rounded-full w-6 h-6 shadow flex items-center justify-center text-xs font-bold">×</button>
                               </div>
                             ))}
                             <button onClick={() => {
                                const current = (block.heroBanners && block.heroBanners.length > 0) ? block.heroBanners : (block.heroBanner?.imageUrl ? [block.heroBanner] : []);
                                updateBlock(block.id, b => ({ ...b, heroBanners: [...current, { imageUrl: "", linkUrl: "" }] } as ProductGridBlock));
                             }} className="w-full py-3 bg-white border-2 border-dashed border-red-200 text-red-500 font-bold rounded-xl hover:bg-red-50 hover:border-red-300 transition-all">+ バナーを追加</button>
                          </div>
                        )}
                      </div>

                      {/* グリッドエリア */}
                      <div className="w-full md:w-2/3 bg-white/60 p-5 rounded-2xl border border-gray-200 shadow-sm backdrop-blur-sm">
                        <div className="flex justify-between items-center mb-4">
                          <p className="font-bold text-gray-500 text-xs uppercase tracking-wider">通常商品一覧</p>
                          <div className="flex gap-2 items-center bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                            <input id={`grid-${block.id}`} placeholder="商品番号を追加..." className="w-48 p-2 text-sm outline-none" onKeyDown={e => { if(e.key==='Enter') { const el = e.currentTarget; const p = searchCsvProduct(el.value); if(p) { updateBlock(block.id, b => ({ ...b, gridProducts: [...(b as ProductGridBlock).gridProducts, p] } as ProductGridBlock)); el.value=""; }}}}/>
                            <button onClick={() => { const el = document.getElementById(`grid-${block.id}`) as HTMLInputElement; const p = searchCsvProduct(el.value); if(p) { updateBlock(block.id, b => ({ ...b, gridProducts: [...(b as ProductGridBlock).gridProducts, p] } as ProductGridBlock)); el.value=""; }}} className="bg-gray-800 hover:bg-black text-white w-8 h-8 rounded font-bold shadow flex items-center justify-center transition-colors">＋</button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                          {block.gridProducts.map((p, i) => (
                            <div key={i} className="bg-white p-2 border border-gray-100 text-xs relative group flex flex-col justify-between h-full rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
                              <div className="group relative">
                                <img src={p.imageUrl} className="w-full h-20 object-contain mb-2 rounded"/>
                                {p.comment && <PreviewBubble text={p.comment} />}
                                <p className="h-[40px] overflow-hidden text-left mb-1 leading-tight text-gray-500">{cleanName(p.name, block.nameFilter)}</p>
                              </div>
                              <input type="text" placeholder="吹き出し..." value={p.comment} onChange={(e) => { const newProds = [...block.gridProducts]; newProds[i] = { ...p, comment: e.target.value }; updateBlock(block.id, b => ({ ...b, gridProducts: newProds } as ProductGridBlock)); }} className="border p-1 w-full mb-1 text-[10px] bg-yellow-50 rounded focus:ring-1 focus:ring-yellow-400 outline-none"/>
                              <PriceDisplay price={p.price} refPrice={p.refPrice} isHero={false} />
                              
                              {/* プレビュー用ボタン (修正: 赤背景固定 & 光沢アニメ) */}
                              <div className="mt-2 text-center w-full">
                                <span className="grid-btn-preview inline-block font-bold rounded cursor-default" style={{ 
                                    backgroundColor: '#bf0000', 
                                    color: '#ffffff',
                                    whiteSpace: 'nowrap', 
                                    width: '100%', 
                                    display: 'block',
                                    padding: '2px 0', 
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    fontSize: '11px',
                                    position: 'relative'
                                }}>
                                  <span style={{position: 'relative', zIndex: 2}}>商品ページへ</span>
                                  <div className="absolute top-0 left-[-100%] w-1/2 h-full bg-gradient-to-r from-transparent via-white/50 to-transparent -skew-x-12 animate-[shine_3s_infinite] z-10"></div>
                                </span>
                              </div>

                              <div className="flex justify-between mt-2 border-t border-gray-100 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => moveProduct(block.id, i, -1)} disabled={i===0} className="text-gray-300 hover:text-blue-500 disabled:opacity-0 transition-colors">◀</button>
                                <div className="flex gap-2">
                                  <button onClick={() => { const newCode = prompt("新しい商品管理番号", p.code); if(newCode && newCode !== p.code) updateProductInfo(block.id, i, newCode); }} className="text-blue-500 hover:text-blue-700 font-bold text-[10px]">🖊</button>
                                  <button onClick={() => { const newGrid = block.gridProducts.filter((_, idx) => idx !== i); updateBlock(block.id, b => ({ ...b, gridProducts: newGrid } as ProductGridBlock)); }} className="text-red-400 hover:text-red-600 font-bold text-[10px]">🗑</button>
                                </div>
                                <button onClick={() => moveProduct(block.id, i, 1)} disabled={i===block.gridProducts.length-1} className="text-gray-300 hover:text-blue-500 disabled:opacity-0 transition-colors">▶</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 下部ボタン設定 */}
                    <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-4">
                      <div className="text-2xl">🔘</div>
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <span className="text-xs font-bold text-gray-400 block mb-1">ボタン文字</span>
                          <input type="text" value={block.bottomButtonText || ""} onChange={(e) => updateBlock(block.id, b => ({ ...b, bottomButtonText: e.target.value } as ProductGridBlock))} placeholder="例: もっと見る" className="border p-2 text-sm w-full rounded focus:ring-2 focus:ring-blue-400 outline-none"/>
                        </div>
                        <div>
                          <span className="text-xs font-bold text-gray-400 block mb-1">リンク先URL</span>
                          <input type="text" value={block.bottomButtonLink || ""} onChange={(e) => updateBlock(block.id, b => ({ ...b, bottomButtonLink: e.target.value } as ProductGridBlock))} placeholder="https://..." className="border p-2 text-sm w-full rounded focus:ring-2 focus:ring-blue-400 outline-none"/>
                        </div>
                        <div className="flex gap-3 items-end">
                           <div className="w-8 h-8 rounded-full border shadow-sm flex items-center justify-center overflow-hidden relative cursor-pointer" title="背景色">
                             <input type="color" value={block.bottomButtonBgColor || "#bf0000"} onChange={e => updateBlock(block.id, b => ({...b, bottomButtonBgColor: e.target.value} as ProductGridBlock))} className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"/>
                           </div>
                           <div className="w-8 h-8 rounded-full border shadow-sm flex items-center justify-center overflow-hidden relative cursor-pointer" title="文字色">
                             <input type="color" value={block.bottomButtonTextColor || "#ffffff"} onChange={e => updateBlock(block.id, b => ({...b, bottomButtonTextColor: e.target.value} as ProductGridBlock))} className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"/>
                           </div>
                        </div>
                      </div>
                      {/* ★追加: スマホ用コメント設定UI */}
                      <div className="border-l pl-4 ml-4">
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                          <input type="checkbox" checked={block.mobileCommentShow !== false} onChange={(e) => updateBlock(block.id, b => ({ ...b, mobileCommentShow: e.target.checked } as ProductGridBlock))} className="cursor-pointer"/>
                          <span className="font-bold text-xs">📱 スマホでコメントを表示</span>
                        </label>
                        {block.mobileCommentShow !== false && (
                           <div className="flex gap-4 text-xs">
                             <div>表示: <input type="number" value={block.mobileCommentDuration || 3} onChange={(e) => updateBlock(block.id, b => ({ ...b, mobileCommentDuration: Number(e.target.value) } as ProductGridBlock))} className="border p-1 w-10 text-center"/>秒</div>
                             <div>消灯: <input type="number" value={block.mobileCommentInterval || 1} onChange={(e) => updateBlock(block.id, b => ({ ...b, mobileCommentInterval: Number(e.target.value) } as ProductGridBlock))} className="border p-1 w-10 text-center"/>秒</div>
                           </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
          })}
        </div>

        {/* フローティング・ツールバー */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-lg border border-gray-200 p-2 rounded-2xl shadow-2xl z-50 flex gap-2 items-center px-4 overflow-x-auto max-w-[95vw]">
            {Object.entries(BLOCK_STYLES).map(([key, style]) => (
              <button 
                key={key}
                onClick={() => addBlock(key as BlockType)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg ${style.bg} border ${style.border} hover:-translate-y-0.5 transition-all shadow-sm hover:shadow`}
                title={style.label}
              >
                <span className="text-lg">{style.icon}</span>
                <span className={`text-xs font-bold ${style.color.replace('text-','')} whitespace-nowrap`}>{style.label}</span>
              </button>
            ))}
            
            <div className="w-px h-8 bg-gray-300 mx-1"></div>
            
            <button onClick={generateHTML} className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white px-4 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 transition-all hover:shadow-red-200 hover:shadow-xl active:scale-95 whitespace-nowrap">
              <span className="text-lg">🚀</span>
              <span className="text-xs">書き出し</span>
            </button>
        </div>
      </div>
    </div>
  );
}