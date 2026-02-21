"use client";

import { useCallback, useState, useRef, useEffect } from "react";

type ConversionMode = "trace" | "posterize";
type AnimationType = "none" | "fade-in" | "draw" | "scale" | "slide-up";

function countSvgShapes(svg: string): { paths: number; layers: number } {
  const pathMatches = svg.match(/class="svg-shape"/g);
  const layerMatches = svg.match(/class="svg-layer"/g);
  return {
    paths: pathMatches?.length ?? 0,
    layers: layerMatches?.length ?? 0,
  };
}

function injectAnimation(
  svgContainer: HTMLElement,
  type: AnimationType,
  durationMs: number
) {
  const shapes = svgContainer.querySelectorAll<SVGPathElement>(".svg-shape");
  const layers = svgContainer.querySelectorAll<SVGGElement>(".svg-layer");

  // Reset all animations
  shapes.forEach((el) => {
    el.style.removeProperty("animation");
    el.style.removeProperty("opacity");
    el.style.removeProperty("transform");
    el.style.removeProperty("stroke-dasharray");
    el.style.removeProperty("stroke-dashoffset");
    el.style.removeProperty("stroke");
    el.style.removeProperty("stroke-width");
  });
  layers.forEach((el) => {
    el.style.removeProperty("animation");
    el.style.removeProperty("opacity");
  });

  if (type === "none") return;

  const total = shapes.length || 1;
  const staggerMs = Math.min(durationMs / total, 200);

  shapes.forEach((el, i) => {
    const delay = i * staggerMs;

    switch (type) {
      case "fade-in":
        el.style.opacity = "0";
        el.style.animation = `svg-draw ${durationMs}ms ease-out ${delay}ms forwards`;
        break;

      case "draw": {
        const length = el.getTotalLength?.() || 1000;
        const fill = el.getAttribute("fill") || "black";
        el.style.fill = "transparent";
        el.style.stroke = fill;
        el.style.strokeWidth = "1.5";
        el.style.strokeDasharray = `${length}`;
        el.style.strokeDashoffset = `${length}`;
        el.style.transition = `stroke-dashoffset ${durationMs}ms ease-out ${delay}ms, fill ${durationMs * 0.3}ms ease-out ${delay + durationMs * 0.7}ms`;
        requestAnimationFrame(() => {
          el.style.strokeDashoffset = "0";
          el.style.fill = fill;
        });
        break;
      }

      case "scale":
        el.style.opacity = "0";
        el.style.transformOrigin = "center";
        el.style.transformBox = "fill-box";
        el.style.transform = "scale(0)";
        el.style.transition = `opacity ${durationMs * 0.5}ms ease-out ${delay}ms, transform ${durationMs}ms cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms`;
        requestAnimationFrame(() => {
          el.style.opacity = "1";
          el.style.transform = "scale(1)";
        });
        break;

      case "slide-up":
        el.style.opacity = "0";
        el.style.transformOrigin = "center";
        el.style.transformBox = "fill-box";
        el.style.transform = "translateY(30px)";
        el.style.transition = `opacity ${durationMs * 0.5}ms ease-out ${delay}ms, transform ${durationMs}ms ease-out ${delay}ms`;
        requestAnimationFrame(() => {
          el.style.opacity = "1";
          el.style.transform = "translateY(0)";
        });
        break;
    }
  });
}

