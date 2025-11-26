import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const user = process.env.ADMIN_USER;
        const pass = process.env.ADMIN_PASSWORD;

        // 環境変数が読み込めていない場合の対策
        if (!user || !pass) {
          throw new Error("環境変数（ADMIN_USER, ADMIN_PASSWORD）が設定されていません");
        }

        if (
          credentials?.username === user &&
          credentials?.password === pass
        ) {
          return { id: "1", name: "Admin User" };
        }
        return null;
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 365 * 24 * 60 * 60, // 365日
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };