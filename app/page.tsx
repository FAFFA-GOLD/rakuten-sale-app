"use client";
import { useState, useRef } from "react";
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
interface BannerListBlock extends BaseBlock { type: 'banner_list'; banners: ImageItem[]; }
interface CouponListBlock extends BaseBlock { type: 'coupon_list'; coupons: ImageItem[]; }
interface CustomHtmlBlock extends BaseBlock { type: 'custom_html'; content: string; }
interface SpacerBlock extends BaseBlock { type: 'spacer'; height: number; }
interface TimerBannerBlock extends BaseBlock {
  type: 'timer_banner'; imageUrl: string; linkUrl: string; startTime: string; endTime: string;
}

interface ProductGridBlock extends BaseBlock {
  type: 'product_grid'; 
  title: string; 
  bgColor: string;
  heroMode: 'product' | 'banner'; 
  heroProducts: Product[]; // ★修正: 配列に変更
  heroBanner: ImageItem; 
  gridProducts: Product[];
  bottomButtonText?: string;
  bottomButtonLink?: string;
  bottomButtonBgColor?: string;
  bottomButtonTextColor?: string;
}

type Block = TopImageBlock | BannerListBlock | TimerBannerBlock | CouponListBlock | CustomHtmlBlock | SpacerBlock | ProductGridBlock;

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

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 内部ロジック (計算・検索) ---
  const calcTax = (priceStr: string): string => {
    if (!priceStr) return "";
    const num = Number(priceStr.replace(/,/g, ""));
    if (isNaN(num)) return priceStr;
    const taxIn = num * 1.1;
    const integerPart = Math.floor(taxIn);
    const decimalPart = taxIn - integerPart;
    return Math.floor(decimalPart * 10 + 0.00001) >= TAX_THRESHOLD ? (integerPart + 1).toString() : integerPart.toString();
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
    setCsvFileName(file.name);
    
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
      },
      error: () => alert("読み込み失敗")
    });
  };

  const refreshBlocksWithNewData = (data: any[], currentShopId: string) => {
    const newBlocks = blocks.map(block => {
      if (block.type !== 'product_grid') return block;
      const b = block as ProductGridBlock;
      
      // ★目玉商品の更新
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
      return { ...b, heroProducts: newHeroProducts, gridProducts: newGrid }; // 変更
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

  const loadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.shopId) setShopId(json.shopId);
        if (json.blocks) setBlocks(json.blocks);
        if (json.popupImage) setPopupImage(json.popupImage);
        if (json.popupLink) setPopupLink(json.popupLink);
        alert("プロジェクトを復元しました。");
      } catch (err) {
        alert("ファイルの読み込みに失敗しました。");
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
      case 'banner_list': newBlock = { ...base, type, banners: [] }; break;
      case 'coupon_list': newBlock = { ...base, type, coupons: [] }; break;
      case 'custom_html': newBlock = { ...base, type, content: "" }; break;
      case 'spacer': newBlock = { ...base, type, height: 50 }; break;
      case 'timer_banner': newBlock = { ...base, type, imageUrl: "", linkUrl: "", startTime: "", endTime: "" }; break;
      case 'product_grid': default:
        newBlock = { 
          ...base, type: 'product_grid', title: "カテゴリ名", bgColor: "#ffffff", 
          heroMode: 'product', heroProducts: [], // ★配列で初期化
          heroBanner: { imageUrl: "", linkUrl: "" }, 
          gridProducts: [],
          bottomButtonText: "", bottomButtonLink: "", bottomButtonBgColor: "#bf0000", bottomButtonTextColor: "#ffffff" 
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

  // ★目玉商品専用の操作関数
  const addHeroProduct = (blockId: string, code: string) => {
    const p = searchCsvProduct(code);
    if (!p) return;
    updateBlock(blockId, (block) => {
      const b = block as ProductGridBlock;
      // 既存のコメントなどは空で追加
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
      // コメントは維持して上書き
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
  
  // 商品移動・更新 (通常グリッド用 - 変更なし)
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
    
    const popupScript = popupImage ? `
<style>
  .overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: none; justify-content: center; align-items: center; z-index: 10000; }
  .popup-banner { background: transparent; padding: 0; text-align: center; position: relative; }
  .popup-banner img { width: 900px; max-width: 95%; display: block; margin: 0 auto; }
  .popup-banner .close-btn { display: inline-block; margin-top: 15px; padding: 10px 30px; font-size: 24px; font-weight: bold; color: #fff; background: #333; border-radius: 8px; cursor: pointer; box-shadow: 0 0 6px rgba(0,0,0,0.4); transition: 0.2s ease; }
  .popup-banner .close-btn:hover { background: #555; }
</style>
<div class="overlay" id="popup">
  <div class="popup-banner">
    ${popupLink ? `<a href="${popupLink}" target="_blank">` : ''}
    <img src="${popupImage}" border="0">
    ${popupLink ? `</a>` : ''}
    <div class="close-btn" id="closeBtn">× 閉じる</div>
  </div>
</div>
<script>
  window.onload = function() {
    let shownCount = localStorage.getItem("popupShown_${shopId}");
    shownCount = shownCount ? parseInt(shownCount, 10) : 0;
    if (shownCount < 3) {
      document.getElementById("popup").style.display = "flex";
      localStorage.setItem("popupShown_${shopId}", shownCount + 1);
    }
  };
  document.getElementById("closeBtn").onclick = function() { document.getElementById("popup").style.display = "none"; };
</script>` : '';

    const timerScript = `
<script>
  (function(){
    var now = new Date().getTime();
    var banners = document.querySelectorAll('.timer-banner');
    if(banners.length === 0) return;
    banners.forEach(function(banner){
      var s = banner.getAttribute('data-start');
      var e = banner.getAttribute('data-end');
      var start = s ? new Date(s).getTime() : null;
      var end = e ? new Date(e).getTime() : null;
      if(start && now < start) { banner.style.display = 'none'; return; }
      if(end && now > end) { banner.style.display = 'none'; return; }
      banner.style.display = 'block';
    });
  })();
</script>
`;

    let bodyContent = `
<div id="rakuten-sale-app">
  ${popupScript}
  <div class="sale-nav-container">
    <div class="sale-nav-trigger">MENU</div>
    <div class="sale-nav-list">
      <div style="font-weight:bold; border-bottom:2px solid #bf0000; padding-bottom:5px; margin-bottom:5px;">INDEX</div>
      ${categoryBlocks.map(b => `<a href="#cat-${b.id}">${b.title}</a>`).join('')}
    </div>
  </div>
`;

    blocks.forEach(block => {
      const isProduct = block.type === 'product_grid';
      const bgStyle = isProduct ? `background-color: ${(block as ProductGridBlock).bgColor}; color: ${(block as ProductGridBlock).bgColor === '#333333' ? '#fff' : '#333'}` : '';
      
      if(isProduct) {
        bodyContent += `<div class="cat-section-wrapper" style="${bgStyle}"><div class="sale-content-inner">`;
      } else if(block.type !== 'spacer') {
        bodyContent += `<div class="sale-content-inner">`;
      }

      // --- 各ブロックHTML出力 ---

      if (block.type === 'top_image') {
        bodyContent += block.imageUrl ? `
        <div class="top-image">
          ${block.linkUrl ? `<a href="${block.linkUrl}" target="_blank" style="text-decoration:none; border:none;">` : ''}
          <img src="${block.imageUrl}" alt="Top">
          ${block.linkUrl ? `</a>` : ''}
        </div>` : '';
      } else if (block.type === 'spacer') {
        bodyContent += `<div class="spacer" style="height: ${block.height}px;"></div>`;
      } else if (block.type === 'timer_banner') {
        if (block.imageUrl) {
          bodyContent += `
          <div class="timer-banner banner-stack" data-start="${block.startTime}" data-end="${block.endTime}" style="margin-bottom:30px;">
            ${block.linkUrl ? `<a href="${block.linkUrl}" target="_blank" style="text-decoration:none; border:none;">` : ''}
            <img src="${block.imageUrl}" style="width:100%">
            ${block.linkUrl ? `</a>` : ''}
          </div>`;
        }
      } else if (block.type === 'banner_list') {
        if (block.banners.length > 0) {
          bodyContent += `<div class="banner-stack">
            ${block.banners.map(b => `
              <div class="banner-item">
                ${b.linkUrl ? `<a href="${b.linkUrl}" target="_blank" style="text-decoration:none; border:none;">` : ''}
                <img src="${b.imageUrl}" style="width:100%">
                ${b.linkUrl ? `</a>` : ''}
              </div>`).join('')}
          </div>`;
        }
      } else if (block.type === 'coupon_list') {
        if (block.coupons.length > 0) {
          bodyContent += `<div class="coupon-grid">
            ${block.coupons.map(c => `
              <div class="coupon-item">
                ${c.linkUrl ? `<a href="${c.linkUrl}" target="_blank" style="text-decoration:none; border:none;">` : ''}
                <img src="${c.imageUrl}" style="width:100%">
                ${c.linkUrl ? `</a>` : ''}
              </div>`).join('')}
          </div>`;
        }
      } else if (block.type === 'custom_html') {
        bodyContent += `<div class="custom-html">${block.content}</div>`;
      } else if (block.type === 'product_grid') {
        bodyContent += `<div id="cat-${block.id}" class="cat-title">${block.title}</div>`;
        
        // ★ 目玉商品リストをループで出力
        if ((block as ProductGridBlock).heroMode === 'product' && (block as ProductGridBlock).heroProducts.length > 0) {
          (block as ProductGridBlock).heroProducts.forEach(product => {
            bodyContent += `<div class="hero-area">
              <div class="hero-img-container">
                <img src="${product.imageUrl}">
                ${product.comment ? `<div class="comment-bubble">${product.comment}</div>` : ''}
              </div>
              <div class="hero-info">
                <div class="hero-name">${product.name}</div>
                <div class="price-box">
                  ${product.refPrice ? `<span class="price-ref">${Number(product.refPrice).toLocaleString()}円</span><span class="price-arrow">➡</span>` : ''}
                  <span class="price-sale">${Number(product.price).toLocaleString()}円</span>
                </div>
                <a href="${product.url}" target="_blank" class="btn-buy" style="text-decoration:none !important;">商品ページへ</a>
              </div>
            </div>`;
          });
        }
        // 元の単一バナーモード
        else if (block.heroMode === 'banner' && block.heroBanner.imageUrl) {
          bodyContent += `<div style="margin-bottom: 20px;">
            ${block.heroBanner.linkUrl ? `<a href="${block.heroBanner.linkUrl}" target="_blank" style="text-decoration:none; border:none;">` : ''}
            <img src="${block.heroBanner.imageUrl}" class="hero-banner-img" alt="Featured" style="width:100%">
            ${block.heroBanner.linkUrl ? `</a>` : ''}
          </div>`;
        }

        if (block.gridProducts.length > 0) {
          bodyContent += `<div class="grid-area">
            ${block.gridProducts.map(p => `
            <div class="item-card">
              <a href="${p.url}" target="_blank" style="text-decoration:none; border:none;">
                <div class="img-wrap">
                  <img src="${p.imageUrl}">
                  ${p.comment ? `<div class="comment-bubble">${p.comment}</div>` : ''}
                </div>
                <div class="grid-name">${p.name}</div>
                <div class="price-box">
                  ${p.refPrice ? `<span class="price-ref">${Number(p.refPrice).toLocaleString()}円</span><span class="price-arrow">➡</span>` : ''}
                  <span class="price-sale">${Number(p.price).toLocaleString()}円</span>
                </div>
                <span class="grid-btn">商品ページへ</span>
              </a>
            </div>`).join('')}
          </div>`;
        }

        if (block.bottomButtonLink) {
          const btnBg = block.bottomButtonBgColor || '#bf0000';
          const btnText = block.bottomButtonTextColor || '#ffffff';
          bodyContent += `
          <div style="text-align:center; margin-top:30px;">
            <a href="${block.bottomButtonLink}" class="section-bottom-btn" target="_blank" style="background-color: ${btnBg}; color: ${btnText} !important;">
              ${block.bottomButtonText || 'もっと見る'}
            </a>
          </div>`;
        }
      }

      if(isProduct || block.type !== 'spacer') {
        bodyContent += `</div>`;
        if(isProduct) bodyContent += `</div>`;
      }
    });
    
    bodyContent += `</div>`;
    bodyContent += timerScript;

    const fullHTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>楽天スーパーセール特設ページ</title>
<style>
  body { margin: 0; padding: 0; font-family: "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif; line-height: 1.6; color: #333; }
  * { box-sizing: border-box; }
  img { max-width: 100%; height: auto; display: block; margin: 0 auto; border: none !important; outline: none !important; }
  
  #rakuten-sale-app a { 
    text-decoration: none !important; color: inherit !important; transition: opacity 0.3s; display: block; 
    border: none !important; outline: none !important; box-shadow: none !important;
  }
  #rakuten-sale-app a:hover { opacity: 0.9; text-decoration: none !important; border: none !important; }

  .sale-content-inner { max-width: 900px; margin: 0 auto; padding: 0 10px; position: relative; }

  /* メニュー */
  .sale-nav-container { position: fixed; left: 0; top: 20%; z-index: 9999; transform: translateX(-100%); transition: transform 0.3s; display: flex; }
  .sale-nav-container:hover { transform: translateX(0); }
  .sale-nav-trigger { background: #333; color: #fff; width: 40px; padding: 15px 0; display: flex; align-items: center; justify-content: center; font-weight: bold; cursor: pointer; border-radius: 0 8px 8px 0; writing-mode: vertical-rl; letter-spacing: 2px; box-shadow: 2px 2px 5px rgba(0,0,0,0.2); position: absolute; left: 100%; top: 0; }
  .sale-nav-list { background: rgba(255,255,255,0.95); border: 1px solid #ddd; border-left: none; box-shadow: 2px 2px 10px rgba(0,0,0,0.1); padding: 15px; min-width: 200px; display: flex; flex-direction: column; gap: 10px; border-radius: 0 0 8px 0; }
  .sale-nav-list a { display: block; font-size: 14px; color: #333 !important; padding: 8px; border-bottom: 1px dashed #eee !important; }
  .sale-nav-list a:hover { color: #bf0000 !important; padding-left: 12px; }

  .top-image { margin-bottom: 20px; width: 100%; }
  .banner-stack { display: flex; flex-direction: column; gap: 15px; margin-bottom: 30px; }
  .coupon-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px; }
  
  .cat-section-wrapper { width: 100%; padding: 40px 0; margin-bottom: 0; }
  .cat-title { text-align: center; font-size: 26px; font-weight: bold; margin: 0 0 40px; padding: 10px 0; letter-spacing: 3px; position: relative; color: inherit; animation: titlePulse 3s ease-in-out infinite; }
  .cat-title::after { content: ''; display: block; width: 50px; height: 3px; background: #bf0000; margin: 15px auto 0; transition: width 0.3s; animation: lineSway 3s ease-in-out infinite; }

  /* 目玉エリア */
  .hero-area { 
    display: flex; border: 1px solid #eee; margin-bottom: 30px; background:#fff; 
    box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px; 
    color:#333; position: relative; overflow: visible !important; z-index: 10;
  }
  .hero-area:hover { z-index: 50; }

  .hero-img-container { width: 50%; position: relative; }
  .hero-img-container img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px 0 0 8px; }
  .hero-info { width: 50%; padding: 30px; display: flex; flex-direction: column; justify-content: center; text-align: center; }
  .hero-name { font-size: 18px; font-weight: bold; margin-bottom: 15px; }
  
  .price-box { margin: 15px 0; display: flex; justify-content: center; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .price-ref { color: #999; text-decoration: line-through; font-size: 14px; }
  .price-arrow { color: #ccc; font-size: 12px; margin: 0 5px; display: inline-block; } 
  .price-sale { color: #bf0000; font-weight: bold; font-family: Arial; }
  .hero-info .price-sale { font-size: 36px; }
  .btn-buy { background: linear-gradient(to bottom, #d90000, #bf0000); color: white !important; padding: 12px 40px; border-radius: 30px; font-weight: bold; display:inline-block; margin-top:15px; text-decoration: none !important; }

  /* グリッド */
  .grid-area { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; color:#333; }
  .item-card { 
    border: 1px solid #f0f0f0; padding: 10px; text-align: center; background:#fff; 
    display: flex; flex-direction: column; justify-content: space-between; height: 100%; 
    border-radius: 6px; transition: all 0.3s; position: relative; top: 0;
    overflow: visible !important; z-index: 10;
  }
  .item-card:hover { top: -5px; border-color: #ffd1d1; box-shadow: 0 10px 20px rgba(0,0,0,0.1); z-index: 50; }
  
  .img-wrap { position: relative; width: 100%; margin-bottom: 8px; }
  .img-wrap img { width: 100%; height: 180px; object-fit: contain; }
  .grid-name { font-size: 13px; height: 90px; overflow: hidden; line-height: 1.4; margin-bottom: 5px; text-align: left; color: #555; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; }
  .item-card .price-box { justify-content: flex-end; padding-right: 5px; margin: 5px 0 0; }
  .item-card .price-sale { font-size: 18px; }
  
  .grid-btn { 
    display: block; 
    background: #bf0000; color: #fff !important; 
    text-align: center; 
    padding: 10px 0; 
    margin-top: 8px; border-radius: 4px; 
    font-weight: bold; 
    font-size: 15px; 
    transition: opacity 0.2s; text-decoration: none !important; 
  }
  .item-card:hover .grid-btn { opacity: 0.8; }

  /* 下部ボタン */
  .section-bottom-btn {
    display: inline-block;
    padding: 20px 80px;
    border-radius: 50px;
    font-weight: bold;
    text-decoration: none !important;
    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    transition: transform 0.2s;
    font-size: 24px;
  }
  .section-bottom-btn:hover { transform: translateY(-2px); opacity: 0.9; }

  /* 吹き出し (PC) */
  .comment-bubble { 
    position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 10px; 
    background: #333; color: #fff; padding: 8px 12px; border-radius: 6px; 
    font-size: 12px; font-weight: bold; width: 180px; text-align: center;
    pointer-events: none; z-index: 9999; 
    box-shadow: 0 4px 10px rgba(0,0,0,0.2); opacity: 0; visibility: hidden; transition: all 0.3s; 
  }
  .comment-bubble::after { content: ''; position: absolute; top: 100%; left: 50%; margin-left: -6px; border-width: 6px; border-style: solid; border-color: #333 transparent transparent transparent; }
  .item-card:hover .comment-bubble, .hero-img-container:hover .comment-bubble { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(-5px); }

  .spacer { width: 100%; }

  @keyframes bubbleLoop { 0%, 75% { opacity: 1; visibility: visible; } 76%, 100% { opacity: 0; visibility: hidden; } }
  @keyframes titlePulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
  @keyframes lineSway { 0%, 100% { width: 50px; } 50% { width: 100px; } }

  @media screen and (max-width: 1024px) {
    .hero-area { flex-direction: column; }
    .hero-img-container { width: 100%; }
    .hero-img-container img { border-radius: 8px 8px 0 0; }
    .hero-info { width: 100%; }
    .grid-area { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
    .grid-name { font-size: 12px; height: 84px; }
    .sale-nav-trigger { width: 30px; font-size: 12px; padding: 10px 0; }
    
    .comment-bubble {
       top: auto !important; bottom: 0 !important; left: 0 !important; width: 100% !important; margin: 0 !important;
       border-radius: 0 0 4px 4px !important; background: rgba(0,0,0,0.75) !important; transform: none !important;
       animation: bubbleLoop 4s infinite !important;
    }
    .comment-bubble::after { 
      display: block !important; top: auto !important; bottom: 100% !important; left: 50% !important;
      border-color: transparent transparent rgba(0,0,0,0.75) transparent !important;
    }
  }
</style>
</head>
<body>
${bodyContent}
</body>
</html>`;

    navigator.clipboard.writeText(fullHTML);
    alert("HTMLを作成しました！");
  };

  // ---------------------------------------------------------
  // ▼ UIコンポーネント (デザイン刷新)
  // ---------------------------------------------------------
  
  const PriceDisplay = ({ price, refPrice, isHero = false }: { price: string, refPrice: string, isHero?: boolean }) => (
    <div className={`flex items-baseline gap-2 my-2 flex-wrap ${isHero ? 'justify-center' : 'justify-end'}`}>
      {refPrice && <><span className={`text-gray-400 line-through ${isHero ? 'text-lg' : 'text-xs'}`}>{Number(refPrice).toLocaleString()}円</span><span className="text-gray-400 text-xs mx-1">➡</span></>}
      <span className={`text-red-600 font-bold ${isHero ? 'text-3xl' : 'text-base'}`}>{Number(price).toLocaleString()}円</span>
    </div>
  );

  const ImageLinkInput = ({ img, link, onChange, label = "画像" }: { img: string, link: string, onChange: (i: string, l: string) => void, label?: string }) => (
    <div className="flex flex-col gap-2 mb-3 p-3 border border-gray-200 bg-gray-50 rounded-lg shadow-sm">
      <div className="flex gap-2 items-center">
        <span className="text-xs font-bold w-12 text-gray-600">{label}URL</span>
        <input type="text" value={img} onChange={e => onChange(e.target.value, link)} placeholder="https://..." className="border p-2 text-sm w-full rounded focus:ring-2 focus:ring-blue-400 outline-none"/>
      </div>
      <div className="flex gap-2 items-center">
        <span className="text-xs font-bold w-12 text-gray-600">リンク先</span>
        <input type="text" value={link} onChange={e => onChange(img, e.target.value)} placeholder="https://..." className="border p-2 text-sm w-full rounded focus:ring-2 focus:ring-blue-400 outline-none"/>
      </div>
      {img && <img src={img} className="h-20 object-contain self-center bg-white border rounded p-1" />}
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
      {/* ★ローディング画面 */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white p-6 rounded-xl shadow-2xl flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-700 font-bold animate-pulse">データを読み込んでいます...</p>
            <p className="text-xs text-gray-400 mt-2">※画面を閉じないでください</p>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex items-center justify-between bg-white p-6 rounded-xl shadow-md border-b-4 border-red-500">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-800">🛍️ 楽天スーパーセール作成ツール</h1>
            <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full font-bold">Ver 1.5</span>
          </div>
          <button 
            onClick={() => signOut()} 
            className="text-sm text-gray-500 hover:text-red-500 font-bold flex items-center gap-1 transition-colors"
          >
            🚪 ログアウト
          </button>
        </header>

        {/* 初期設定カード */}
        <div className="bg-white p-6 rounded-xl shadow-md mb-10 border border-gray-200">
          <div className="flex justify-between items-center mb-6 border-b pb-4">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <span className="bg-blue-100 text-blue-600 py-1 px-3 rounded-full text-sm">STEP 1</span>
              初期設定
            </h2>
            <div className="flex gap-3">
              <label className="bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 text-xs px-4 py-2 rounded-full cursor-pointer font-bold transition-colors flex items-center gap-2">
                📂 JSON読込
                <input type="file" accept=".json" onChange={loadProject} className="hidden" ref={fileInputRef} />
              </label>
              <button onClick={saveProject} className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs px-4 py-2 rounded-full font-bold transition-colors flex items-center gap-2">
                💾 JSON保存
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-sm font-bold mb-2 text-gray-600">① 対象店舗を選択</label>
              <div className="flex gap-2">
                {SHOPS.map(s => (
                  <button 
                    key={s.id} 
                    onClick={() => setShopId(s.id)} 
                    className={`flex-1 py-3 px-4 border rounded-lg font-bold transition-all ${shopId === s.id ? "bg-blue-600 text-white shadow-lg transform scale-105 ring-2 ring-blue-300" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold mb-2 text-gray-600">② CSVファイルを読み込む</label>
              <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white w-full py-3 rounded-lg font-bold shadow-md transition-all flex items-center justify-center gap-3 hover:shadow-lg active:scale-95">
                <span className="text-xl">📂</span>
                <span>ファイルを選択する (dl-normal-item.csv)</span>
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              </label>
              {csvFileName ? (
                <p className="text-green-600 font-bold text-sm mt-2 text-center animate-pulse">✓ {csvFileName} 読み込み完了</p>
              ) : (
                <p className="text-gray-400 text-xs mt-2 text-center">※まだファイルが選択されていません</p>
              )}
            </div>
          </div>

          {/* ポップアップ設定 */}
          <div className="mt-6 pt-6 border-t">
             <p className="font-bold text-sm mb-3 text-gray-600">★ ポップアップ広告設定 (任意)</p>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                <input type="text" placeholder="ポップアップ画像URL" value={popupImage} onChange={e => setPopupImage(e.target.value)} className="border p-2 text-sm w-full rounded focus:ring-2 focus:ring-blue-400 outline-none"/>
                <input type="text" placeholder="リンク先URL" value={popupLink} onChange={e => setPopupLink(e.target.value)} className="border p-2 text-sm w-full rounded focus:ring-2 focus:ring-blue-400 outline-none"/>
             </div>
          </div>
        </div>

        {/* ブロックリスト */}
        <div className="space-y-10">
          {blocks.map((block, index) => (
            <div key={block.id} className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden relative transition-shadow hover:shadow-xl">
              
              {/* ブロックヘッダー */}
              <div className="bg-slate-800 text-white p-3 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="bg-white/20 px-2 py-1 rounded text-xs font-bold">{index + 1}</span>
                  <span className="font-bold text-sm">
                    {block.type === 'top_image' && "🖼️ トップ画像"}
                    {block.type === 'banner_list' && "📑 バナー一覧"}
                    {block.type === 'coupon_list' && "🎟️ クーポン一覧"}
                    {block.type === 'custom_html' && "💻 自由HTML"}
                    {block.type === 'spacer' && "⬜ 空白スペース"}
                    {block.type === 'timer_banner' && "⏳ 期間限定バナー"}
                    {block.type === 'product_grid' && "🛍️ 商品カテゴリ"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => moveBlock(index, -1)} disabled={index === 0} className="w-8 h-8 flex items-center justify-center bg-slate-600 hover:bg-slate-500 disabled:opacity-30 rounded transition-colors">⬆</button>
                  <button onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1} className="w-8 h-8 flex items-center justify-center bg-slate-600 hover:bg-slate-500 disabled:opacity-30 rounded transition-colors">⬇</button>
                  <button onClick={() => removeBlock(block.id)} className="w-8 h-8 flex items-center justify-center bg-red-500 hover:bg-red-400 rounded ml-2 transition-colors">✖</button>
                </div>
              </div>

              <div className="p-6">
                {block.type === 'spacer' && (
                  <div className="flex items-center gap-4 p-6 bg-yellow-50 rounded-lg border border-yellow-100">
                    <span className="font-bold text-yellow-800">縦幅: {block.height}px</span>
                    <input type="range" min="10" max="200" value={block.height} onChange={(e) => updateBlock(block.id, b => ({ ...b, height: Number(e.target.value) } as SpacerBlock))} className="w-full h-2 bg-yellow-200 rounded-lg appearance-none cursor-pointer"/>
                  </div>
                )}
                {block.type === 'top_image' && (
                  <ImageLinkInput img={block.imageUrl} link={block.linkUrl} onChange={(img, link) => updateBlock(block.id, b => ({ ...b, imageUrl: img, linkUrl: link } as TopImageBlock))} />
                )}
                {block.type === 'timer_banner' && (
                  <div className="bg-orange-50 p-4 rounded border border-orange-100">
                    <p className="text-xs font-bold text-orange-800 mb-2">※表示期間の設定（HTML埋め込み時に自動制御されます）</p>
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <span className="text-xs font-bold block">開始日時</span>
                        <input type="datetime-local" value={block.startTime} onChange={(e) => updateBlock(block.id, b => ({ ...b, startTime: e.target.value } as TimerBannerBlock))} className="border p-2 w-full text-sm rounded"/>
                      </div>
                      <div>
                        <span className="text-xs font-bold block">終了日時</span>
                        <input type="datetime-local" value={block.endTime} onChange={(e) => updateBlock(block.id, b => ({ ...b, endTime: e.target.value } as TimerBannerBlock))} className="border p-2 w-full text-sm rounded"/>
                      </div>
                    </div>
                    <ImageLinkInput img={block.imageUrl} link={block.linkUrl} label="バナー" onChange={(img, link) => updateBlock(block.id, b => ({ ...b, imageUrl: img, linkUrl: link } as TimerBannerBlock))} />
                  </div>
                )}
                {block.type === 'banner_list' && (
                  <div>
                    {block.banners.map((banner, i) => (
                      <div key={i} className="flex gap-2 items-start mb-2">
                        <div className="flex-1"><ImageLinkInput img={banner.imageUrl} link={banner.linkUrl} label={`バナー${i+1} `} onChange={(img, link) => { const newBanners = [...block.banners]; newBanners[i] = { imageUrl: img, linkUrl: link }; updateBlock(block.id, b => ({ ...b, banners: newBanners } as BannerListBlock)); }} /></div>
                        <button onClick={() => { const newBanners = block.banners.filter((_, idx) => idx !== i); updateBlock(block.id, b => ({ ...b, banners: newBanners } as BannerListBlock)); }} className="text-red-500 hover:bg-red-50 w-8 h-8 rounded flex items-center justify-center">✖</button>
                      </div>
                    ))}
                    <button onClick={() => updateBlock(block.id, b => ({ ...b, banners: [...(b as BannerListBlock).banners, { imageUrl: "", linkUrl: "" }] } as BannerListBlock))} className="w-full py-3 bg-gray-50 border-dashed border-2 border-gray-300 text-gray-500 font-bold hover:bg-gray-100 hover:border-gray-400 rounded transition-all">+ バナーを追加する</button>
                  </div>
                )}
                {block.type === 'coupon_list' && (
                  <div>
                    <div className="grid grid-cols-2 gap-4">
                      {block.coupons.map((coupon, i) => (
                        <div key={i} className="relative">
                          <button onClick={() => { const newCoupons = block.coupons.filter((_, idx) => idx !== i); updateBlock(block.id, b => ({ ...b, coupons: newCoupons } as CouponListBlock)); }} className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 flex justify-center items-center rounded-full z-10 shadow-md hover:scale-110 transition-transform">×</button>
                          <ImageLinkInput img={coupon.imageUrl} link={coupon.linkUrl} label={`クーポン${i+1} `} onChange={(img, link) => { const newCoupons = [...block.coupons]; newCoupons[i] = { imageUrl: img, linkUrl: link }; updateBlock(block.id, b => ({ ...b, coupons: newCoupons } as CouponListBlock)); }} />
                        </div>
                      ))}
                    </div>
                    <button onClick={() => updateBlock(block.id, b => ({ ...b, coupons: [...(b as CouponListBlock).coupons, { imageUrl: "", linkUrl: "" }] } as CouponListBlock))} className="w-full mt-2 py-3 bg-gray-50 border-dashed border-2 border-gray-300 text-gray-500 font-bold hover:bg-gray-100 hover:border-gray-400 rounded transition-all">+ クーポンを追加する</button>
                  </div>
                )}
                {block.type === 'custom_html' && (
                  <textarea value={block.content} onChange={e => updateBlock(block.id, b => ({ ...b, content: e.target.value } as CustomHtmlBlock))} className="w-full h-40 border p-3 text-sm font-mono bg-gray-50 rounded focus:ring-2 focus:ring-blue-400 outline-none" placeholder="<div>自由なHTMLタグを入力...</div>"/>
                )}
                
                {/* 商品グリッドブロック */}
                {block.type === 'product_grid' && (
                  <>
                    <input value={block.title} onChange={e => updateBlock(block.id, b => ({ ...b, title: e.target.value } as ProductGridBlock))} className="text-xl font-bold w-full border-b-2 border-gray-200 mb-6 p-2 focus:border-blue-500 outline-none transition-colors" placeholder="カテゴリ名を入力 (例: 半額セール)"/>
                    
                    <div className="flex gap-3 mb-6 items-center bg-gray-50 p-3 rounded-lg">
                      <span className="text-xs font-bold bg-white px-2 py-1 rounded border">背景色</span>
                      {BG_COLORS.map(c => (
                        <button 
                          key={c.code}
                          onClick={() => updateBlock(block.id, b => ({ ...b, bgColor: c.code } as ProductGridBlock))}
                          className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${block.bgColor === c.code ? 'border-blue-500 ring-2 ring-blue-200 scale-110' : 'border-gray-300'}`}
                          style={{ backgroundColor: c.code }}
                          title={c.name}
                        />
                      ))}
                    </div>

                    <div className="flex flex-col md:flex-row gap-6 items-start -mx-6 px-6 py-8" style={{ backgroundColor: block.bgColor, transition: 'background-color 0.3s' }}>
                      {/* 目玉エリア */}
                      <div className="w-full md:w-1/3 bg-red-50 p-4 rounded-xl border border-red-100 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                          <p className="font-bold text-red-600 flex items-center gap-1"><span className="text-lg">★</span> 目玉エリア</p>
                          <div className="text-xs bg-white border rounded-lg flex overflow-hidden shadow-sm">
                            <button onClick={() => updateBlock(block.id, b => ({ ...b, heroMode: 'product' } as ProductGridBlock))} className={`px-3 py-1 transition-colors ${block.heroMode === 'product' ? 'bg-red-500 text-white font-bold' : 'text-gray-600 hover:bg-gray-50'}`}>商品</button>
                            <button onClick={() => updateBlock(block.id, b => ({ ...b, heroMode: 'banner' } as ProductGridBlock))} className={`px-3 py-1 transition-colors ${block.heroMode === 'banner' ? 'bg-red-500 text-white font-bold' : 'text-gray-600 hover:bg-gray-50'}`}>バナー</button>
                          </div>
                        </div>
                        
                        {block.heroMode === 'product' ? (
                          <div className="space-y-4">
                              {/* 目玉商品追加フォーム */}
                              <div className="flex gap-2 mb-3">
                                  <input id={`hero-add-${block.id}`} placeholder="商品番号を追加" className="w-full p-2 border text-sm rounded focus:ring-2 focus:ring-red-200 outline-none"/>
                                  <button onClick={() => { 
                                      const val = (document.getElementById(`hero-add-${block.id}`) as HTMLInputElement).value;
                                      if(val) { addHeroProduct(block.id, val); }
                                  }} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 text-sm rounded font-bold shadow transition-colors">追加</button>
                              </div>

                              {/* 既存の目玉商品リスト */}
                              {block.heroProducts.map((p, i) => (
                                  <div key={i} className="text-center relative bg-white p-3 rounded-lg border border-red-200 shadow-sm">
                                      <div className="group relative inline-block w-full">
                                          <img src={p.imageUrl} className="w-full h-40 object-contain bg-white mb-2 rounded"/>
                                          {p.comment && <PreviewBubble text={p.comment} />}
                                      </div>
                                      <input type="text" placeholder="吹き出しコメント..." value={p.comment} onChange={(e) => updateHeroProductComment(block.id, i, e.target.value)} className="border p-1 w-full mb-2 text-xs bg-yellow-50 rounded focus:ring-1 focus:ring-yellow-400 outline-none"/>
                                      <p className="text-xs line-clamp-2 h-8 mb-1 text-gray-700">{p.name}</p>
                                      <PriceDisplay price={p.price} refPrice={p.refPrice} isHero={true} />
                                      
                                      {/* 操作ボタン */}
                                      <div className="mt-2 flex justify-center gap-2">
                                          <button onClick={() => updateHeroProductInfo(block.id, i, prompt("新しい商品管理番号", p.code) || p.code)} className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded text-xs font-bold transition-colors">🖊 変更</button>
                                          <button onClick={() => removeHeroProduct(block.id, i)} className="bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded text-xs font-bold transition-colors">🗑 削除</button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                        ) : (
                          // 最初の目玉商品が無い場合の初期フォーム
                          <div className="flex gap-2">
                            <input id={`hero-add-${block.id}`} placeholder="商品番号 (例: ab-123)" className="w-full p-2 border text-sm rounded focus:ring-2 focus:ring-red-200 outline-none"/>
                            <button onClick={() => { const val = (document.getElementById(`hero-add-${block.id}`) as HTMLInputElement).value; if(val) addHeroProduct(block.id, val); }} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 text-sm rounded font-bold shadow transition-colors">Set</button>
                          </div>
                        )}
                        {block.heroMode === 'banner' && (
                          <ImageLinkInput img={block.heroBanner.imageUrl} link={block.heroBanner.linkUrl} label="バナー" onChange={(img, link) => updateBlock(block.id, b => ({ ...b, heroBanner: { imageUrl: img, linkUrl: link } } as ProductGridBlock))} />
                        )}
                      </div>

                      {/* グリッドエリア */}
                      <div className="w-full md:w-2/3 bg-gray-50/80 p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                          <p className="font-bold text-gray-700 text-sm">通常商品 (PC4列 / スマホ2列)</p>
                          <div className="flex gap-2">
                            <input id={`grid-${block.id}`} placeholder="商品番号を追加..." className="w-40 p-2 border text-sm rounded focus:ring-2 focus:ring-gray-300 outline-none" onKeyDown={e => { if(e.key==='Enter') { const el = e.currentTarget; const p = searchCsvProduct(el.value); if(p) { updateBlock(block.id, b => ({ ...b, gridProducts: [...(b as ProductGridBlock).gridProducts, p] } as ProductGridBlock)); el.value=""; }}}}/>
                            <button onClick={() => { const el = document.getElementById(`grid-${block.id}`) as HTMLInputElement; const p = searchCsvProduct(el.value); if(p) { updateBlock(block.id, b => ({ ...b, gridProducts: [...(b as ProductGridBlock).gridProducts, p] } as ProductGridBlock)); el.value=""; }}} className="bg-gray-700 hover:bg-black text-white px-4 py-2 text-sm rounded font-bold shadow transition-colors">追加</button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                          {block.gridProducts.map((p, i) => (
                            <div key={i} className="bg-white p-2 border border-gray-100 text-xs relative group flex flex-col justify-between h-full rounded-lg shadow-sm hover:shadow-md transition-shadow">
                              <div className="group relative">
                                <img src={p.imageUrl} className="w-full h-20 object-contain mb-2"/>
                                {p.comment && <PreviewBubble text={p.comment} />}
                                <p className="h-[60px] overflow-hidden text-left mb-1 leading-tight text-gray-600">{p.name}</p>
                              </div>
                              <input type="text" placeholder="吹き出し..." value={p.comment} onChange={(e) => { const newProds = [...block.gridProducts]; newProds[i] = { ...p, comment: e.target.value }; updateBlock(block.id, b => ({ ...b, gridProducts: newProds } as ProductGridBlock)); }} className="border p-1 w-full mb-1 text-[10px] bg-yellow-50 rounded focus:ring-1 focus:ring-yellow-400 outline-none"/>
                              <PriceDisplay price={p.price} refPrice={p.refPrice} isHero={false} />
                              
                              <div className="flex justify-between mt-2 border-t pt-2">
                                <button onClick={() => moveProduct(block.id, i, -1)} disabled={i===0} className="text-gray-400 hover:text-blue-600 disabled:opacity-10 transition-colors">◀</button>
                                <div className="flex gap-2">
                                  <button onClick={() => { const newCode = prompt("新しい商品管理番号", p.code); if(newCode && newCode !== p.code) updateProductInfo(block.id, i, newCode); }} className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded text-xs font-bold transition-colors flex items-center gap-1">🖊変更</button>
                                  <button onClick={() => { const newGrid = block.gridProducts.filter((_, idx) => idx !== i); updateBlock(block.id, b => ({ ...b, gridProducts: newGrid } as ProductGridBlock)); }} className="bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded text-xs font-bold transition-colors flex items-center gap-1">🗑削除</button>
                                </div>
                                <button onClick={() => moveProduct(block.id, i, 1)} disabled={i===block.gridProducts.length-1} className="text-gray-400 hover:text-blue-600 disabled:opacity-10 transition-colors">▶</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 p-5 bg-blue-50 border border-blue-100 rounded-xl">
                      <p className="font-bold text-sm text-blue-800 mb-3 flex items-center gap-2">🔘 下部ボタン設定 (任意)</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <span className="text-xs font-bold text-gray-500 block mb-1">ボタン文字</span>
                          <input type="text" value={block.bottomButtonText || ""} onChange={(e) => updateBlock(block.id, b => ({ ...b, bottomButtonText: e.target.value } as ProductGridBlock))} placeholder="例: もっと見る" className="border p-2 text-sm w-full rounded focus:ring-2 focus:ring-blue-300 outline-none"/>
                        </div>
                        <div>
                          <span className="text-xs font-bold text-gray-500 block mb-1">リンク先URL</span>
                          <input type="text" value={block.bottomButtonLink || ""} onChange={(e) => updateBlock(block.id, b => ({ ...b, bottomButtonLink: e.target.value } as ProductGridBlock))} placeholder="https://..." className="border p-2 text-sm w-full rounded focus:ring-2 focus:ring-blue-300 outline-none"/>
                        </div>
                        <div className="flex gap-4 items-end">
                          <div>
                            <span className="text-xs font-bold text-gray-500 block mb-1">背景色</span>
                            <input type="color" value={block.bottomButtonBgColor || "#bf0000"} onChange={e => updateBlock(block.id, b => ({...b, bottomButtonBgColor: e.target.value} as ProductGridBlock))} className="h-9 w-full cursor-pointer"/>
                          </div>
                          <div>
                            <span className="text-xs font-bold text-gray-500 block mb-1">文字色</span>
                            <input type="color" value={block.bottomButtonTextColor || "#ffffff"} onChange={e => updateBlock(block.id, b => ({...b, bottomButtonTextColor: e.target.value} as ProductGridBlock))} className="h-9 w-full cursor-pointer"/>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* フローティング・ツールバー */}
        <div className="fixed bottom-0 left-0 w-full bg-white/90 backdrop-blur-md border-t p-4 shadow-2xl z-50">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2 justify-center">
              <span className="text-xs font-bold text-gray-400 mr-2 self-center">ブロック追加:</span>
              <button onClick={() => addBlock('top_image')} className="bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 px-3 py-2 rounded-lg font-bold text-xs shadow-sm transition-all hover:-translate-y-1">🖼️ トップ画像</button>
              <button onClick={() => addBlock('banner_list')} className="bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 px-3 py-2 rounded-lg font-bold text-xs shadow-sm transition-all hover:-translate-y-1">📑 バナー</button>
              <button onClick={() => addBlock('timer_banner')} className="bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 px-3 py-2 rounded-lg font-bold text-xs shadow-sm transition-all hover:-translate-y-1">⏳ 期間バナー</button>
              <button onClick={() => addBlock('coupon_list')} className="bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 px-3 py-2 rounded-lg font-bold text-xs shadow-sm transition-all hover:-translate-y-1">🎟️ クーポン</button>
              <button onClick={() => addBlock('custom_html')} className="bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 px-3 py-2 rounded-lg font-bold text-xs shadow-sm transition-all hover:-translate-y-1">💻 自由HTML</button>
              <button onClick={() => addBlock('spacer')} className="bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 px-3 py-2 rounded-lg font-bold text-xs shadow-sm transition-all hover:-translate-y-1">⬜ 空白</button>
              <button onClick={() => addBlock('product_grid')} className="bg-gray-800 hover:bg-black text-white px-4 py-2 rounded-lg font-bold text-sm shadow-md transition-all hover:-translate-y-1 hover:shadow-lg">🛍️ 商品カテゴリ</button>
            </div>
            
            <button onClick={generateHTML} className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white px-8 py-3 rounded-full font-bold shadow-lg text-lg transform transition hover:scale-105 hover:shadow-xl flex items-center gap-2">
              <span>🚀 HTML書き出し</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}