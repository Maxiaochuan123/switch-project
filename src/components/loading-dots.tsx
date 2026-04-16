import { motion } from "framer-motion";

export function LoadingDots() {
  return (
    <span className="inline-flex ml-2 text-foreground/80">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0.2 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            repeatType: "mirror",
            delay: i * 0.2, // 阶梯延迟
            ease: "easeInOut",
          }}
        >
          .
        </motion.span>
      ))}
    </span>
  );
}
