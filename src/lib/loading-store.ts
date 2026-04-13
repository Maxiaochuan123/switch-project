type Listener = (isLoading: boolean) => void;
let listeners: Listener[] = [];
let isLoading = true;

export const loadingStore = {
  subscribe: (l: Listener) => {
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  },
  setLoading: (val: boolean) => {
    if (isLoading === val) return;
    isLoading = val;
    listeners.forEach((l) => l(val));
  },
  getIsLoading: () => isLoading,
};
