import { useEffect, useRef } from "react";

export function HeroField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    let animation = 0;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * scale);
      canvas.height = Math.floor(rect.height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      context.fillStyle = "#050505";
      context.fillRect(0, 0, rect.width, rect.height);

      const rows = 22;
      const cols = 38;
      const cellW = rect.width / cols;
      const cellH = rect.height / rows;

      for (let y = 0; y <= rows; y += 1) {
        for (let x = 0; x <= cols; x += 1) {
          const wave = Math.sin(x * 0.45 + frame * 0.018) + Math.cos(y * 0.7 + frame * 0.014);
          const alpha = 0.12 + Math.max(0, wave) * 0.16;
          context.fillStyle = `rgba(245, 245, 241, ${alpha})`;
          context.beginPath();
          context.arc(x * cellW, y * cellH, 1 + Math.max(0, wave) * 1.2, 0, Math.PI * 2);
          context.fill();
        }
      }

      context.strokeStyle = "rgba(245, 245, 241, 0.11)";
      context.lineWidth = 1;
      for (let y = 0; y <= rows; y += 1) {
        context.beginPath();
        for (let x = 0; x <= cols; x += 1) {
          const px = x * cellW;
          const py = y * cellH + Math.sin(x * 0.55 + frame * 0.014) * 8;
          if (x === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.stroke();
      }

      const pulse = (Math.sin(frame * 0.025) + 1) / 2;
      context.fillStyle = `rgba(141, 255, 199, ${0.16 + pulse * 0.1})`;
      context.fillRect(rect.width * 0.62, rect.height * 0.18, rect.width * 0.25, 2);
      context.fillStyle = `rgba(255, 225, 141, ${0.16 + (1 - pulse) * 0.08})`;
      context.fillRect(rect.width * 0.14, rect.height * 0.76, rect.width * 0.32, 2);

      frame += 1;
      animation = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animation);
  }, []);

  return <canvas className="hero-field" ref={canvasRef} aria-hidden="true" />;
}
