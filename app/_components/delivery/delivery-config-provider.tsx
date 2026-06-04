"use client";

import { createContext, useContext } from "react";
import { DEFAULT_DELIVERY_CONFIG, type DeliveryConfig } from "@/app/_lib/checkout-config";

const DeliveryConfigContext = createContext<DeliveryConfig>(DEFAULT_DELIVERY_CONFIG);

export function DeliveryConfigProvider({
  value,
  children,
}: {
  value: DeliveryConfig;
  children: React.ReactNode;
}) {
  return <DeliveryConfigContext.Provider value={value}>{children}</DeliveryConfigContext.Provider>;
}

export function useDeliveryConfig(): DeliveryConfig {
  return useContext(DeliveryConfigContext);
}
