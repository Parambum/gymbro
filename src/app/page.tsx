import { auth } from "@/auth";
import { Landing } from "@/components/landing/landing";

export default async function LandingPage() {
  const session = await auth();
  return <Landing signedIn={Boolean(session?.user)} />;
}
