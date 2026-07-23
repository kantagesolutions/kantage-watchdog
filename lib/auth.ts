import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 7 * 24 * 3600 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Watchdog",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const u = process.env.WATCHDOG_ADMIN_USERNAME;
        const p = process.env.WATCHDOG_ADMIN_PASSWORD;
        if (!u || !p) return null;
        if (credentials?.username === u && credentials?.password === p) {
          return { id: "admin", name: "Admin", email: u };
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token }) { return token; },
    async session({ session, token }) {
      if (session.user) session.user.name = token.name as string;
      return session;
    },
  },
};
