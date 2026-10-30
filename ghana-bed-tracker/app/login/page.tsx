import { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { currentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Staff sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(user.role === "national" ? "/national" : "/portal");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="section-title">GhanaBed portal</p>
        <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          Sign in to report bed occupancy
        </h1>
      </header>
      <LoginForm />
    </div>
  );
}
