import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { getToastContent, type Feedback } from "./helpers";

export function useProjectFeedback() {
  const feedbackRef = useRef<Feedback | null>(null);
  const lastToastSignatureRef = useRef<string | null>(null);

  const setFeedback = useCallback<Dispatch<SetStateAction<Feedback | null>>>((value) => {
    const nextFeedback =
      typeof value === "function"
        ? (value as (current: Feedback | null) => Feedback | null)(feedbackRef.current)
        : value;

    feedbackRef.current = nextFeedback;

    if (!nextFeedback) {
      return;
    }

    const signature = JSON.stringify(nextFeedback);

    if (lastToastSignatureRef.current === signature) {
      feedbackRef.current = null;
      return;
    }

    lastToastSignatureRef.current = signature;

    window.setTimeout(() => {
      if (lastToastSignatureRef.current === signature) {
        lastToastSignatureRef.current = null;
      }
    }, 1200);

    if (nextFeedback.variant === "destructive") {
      toast.error(getToastContent(nextFeedback.title, nextFeedback.message));
    } else {
      toast.success(getToastContent(nextFeedback.title, nextFeedback.message));
    }

    feedbackRef.current = null;
  }, []);

  return {
    setFeedback,
  };
}
