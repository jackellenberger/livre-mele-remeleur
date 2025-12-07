import React from 'react';
import { ProcessedSVG, ProcessingStatus } from '../types';
import { formatBytes } from '../utils/helpers';
import { CheckCircle2, AlertCircle, Loader2, FileImage, X, Globe, Link } from 'lucide-react';
import { cn } from '../utils/helpers';

interface FileListProps {
  files: ProcessedSVG[];
  onRemove: (id: string) => void;
  onBundle: (id: string) => void;
}

const FileList: React.FC<FileListProps> = ({ files, onRemove, onBundle }) => {
  if (files.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 px-1">Queue ({files.length})</h3>
      <div className="grid gap-3">
        {files.map((file) => (
          <div 
            key={file.id} 
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex items-center justify-between group hover:shadow-md transition-shadow"
          >
            <div className="flex items-center space-x-4 flex-1 min-w-0">
              <div className={cn("p-2.5 rounded-lg", 
                file.status === ProcessingStatus.IDLE ? "bg-gray-100 text-gray-500" : "bg-blue-50 text-blue-600"
              )}>
                <FileImage className="w-6 h-6" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <p className="font-medium text-gray-900 truncate max-w-[200px] sm:max-w-md">
                    {file.originalFile.name}
                  </p>
                  <span className="text-xs text-gray-400 hidden sm:inline-block">
                    {formatBytes(file.originalFile.size)}
                  </span>
                </div>
                
                {/* Status Bar */}
                <div className="mt-1.5 flex items-center space-x-3">
                  {file.status !== ProcessingStatus.IDLE && (
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[150px]">
                      <div 
                        className={cn(
                          "h-full rounded-full transition-all duration-500 ease-out",
                          file.status === ProcessingStatus.COMPLETED ? "bg-green-500" :
                          file.status === ProcessingStatus.ERROR ? "bg-red-500" :
                          "bg-blue-500"
                        )}
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                  )}
                  
                  <span className={cn(
                    "text-xs font-medium uppercase tracking-wider",
                    file.status === ProcessingStatus.COMPLETED ? "text-green-600" :
                    file.status === ProcessingStatus.ERROR ? "text-red-600" :
                    file.status === ProcessingStatus.PROCESSING ? "text-blue-600" :
                    "text-gray-500"
                  )}>
                    {file.status === ProcessingStatus.COMPLETED ? 'Bundled' : 
                     file.status === ProcessingStatus.ERROR ? 'Failed' :
                     file.status === ProcessingStatus.PROCESSING ? `${file.progress}%` :
                     'Parsed'}
                  </span>
                </div>

                {file.errors.length > 0 && (
                   <p className="text-xs text-red-500 mt-1 truncate">
                    {file.errors.length} images failed to download
                   </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-3 pl-4 border-l border-gray-100 ml-4">
              {file.status === ProcessingStatus.IDLE && (
                <button
                  onClick={() => onBundle(file.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-full transition-colors"
                  title="Download and bundle external images"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Bundle Resources
                </button>
              )}
              
              {file.status === ProcessingStatus.PROCESSING && (
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              )}
              {file.status === ProcessingStatus.COMPLETED && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 rounded-full">
                   <Link className="w-3.5 h-3.5" />
                   {file.assets.length} assets
                </div>
              )}
              {file.status === ProcessingStatus.ERROR && (
                <AlertCircle className="w-5 h-5 text-red-500" />
              )}
              
              <button 
                onClick={() => onRemove(file.id)}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                title="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FileList;