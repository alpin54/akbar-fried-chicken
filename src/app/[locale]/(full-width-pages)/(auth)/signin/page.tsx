import SignIn from "@/components/others/auth/sign-in";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Masuk | Fried Chicken Management",
  description: "Masuk ke aplikasi manajemen outlet",
};

export default function SignInPage() {
  return <SignIn />;
}
