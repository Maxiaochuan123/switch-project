import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      richColors
      position="top-right"
      toastOptions={{
        className:
          "border border-border/50 bg-black/60 text-foreground shadow-2xl shadow-black/35",
      }}
      {...props}
    />
  );
}
