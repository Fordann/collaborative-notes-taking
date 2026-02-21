"use client";

import { useCallback, useState } from "react";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onTextInput?: (text: string) => void;
  accept?: string;
  label?: string;
  description?: string;
  allowText?: boolean;
}

export default function FileUpload({
  onFileSelect,
  onTextInput,
  accept = ".pdf,.png,.jpg,.jpeg,.txt",
  label = "Upload tes notes",
  description = "PDF, image ou fichier texte",
  allowText = true,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [textMode, setTextMode] = useState(false);
  const [textContent, setTextContent] = useState("");

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
        setSelectedFile(files[0]);
        onFileSelect(files[0]);
      }
    },
    [onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files[0]) {
        setSelectedFile(files[0]);
        onFileSelect(files[0]);
      }
    },
    [onFileSelect]
  );

  const handleTextSubmit = () => {
    if (textContent.trim() && onTextInput) {
      onTextInput(textContent);
    }
  };

  if (textMode && allowText) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700">{label}</label>
          <button
            onClick={() => setTextMode(false)}
            className="text-xs text-indigo-600 hover:text-indigo-700"
          >
            Uploader un fichier
          </button>
        </div>
        <textarea
          value={textContent}
          onChange={(e) => setTextContent(e.target.value)}
          placeholder="Colle ou tape tes notes ici..."
          className="w-full h-48 p-4 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none outline-none"
        />
        <button
          onClick={handleTextSubmit}
          disabled={!textContent.trim()}
          className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          Valider les notes
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        {allowText && (
          <button
            onClick={() => setTextMode(true)}
            className="text-xs text-indigo-600 hover:text-indigo-700"
          >
            Taper mes notes
          </button>
        )}
      </div>

      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
          isDragging
            ? "border-indigo-500 bg-indigo-50"
            : selectedFile
            ? "border-emerald-400 bg-emerald-50"
            : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
        }`}
      >
        <input
          type="file"
          accept={accept}
          onChange={handleFileInput}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />

        {selectedFile ? (
          <div className="space-y-2">
            <div className="text-3xl">✅</div>
            <p className="text-sm font-medium text-emerald-700">
              {selectedFile.name}
            </p>
            <p className="text-xs text-emerald-600">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-3xl">📄</div>
            <p className="text-sm font-medium text-slate-600">{label}</p>
            <p className="text-xs text-slate-400">{description}</p>
            <p className="text-xs text-slate-400">
              Glisse-dépose ou clique pour sélectionner
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
