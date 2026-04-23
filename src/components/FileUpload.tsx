import React, { useCallback, useState } from 'react';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface FileUploadProps {
  onFilesSelect: (files: { base64: string; name: string; size: number; type: string }[]) => void;
  isQueueLoading: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFilesSelect, isQueueLoading }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    const validFiles = Array.from(fileList).filter(f => validTypes.includes(f.type));
    
    if (validFiles.length === 0) {
      alert('Please upload PDF or Image (PNG, JPG, WebP) files.');
      return;
    }

    const processedFiles = await Promise.all(validFiles.map(file => {
      return new Promise<{ base64: string; name: string; size: number; type: string }>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve({ base64, name: file.name, size: file.size, type: file.type });
        };
        reader.readAsDataURL(file);
      });
    }));

    onFilesSelect(processedFiles);
  }, [onFilesSelect]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
  }, [handleFiles]);

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className="bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-3xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none"
      >
        <div className={`relative group cursor-pointer border-2 border-dashed rounded-2xl py-24 transition-all duration-300 flex flex-col items-center justify-center ${
          isDragging 
            ? 'border-slate-400 dark:border-white/40 bg-slate-100/50 dark:bg-white/[0.04]' 
            : 'border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] hover:border-slate-200 dark:hover:border-white/10'
        }`}>
          <input
            type="file"
            multiple
            accept=".pdf"
            onChange={onFileChange}
            className="absolute inset-0 opacity-0 cursor-pointer"
            id="pdf-upload"
          />
          
          {isQueueLoading ? (
            <div className="flex flex-col items-center gap-4">
               <div className="w-12 h-12 border-4 border-slate-100 dark:border-white/5 border-t-black dark:border-t-white rounded-full animate-spin" />
               <p className="text-sm font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Processing Queue...</p>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-slate-100 dark:border-white/5 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                <Upload size={32} className="text-slate-400 dark:text-slate-500" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-slate-700 dark:text-slate-200">
                  Drop PDF files here
                </p>
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                  or click to select multiple files
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
;
