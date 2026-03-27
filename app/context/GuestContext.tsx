import React, { createContext, useContext, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

type PendingResult = {
  resultUri: string;
  storageId: Id<"_storage">;
};

type GuestContextValue = {
  isAnonymous: boolean;
  pendingResult: PendingResult | null;
  setPendingResult: (r: PendingResult) => void;
  clearPendingResult: () => void;
};

const GuestContext = createContext<GuestContextValue>({
  isAnonymous: false,
  pendingResult: null,
  setPendingResult: () => {},
  clearPendingResult: () => {},
});

export function GuestProvider({ children }: { children: React.ReactNode }) {
  const profile = useQuery(api.users.getMyProfile);
  const [pendingResult, setPendingResultState] = useState<PendingResult | null>(null);

  const isAnonymous = profile?.isAnonymous ?? false;

  const setPendingResult = (r: PendingResult) => setPendingResultState(r);
  const clearPendingResult = () => setPendingResultState(null);

  return (
    <GuestContext.Provider value={{ isAnonymous, pendingResult, setPendingResult, clearPendingResult }}>
      {children}
    </GuestContext.Provider>
  );
}

export function useGuest() {
  return useContext(GuestContext);
}
