/** Social links a salon can show on its page. */
export const SOCIAL_KEYS = ["instagram", "facebook", "tiktok", "website"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
export type Social = Partial<Record<SocialKey, string>>;
export const SOCIAL_LABEL: Record<SocialKey, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", website: "Website" };
