import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Nav from "@/components/Nav";
import { MockRoleProvider } from "@/components/MockRoleProvider";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  if (!user) redirect("/auth/signin");

  return (
    <MockRoleProvider>
      <div className="min-h-screen bg-gray-50">
        <Nav
          user={{
            name: user.name,
            email: user.email,
            image: user.image,
            role: user.role,
          }}
        />
        <main className="min-h-[calc(100vh-57px)]">{children}</main>
      </div>
    </MockRoleProvider>
  );
}
