import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Brand mark — uses /public/logo.png. Drop in a replacement image at that path
 * to update everywhere (sidebar, login, favicon source).
 */
export function Logo({
  className,
  size = 28,
  showWordmark = true,
}: {
  className?: string;
  size?: number;
  showWordmark?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt="Cognify"
      width={size}
      height={size}
      className="rounded-md object-contain"
      priority
    />
  );
}
