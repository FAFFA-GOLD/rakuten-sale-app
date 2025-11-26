import { NextResponse } from 'next/server';

// ★重要：ここに楽天RMSで取得したIDを入れてください
// まだなければ、このままでもアプリの画面は作れます（検索機能だけエラーになります）
const APP_ID = 'あなたのアプリケーションID'; 
const SECRET = 'あなたのシークレット'; 

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const itemUrl = searchParams.get('itemUrl'); // 商品管理番号

  if (!itemUrl) return NextResponse.json({ error: 'No item code' }, { status: 400 });

  // 楽天商品APIのエンドポイント
  const endpoint = `https://api.rakuten.co.jp/r/IchibaItem/Search/20170706?applicationId=${APP_ID}&keyword=${itemUrl}&hits=1`;

  try {
    const res = await fetch(endpoint);
    const data = await res.json();

    if (data.Items && data.Items.length > 0) {
      const item = data.Items[0].Item;
      return NextResponse.json({
        name: item.itemName,
        price: item.itemPrice,
        url: item.itemUrl,
        imageUrl: item.mediumImageUrls[0]?.imageUrl || '',
      });
    } else {
      // 見つからない場合
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'API Error' }, { status: 500 });
  }
}