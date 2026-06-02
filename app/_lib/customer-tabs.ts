export const CUSTOMER_TABS = ["customers", "admins", "all"] as const;
export type CustomerTab = (typeof CUSTOMER_TABS)[number];
