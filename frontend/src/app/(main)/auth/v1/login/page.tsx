import { redirect } from "next/navigation";

export default function LegacyAuthPage() {
  redirect("/auth/v2/login");
}
