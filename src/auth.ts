import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import { LoginSchema } from "@/lib/validation";

const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/**
 * Full server-side auth. Credentials validates email+password against the
 * Mongo `User` collection with bcrypt. Google (optional) upserts the OAuth
 * profile into the same collection in the signIn callback and threads the
 * Mongo _id back through `user.id` so the JWT carries our own id, not the
 * provider's — keeping every downstream query keyed on one identity.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        await connectDB();
        const user = await User.findOne({ email: parsed.data.email }).select("+passwordHash");
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          image: user.image ?? null,
        };
      },
    }),
    ...(googleEnabled
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true; // credentials handled in authorize

      await connectDB();
      const email = (profile?.email ?? user.email)?.toLowerCase();
      if (!email) return false;

      const existing = await User.findOne({ email });
      if (existing) {
        user.id = existing._id.toString();
      } else {
        const created = await User.create({
          email,
          name: profile?.name ?? user.name ?? email.split("@")[0],
          image: (profile?.picture as string) ?? user.image ?? undefined,
          provider: "google",
        });
        user.id = created._id.toString();
      }
      return true;
    },
  },
});
