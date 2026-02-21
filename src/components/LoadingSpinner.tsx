"use client";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
}

export default function LoadingSpinner({
  size = "md",
  label,
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`${sizeClasses[size]} border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin`}
      />
      {label && (
        <p className="text-sm text-slate-500 animate-pulse">{label}</p>
      )}
    </div>
  );
}