export default function ImageToSvgPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Options
  const [mode, setMode] = useState<ConversionMode>("trace");
  const [threshold, setThreshold] = useState("auto");
  const [color, setColor] = useState("#000000");
  const [useAutoColor, setUseAutoColor] = useState(true);
  const [background, setBackground] = useState("transparent");
  const [turdSize, setTurdSize] = useState(2);
  const [steps, setSteps] = useState(4);
  const [separated, setSeparated] = useState(true);
  const [showOptions, setShowOptions] = useState(false);

  // Animation
  const [animationType, setAnimationType] = useState<AnimationType>("none");
  const [animDuration, setAnimDuration] = useState(2000);
  const svgResultRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) {
      setError("Veuillez sélectionner une image (PNG, JPG, BMP, GIF)");
      return;
    }
    setFile(f);
    setError(null);
    setSvgContent(null);

    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files && files[0]) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  const handleConvert = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setSvgContent(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", mode);
      formData.append("threshold", threshold);
      formData.append("color", useAutoColor ? "auto" : color);
      formData.append("background", background);
      formData.append("turdSize", turdSize.toString());
      formData.append("steps", steps.toString());
      formData.append("separated", separated.toString());

      const res = await fetch("/api/image-to-svg", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors de la conversion");
      }

      const svg = await res.text();
      setSvgContent(svg);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de la conversion"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const baseName = file?.name?.replace(/\.[^.]+$/, "") || "image";
    a.download = `${baseName}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    if (!svgContent) return;
    await navigator.clipboard.writeText(svgContent);
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setSvgContent(null);
    setError(null);
    setAnimationType("none");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handlePlayAnimation = useCallback(() => {
    if (!svgResultRef.current || animationType === "none") return;
    injectAnimation(svgResultRef.current, animationType, animDuration);
  }, [animationType, animDuration]);

  // Play animation when type or duration changes
  useEffect(() => {
    if (svgContent && separated && animationType !== "none") {
      // Small delay to let the DOM settle
      const timer = setTimeout(handlePlayAnimation, 50);
      return () => clearTimeout(timer);
    }
  }, [svgContent, separated, animationType, animDuration, handlePlayAnimation]);

  const shapeInfo = svgContent && separated ? countSvgShapes(svgContent) : null;

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-800">
          Convertisseur Image vers SVG
        </h1>
        <p className="text-slate-500">
          Transforme tes images (PNG, JPG, BMP) en fichiers SVG vectoriels
        </p>
      </div>

      {/* Upload Zone */}
      {!svgContent && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
            isDragging
              ? "border-indigo-500 bg-indigo-50"
              : file
              ? "border-emerald-400 bg-emerald-50"
              : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/bmp,image/gif,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />

          {file && preview ? (
            <div className="space-y-4">
              <img
                src={preview}
                alt="Apercu"
                className="max-h-64 mx-auto rounded-lg shadow-sm"
              />
              <p className="text-sm font-medium text-emerald-700">
                {file.name}
              </p>
              <p className="text-xs text-emerald-600">
                {(file.size / 1024).toFixed(1)} Ko
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-5xl">
                <svg
                  className="w-16 h-16 mx-auto text-slate-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <p className="text-base font-medium text-slate-600">
                Glisse-dépose une image ici
              </p>
              <p className="text-sm text-slate-400">
                ou clique pour sélectionner un fichier
              </p>
              <p className="text-xs text-slate-400">
                PNG, JPG, BMP, GIF, WebP - Max 10 Mo
              </p>
            </div>
          )}
        </div>
      )}

      {/* Options Panel */}
      {file && !svgContent && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition"
          >
            <span className="font-medium text-slate-700">
              Options de conversion
            </span>
            <svg
              className={`w-5 h-5 text-slate-400 transition-transform ${
                showOptions ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {showOptions && (
            <div className="px-6 pb-6 space-y-5 border-t border-slate-100 pt-5">
              {/* Mode */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Mode
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setMode("trace")}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition ${
                      mode === "trace"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Trace (N&B)
                  </button>
                  <button
                    onClick={() => setMode("posterize")}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition ${
                      mode === "posterize"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Posterize (couleurs)
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  {mode === "trace"
                    ? "Convertit en tracé noir et blanc avec contours nets"
                    : "Préserve plusieurs niveaux de couleur pour un rendu plus riche"}
                </p>
              </div>

              {/* Threshold */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Seuil de luminosité
                </label>
                <div className="flex items-center gap-3">
                  <select
                    value={threshold === "auto" ? "auto" : "manual"}
                    onChange={(e) =>
                      setThreshold(e.target.value === "auto" ? "auto" : "128")
                    }
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                  >
                    <option value="auto">Automatique</option>
                    <option value="manual">Manuel</option>
                  </select>
                  {threshold !== "auto" && (
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      className="flex-1"
                    />
                  )}
                  {threshold !== "auto" && (
                    <span className="text-sm text-slate-500 w-8 text-right">
                      {threshold}
                    </span>
                  )}
                </div>
              </div>

              {/* Color */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Couleur du tracé
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={useAutoColor}
                      onChange={(e) => setUseAutoColor(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    Automatique
                  </label>
                  {!useAutoColor && (
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                    />
                  )}
                </div>
              </div>

              {/* Background */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Fond
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setBackground("transparent")}
                    className={`py-2 px-4 rounded-xl text-sm font-medium transition ${
                      background === "transparent"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Transparent
                  </button>
                  <button
                    onClick={() => setBackground("#ffffff")}
                    className={`py-2 px-4 rounded-xl text-sm font-medium transition ${
                      background === "#ffffff"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Blanc
                  </button>
                </div>
              </div>

              {/* Turd Size */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Suppression du bruit (turdSize)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="20"
                    value={turdSize}
                    onChange={(e) => setTurdSize(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm text-slate-500 w-8 text-right">
                    {turdSize}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Supprime les taches de moins de {turdSize} pixels
                </p>
              </div>

              {/* Steps (posterize only) */}
              {mode === "posterize" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Nombre de niveaux de couleur
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="2"
                      max="8"
                      value={steps}
                      onChange={(e) => setSteps(parseInt(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-sm text-slate-500 w-8 text-right">
                      {steps}
                    </span>
                  </div>
                </div>
              )}

              {/* Separated SVG toggle */}
              <div className="space-y-2 pt-3 border-t border-slate-100">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={separated}
                    onChange={(e) => setSeparated(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 w-5 h-5"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-700">
                      SVG animable (sous-groupes séparés)
                    </span>
                    <p className="text-xs text-slate-400">
                      Chaque contour est un &lt;path&gt; individuel dans un &lt;g&gt;, permettant des animations CSS/JS
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Convert Button */}
      {file && !svgContent && (
        <button
          onClick={handleConvert}
          disabled={loading}
          className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-base font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg
                className="animate-spin h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Conversion en cours...
            </>
          ) : (
            "Convertir en SVG"
          )}
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Result */}
      {svgContent && (
        <div className="space-y-6">
          {/* Shape info badge */}
          {shapeInfo && shapeInfo.paths > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium">
                {shapeInfo.paths} contours séparés
              </span>
              {shapeInfo.layers > 1 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-sm font-medium">
                  {shapeInfo.layers} couches
                </span>
              )}
            </div>
          )}

          {/* Animation controls */}
          {separated && shapeInfo && shapeInfo.paths > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">
                Aperçu d&apos;animation
              </h3>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: "none", label: "Aucune" },
                    { value: "fade-in", label: "Fondu" },
                    { value: "draw", label: "Dessin (stroke)" },
                    { value: "scale", label: "Zoom" },
                    { value: "slide-up", label: "Glissement" },
                  ] as { value: AnimationType; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setAnimationType(opt.value)}
                    className={`py-2 px-4 rounded-xl text-sm font-medium transition ${
                      animationType === opt.value
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {animationType !== "none" && (
                <div className="flex items-center gap-4">
                  <label className="text-sm text-slate-600 whitespace-nowrap">
                    Durée
                  </label>
                  <input
                    type="range"
                    min="500"
                    max="6000"
                    step="250"
                    value={animDuration}
                    onChange={(e) => setAnimDuration(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm text-slate-500 w-12 text-right">
                    {(animDuration / 1000).toFixed(1)}s
                  </span>
                  <button
                    onClick={handlePlayAnimation}
                    className="py-2 px-4 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center gap-1.5"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Rejouer
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Side by side comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Original */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide">
                Image originale
              </h3>
              <div className="bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] rounded-xl border border-slate-200 p-4 flex items-center justify-center min-h-[300px]">
                {preview && (
                  <img
                    src={preview}
                    alt="Original"
                    className="max-w-full max-h-80 object-contain"
                  />
                )}
              </div>
            </div>

            {/* SVG Result */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide">
                Résultat SVG
              </h3>
              <div
                ref={svgResultRef}
                className="bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] rounded-xl border border-slate-200 p-4 flex items-center justify-center min-h-[300px]"
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleDownload}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Télécharger le SVG
            </button>
            <button
              onClick={handleCopy}
              className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200 transition flex items-center justify-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              Copier le code SVG
            </button>
            <button
              onClick={handleReset}
              className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200 transition flex items-center justify-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Nouvelle conversion
            </button>
          </div>

          {/* SVG Code Preview */}
          <details className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <summary className="px-6 py-4 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
              Voir le code SVG
            </summary>
            <div className="px-6 pb-6">
              <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs overflow-x-auto max-h-64">
                <code>{svgContent}</code>
              </pre>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
