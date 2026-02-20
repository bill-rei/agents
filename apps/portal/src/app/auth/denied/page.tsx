import Link from "next/link";

const REASON_MESSAGES: Record<string, string> = {
  not_allowed: "Your email address is not on the access list.",
  unverified: "Your Google account email has not been verified.",
  no_role: "No role has been assigned to your account.",
};

export default function DeniedPage({
  searchParams,
}: {
  searchParams: { reason?: string; error?: string };
}) {
  const reason = searchParams.reason ?? searchParams.error ?? "";
  const message =
    REASON_MESSAGES[reason] ??
    "You are not authorised to access this application.";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-sm border w-full max-w-sm text-center">
        <div className="text-3xl mb-4">&#x26D4;</div>
        <h1 className="text-xl font-bold mb-2 text-gray-900">Access Denied</h1>
        <p className="text-sm text-gray-600 mb-6">{message}</p>
        <p className="text-xs text-gray-400 mb-6">
          If you believe this is an error, contact{" "}
          <a
            href="mailto:bill@llif.org"
            className="underline hover:text-gray-600"
          >
            bill@llif.org
          </a>{" "}
          to request access.
        </p>
        <Link
          href="/auth/signin"
          className="text-sm text-gray-500 hover:text-gray-900 underline"
        >
          Back to sign-in
        </Link>
      </div>
    </div>
  );
}
