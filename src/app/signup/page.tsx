import { AuthScreen } from "@/components/auth/auth-screen";

const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export default function SignupPage() {
  return <AuthScreen mode="signup" googleEnabled={googleEnabled} />;
}
