"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      // ★修正: リダイレクトを無効にして、結果を受け取る
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false, 
      });

      if (result?.error) {
        setError("IDまたはパスワードが違います");
      } else if (result?.ok) {
        // ★修正: ログイン成功したら強制的にトップへ移動
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError("ログイン処理中にエラーが発生しました");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md border-t-4 border-red-600">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">楽天セール作成ツール<br/><span className="text-sm font-normal text-gray-500">ログイン</span></h1>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">ユーザーID</label>
            <input 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-red-200 outline-none"
              placeholder="IDを入力"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">パスワード</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-red-200 outline-none"
              placeholder="パスワードを入力"
            />
          </div>

          {error && <p className="text-red-500 text-sm font-bold text-center">{error}</p>}

          <button 
            type="submit" 
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-colors shadow-md"
          >
            ログインする
          </button>
        </form>
      </div>
    </div>
  );
}