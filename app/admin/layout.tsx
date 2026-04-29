import { redirect } from "next/navigation"

import { getAuthUser } from "@/lib/auth/clerk"
import { AdminShell } from "@/components/admin/admin-shell"

export const metadata = {
  title: "Admin",
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user) {
    redirect("/login")
  }
  if (user.role !== "admin") {
    redirect("/")
  }
  return <AdminShell user={user}>{children}</AdminShell>
}
