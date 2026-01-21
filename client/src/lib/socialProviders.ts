export type OAuthProvider =
  | "google"
  | "facebook"
  | "twitter"
  | "linkedin"
  | "microsoft"
  | "apple";

export type SocialProviderMeta = {
  id: OAuthProvider;
  label: string;
  shortLabel: string;
  accentClass: string;
};

export const socialProviders: SocialProviderMeta[] = [
  { id: "google", label: "Google", shortLabel: "G", accentClass: "bg-[#4285F4]" },
  { id: "facebook", label: "Facebook", shortLabel: "f", accentClass: "bg-[#1877F2]" },
  { id: "twitter", label: "Twitter", shortLabel: "t", accentClass: "bg-[#1DA1F2]" },
  { id: "linkedin", label: "LinkedIn", shortLabel: "in", accentClass: "bg-[#0A66C2]" },
  { id: "microsoft", label: "Microsoft", shortLabel: "ms", accentClass: "bg-[#737373]" },
  { id: "apple", label: "Apple", shortLabel: "A", accentClass: "bg-black" },
];
