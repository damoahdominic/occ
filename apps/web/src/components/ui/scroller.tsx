"use client";
import { ReactLenis } from "lenis/react";
import { useEffect, useState, type ReactNode } from "react";

function SmoothScrolling({ children }: { children: ReactNode }) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return <>{children}</>;
  }

  return (
    <ReactLenis root options={{ lerp: 0.1, duration: 2.0 }}>
      {children as any}
    </ReactLenis>
  );
}

export default SmoothScrolling;