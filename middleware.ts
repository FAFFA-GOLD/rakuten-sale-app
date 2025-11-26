export { default } from "next-auth/middleware";

// ログイン認証をかけたいページの設定
// loginページ、api、画像ファイル等以外はすべて認証が必要にする
export const config = {
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};