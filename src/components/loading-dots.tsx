import { motion } from "framer-motion";

export function LoadingDots() {
  return (
    <span className="inline-flex gap-1.5 ml-1 items-center">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0.1, scale: 0.6 }}
          animate={{ 
            opacity: [0.1, 1, 0.1],
            scale: [0.6, 1.3, 0.6],
            boxShadow: [
              "0 0 0px rgba(0,217,146,0)",
              "0 0 10px rgba(0,217,146,0.6)",
              "0 0 0px rgba(0,217,146,0)"
            ]
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.2,
            ease: "easeInOut",
          }}
          className="size-1 rounded-full bg-[#00d992]"
        />
      ))}
    </span>
  );
}
