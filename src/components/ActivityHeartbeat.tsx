"use client";

import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

/** Records the signed-in user as active on app open (throttled server-side). */
export function ActivityHeartbeat() {
  const beat = useMutation(api.users.heartbeat);
  useEffect(() => {
    beat({}).catch(() => {});
  }, [beat]);
  return null;
}
