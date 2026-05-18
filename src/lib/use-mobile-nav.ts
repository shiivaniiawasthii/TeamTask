"use client";

import { create } from "zustand";

type MobileNavState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

export const useMobileNav = create<MobileNavState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
