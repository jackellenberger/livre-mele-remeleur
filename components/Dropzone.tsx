import React, { useCallback, useState } from 'react';
import { Upload, FileUp, FolderUp } from 'lucide-react';
import { cn, isFontFile, isImageFile } from '../utils/helpers';

interface DropzoneProps {
  onFilesAdded: (files: File[], assets: File[]) => void;
  disabled?: boolean;
}

const Dropzone: React.FC<DropzoneProps> = ({ onFilesAdded, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Recursive function to read entries
  const readEntry = async (entry: FileSystemEntry): Promise<{ svgs: File[], assets: File[] }> => {
    const svgs: File[] = [];
    const assets: File[] = [];

    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        (entry as FileSystemFileEntry).file(resolve, reject);
      });
      
      const name = file.name.toLowerCase();
      if (file.type === 'image/svg+xml' || name.endsWith('.svg')) {
        svgs.push(file);
      } else if (file.type.startsWith('image/') || isImageFile(name) || isFontFile(name)) {
        assets.push(file);
      }
    } else if (entry.isDirectory) {
      const dirReader = (entry as FileSystemDirectoryEntry).createReader();
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        dirReader.readEntries(resolve, reject);
      });
      
      for (const childEntry of entries) {
        const result = await readEntry(childEntry);
        svgs.push(...result.svgs);
        assets.push(...result.assets);
      }
    }
    return { svgs, assets };
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isProcessing) return;

    setIsProcessing(true);
    const svgs: File[] = [];
    const assets: File[] = [];

    try {
      const items = Array.from(e.dataTransfer.items);
      
      // Check if we can use webkitGetAsEntry (Standard in modern browsers)
      const entries = items
        .map(item => (item as any).webkitGetAsEntry ? (item as any).webkitGetAsEntry() : null)
        .filter(entry => entry !== null) as FileSystemEntry[];

      if (entries.length > 0) {
        for (const entry of entries) {
          const result = await readEntry(entry);
          svgs.push(...result.svgs);
          assets.push(...result.assets);
        }
      } else {
        // Fallback for simple file drop
        const droppedFiles = Array.from(e.dataTransfer.files) as File[];
        droppedFiles.forEach(file => {
          const name = file.name.toLowerCase();
          if (file.type === 'image/svg+xml' || name.endsWith('.svg')) {
            svgs.push(file);
          } else if (file.type.startsWith('image/') || isImageFile(name) || isFontFile(name)) {
            assets.push(file);
          }
        });
      }

      if (svgs.length > 0 || assets.length > 0) {
        onFilesAdded(svgs, assets);
      }
    } catch (err) {
      console.error("Error reading dropped files", err);
    } finally {
      setIsProcessing(false);
    }
  }, [onFilesAdded, disabled, isProcessing]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && !disabled) {
      const allFiles = Array.from(e.target.files) as File[];
      const svgs: File[] = [];
      const assets: File[] = [];

      allFiles.forEach(f => {
         const name = f.name.toLowerCase();
         if (f.type === 'image/svg+xml' || name.endsWith('.svg')) {
           svgs.push(f);
         } else if (f.type.startsWith('image/') || isImageFile(name) || isFontFile(name)) {
           assets.push(f);
         }
      });
      
      onFilesAdded(svgs, assets);
      e.target.value = '';
    }
  }, [onFilesAdded, disabled]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative group cursor-pointer flex flex-col items-center justify-center w-full h-64 rounded-2xl border-2 border-dashed transition-all duration-300 ease-in-out overflow-hidden bg-white",
        isDragging 
          ? "border-blue-500 bg-blue-50 scale-[1.01] shadow-xl" 
          : "border-gray-300 hover:border-blue-400 hover:bg-gray-50 shadow-sm",
        (disabled || isProcessing) && "opacity-50 cursor-not-allowed hover:border-gray-300 hover:bg-white"
      )}
    >
      <input
        type="file"
        multiple
        webkitdirectory="" // Attribute for folder selection
        directory="" // Non-standard fallback
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        onChange={handleFileInput}
        disabled={disabled || isProcessing}
      />
      
      <div className="flex flex-col items-center justify-center space-y-4 p-6 text-center z-10 pointer-events-none">
        <div className={cn(
          "p-4 rounded-full transition-colors duration-300",
          isDragging ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500 group-hover:bg-blue-50 group-hover:text-blue-500"
        )}>
          {isDragging ? <FolderUp className="w-8 h-8" /> : <Upload className="w-8 h-8" />}
        </div>
        
        <div>
          <p className="text-lg font-semibold text-gray-700">
            {isProcessing ? "Scanning files..." : isDragging ? "Drop folder or files here" : "Drag & drop files or folders"}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Supports SVGs, Images, and Fonts
          </p>
        </div>
      </div>
    </div>
  );
};

export default Dropzone;