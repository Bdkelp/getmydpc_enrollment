export type DisplaySsnOptions = {
  reveal?: boolean;
  role?: string;
};

export function displaySSN(ssn: string | null | undefined, options?: DisplaySsnOptions): string {
  const { reveal = false, role = "" } = options || {};
  const canReveal = role === "admin" || role === "authorized" || role === "super_admin";

  const raw = typeof ssn === "string" ? ssn : "";
  const digits = raw.replace(/\D/g, "");

  if (reveal && canReveal && digits.length === 9) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }

  const tail = digits.slice(-4);
  return `***-**-${tail || "****"}`;
}
