import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { username: credentials.username as string },
          include: { cabins: { include: { level: true } } },
        });

        if (!user || !user.isActive) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );
        if (!valid) return null;

        const cabin = user.cabins[0] ?? null;

        return {
          id: String(user.id),
          name: user.name,
          email: user.username,
          role: user.role,
          cabinId: cabin?.id ?? null,
          cabinName: cabin?.name ?? null,
          levelOrder: cabin?.level?.order ?? null,
          levelName: cabin?.level?.name ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u = user as any;
        token.role = u.role;
        token.userId = parseInt(user.id!);
        token.cabinId = u.cabinId;
        token.cabinName = u.cabinName;
        token.levelOrder = u.levelOrder;
        token.levelName = u.levelName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u = session.user as any;
        u.role = token.role;
        u.userId = token.userId;
        u.cabinId = token.cabinId;
        u.cabinName = token.cabinName;
        u.levelOrder = token.levelOrder;
        u.levelName = token.levelName;
      }
      return session;
    },
  },
  trustHost: true,
  useSecureCookies: false,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
});
