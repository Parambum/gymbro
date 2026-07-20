import { auth } from "@/auth";

/** Resolve the authenticated Mongo user id, or null if unauthenticated. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
