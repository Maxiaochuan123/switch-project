import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GradientDots } from "@/components/gradient-dots";
import { ProjectPanelScreen } from "@/features/project-panel/project-panel-screen";
import { loadingStore } from "@/lib/loading-store";
import { LoadingDots } from "@/components/loading-dots";

export function App() {
  const [showLoader, setShowLoader] = useState(true);

  useEffect(() => {
    // 订阅全局加载状态
    const unsubscribe = loadingStore.subscribe((isLoading) => {
      if (!isLoading) {
        // 当业务逻辑加载完成（包括同步配置和运行状态）后，延迟 1 秒关闭背景
        setTimeout(() => {
          setShowLoader(false);
        }, 1000);
      }
    });

    // 如果组件挂载时已经加载完成（虽然概率极低）
    if (!loadingStore.getIsLoading()) {
      setTimeout(() => {
        setShowLoader(false);
      }, 1000);
    }

    return () => unsubscribe();
  }, []);

  return (
    <>
      <AnimatePresence>
        {showLoader && (
          <motion.div
            key="loader"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, filter: "blur(10px)" }} // 退出时增加模糊感
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-background"
          >
            <GradientDots className="opacity-40" />
            <motion.h1
              initial={{ opacity: 0, y: 20, scale: 0.95, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              transition={{ 
                delay: 0.2, 
                duration: 1.2, 
                ease: [0.22, 1, 0.36, 1] // 优雅的超平滑曲线
              }}
              className="relative z-10 text-[66px] font-bold tracking-[0.02em] text-foreground flex items-baseline"
            >
              Starting up
              <LoadingDots />
            </motion.h1>
          </motion.div>
        )}
      </AnimatePresence>
      <ProjectPanelScreen />
    </>
  );
}
