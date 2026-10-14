import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import { LoginSchema } from "@/lib/validation";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * A real bcrypt hash of a value nobody will ever submit, compared against when
 * no account matches so that a missing user costs the same time as a wrong
 * password. Generated once at module load rather than hard-coded, so it cannot
 * become a credential by accident.
 */
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password-" + Math.random(), 12);

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
      async authorize(credentials, request) {
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        /**
         * Two limits, because they stop different attacks.
         *
         * Per-email stops someone grinding one known account — a gym member
         * whose address is on the membership list. Per-address stops credential
         * stuffing, where a leaked password dump is replayed across many
         * accounts and no single email is tried twice.
         *
         * Returning null rather than a 429 is forced: Auth.js gives authorize
         * no way to set a status. The caller sees the same "wrong password" it
         * would otherwise, which is no worse for an attacker and tells them
         * less than a rate-limit message would.
         */
        const ip = clientIp(request as unknown as Request);
        const [byEmail, byIp] = await Promise.all([
          rateLimit(`login:email:${parsed.data.email}`, 10, 900),
          rateLimit(`login:ip:${ip}`, 30, 900),
        ]);
        if (!byEmail.ok || !byIp.ok) return null;

        await connectDB();
        const user = await User.findOne({ email: parsed.data.email }).select("+passwordHash");

        /**
         * Always spend the cost of a hash comparison, even with no such user.
         * Returning early on a missing account answers "does this email have an
         * account here?" in a few milliseconds, which for a gym's member list
         * is exactly the question an attacker wants answered first.
         */
        if (!user?.passwordHash) {
          await bcrypt.compare(parsed.data.password, DUMMY_HASH);
          return null;
        }

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
