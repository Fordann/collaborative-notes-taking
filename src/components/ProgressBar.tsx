"use client";

import { useEffect, useState } from "react";

interface ProgressBarProps {
  progress: number;
  label?: string;
  showPercentage?: boolean;
  color?: "indigo" | "green" | "amber";
}

const colorMap = {
  indigo: "bg-indigo-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
};

export default function ProgressBar({
  progress,
  label,
  showPercentage = true,
  color = "indigo",
}: ProgressBarProps) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    // Animate the progress bar
    const timer = setTimeout(() => setWidth(progress), 100);
    return () => clearTimeout(timer);
  }, [progress]);

  return (
    <div className="w-full">
      {(label || showPercentage) && (
        <div className="flex justify-between items-center mb-1.5">
          {label && (
            <span className="text-sm text-slate-600 font-medium">{label}</span>
          )}
          {showPercentage && (
            <span className="text-sm font-semibold text-slate-700">
              {Math.round(progress)}%
            </span>
          )}
        </div>
      )}
      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${colorMap[color]}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
