import { create } from "zustand";

interface Store {
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const useStore = create<Store>((set) => ({
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
}));

export default useStore;
