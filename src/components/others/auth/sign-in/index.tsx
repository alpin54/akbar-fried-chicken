"use client";

import { cn } from "@/utils";
import SignInFormFields from "./form";
import SignInHeader from "./header";

export default function SignIn() {
  return (
    <div className={cn("flex w-full flex-1 flex-col lg:w-1/2")}>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <SignInHeader
          title="Masuk"
          description="Masukkan username dan password untuk membuka aplikasi."
        />
        <SignInFormFields />
      </div>
    </div>
  );
}
