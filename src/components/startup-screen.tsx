import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GradientDots } from "@/components/gradient-dots";
import { loadingStore } from "@/lib/loading-store";
import { LoadingDots } from "@/components/loading-dots";
import logoAsset from "@/assets/brand/logo.png";

export function StartupScreen() {
  const [showLoader, setShowLoader] = useState(true);

  useEffect(() => {
    // 订阅全局加载状态
    const unsubscribe = loadingStore.subscribe((isLoading) => {
      if (!isLoading) {
        // 当业务逻辑加载完成后，延迟 1.5 秒关闭背景以展示精美动画
        setTimeout(() => {
          setShowLoader(false);
        }, 1500);
      }
    });

    if (!loadingStore.getIsLoading()) {
      setTimeout(() => {
        setShowLoader(false);
      }, 1500);
    }

    return () => unsubscribe();
  }, []);

  return (
    <AnimatePresence>
      {showLoader && (
        <motion.div
          key="loader"
          initial={{ opacity: 1 }}
          exit={{ 
            opacity: 0, 
            filter: "blur(20px)",
            scale: 1.05,
            transition: { duration: 1, ease: "easeInOut" } 
          }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#050507]"
        >
          {/* 背景点阵背景 */}
          <div className="absolute inset-0 z-0">
            <GradientDots className="opacity-50" />
          </div>

          {/* 中心电蝾螈与品牌标识 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ 
              duration: 1.2, 
              ease: [0.16, 1, 0.3, 1] 
            }}
            className="relative z-10 flex flex-col items-center gap-8"
          >
            {/* 电蝾螈图标 - 带有绿光呼吸动效 */}
            <motion.div
              animate={{
                filter: [
                  "drop-shadow(0 0 0px rgba(0,217,146,0))",
                  "drop-shadow(0 0 25px rgba(0,217,146,0.5))",
                  "drop-shadow(0 0 0px rgba(0,217,146,0))",
                ],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="relative"
            >
              <img 
                src={logoAsset} 
                alt="Current Logo" 
                className="size-[180px] rounded-[40px] object-contain"
              />
            </motion.div>

            <div className="flex flex-col items-center gap-1.5">
              <span className="text-4xl font-extrabold tracking-[0.15em] text-white">
                CURRENT
              </span>
              <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.3em] text-[#00d992]/90 drop-shadow-[0_0_5px_rgba(0,217,146,0.2)]">
                <span>INITIALIZING</span>
                <LoadingDots />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
