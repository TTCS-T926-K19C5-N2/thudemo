import { LoginForm } from "@/components/login-form";
import { safeReturnTo } from "@/lib/api";
import {
  decodePublicShowtime,
  type PublicShowtime,
} from "@/lib/contracts/showtimes";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  const destination = safeReturnTo(returnTo ?? null) ?? undefined;
  let show: PublicShowtime | null = null;
  if (destination) {
    try {
      const id = destination.split("/")[2];
      const response = await fetch(
        `${process.env.API_INTERNAL_URL ?? "http://localhost:3001"}/showtimes/${id}`,
        { cache: "no-store" },
      );
      if (response.ok) show = decodePublicShowtime(await response.json());
    } catch {
      /* Public context is optional; never fabricate prices on failure. */
    }
  }
  return <LoginForm returnTo={destination} show={show} />;
}
