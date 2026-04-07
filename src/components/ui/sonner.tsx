import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      richColors
      position="top-right"
      toastOptions={{
        className:
          "border border-white/10 bg-[#0d1426]/95 text-foreground shadow-2xl shadow-black/35",
      }}
      {...props}
    />
  );
}
