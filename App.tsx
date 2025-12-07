import React, { useState, useCallback, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import FileSaver from 'file-saver';
import { ProcessedSVG, ProcessingStatus } from './types';
import { generateId, isFontFile } from './utils/helpers';
import { svgProcessor } from './services/svgProcessor';
import { pdfGenerator } from './services/pdfGenerator';
import Dropzone from './components/Dropzone';
import FileList from './components/FileList';
import TaggingEditor from './components/TaggingEditor';
import ReorderEditor from './components/ReorderEditor';
import { Book, Download, RefreshCw, Archive, Tag, Upload, Globe, Layers, ChevronDown, FileText } from 'lucide-react';
import { cn } from './utils/helpers';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'upload' | 'tag' | 'reorder'>('upload');
  const [files, setFiles] = useState<ProcessedSVG[]>([]);
  const [isProcessingDownload, setIsProcessingDownload] = useState(false);
  const [preloadedAssets, setPreloadedAssets] = useState<Map<string, Blob>>(new Map());
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Tagging State
  const [availableTags, setAvailableTags] = useState<string[]>(['redact-text', 'redact-image']);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFilesAdded = useCallback(async (newFiles: File[], newAssets: File[]) => {
    // 1. Process Assets (add to pool)
    const updatedAssets = new Map(preloadedAssets);
    newAssets.forEach(asset => {
      updatedAssets.set(asset.name, asset);
    });
    setPreloadedAssets(updatedAssets);

    // 2. Initialize SVGs (Parse content but don't localize yet)
    const newProcessedFiles: ProcessedSVG[] = await Promise.all(newFiles.map(async (file) => {
      // Basic parse to get content string for preview
      const content = await svgProcessor.parse(file);
      
      return {
        id: generateId(),
        originalFile: file,
        processedContent: content,
        status: ProcessingStatus.IDLE, 
        assets: [],
        errors: [],
        progress: 0,
      };
    }));

    setFiles(prev => [...prev, ...newProcessedFiles]);
  }, [preloadedAssets]);

  const bundleFile = async (fileItem: ProcessedSVG) => {
    updateFileStatus(fileItem.id, { status: ProcessingStatus.PROCESSING });

    try {
      if (!fileItem.processedContent) throw new Error("No content to process");

      const result = await svgProcessor.bundleResources(
        fileItem.processedContent,
        preloadedAssets,
        (progress) => {
          updateFileStatus(fileItem.id, { progress });
        }
      );

      updateFileStatus(fileItem.id, {
        status: ProcessingStatus.COMPLETED,
        processedContent: result.content,
        assets: result.assets,
        errors: result.errors,
        progress: 100,
      });

    } catch (error) {
      console.error(error);
      updateFileStatus(fileItem.id, { 
        status: ProcessingStatus.ERROR,
        progress: 100,
        errors: [(error as Error).message]
      });
    }
  };

  const handleBundleAll = () => {
    files.forEach(file => {
      if (file.status === ProcessingStatus.IDLE || file.status === ProcessingStatus.ERROR) {
        bundleFile(file);
      }
    });
  };

  const updateFileStatus = (id: string, updates: Partial<ProcessedSVG>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const updateFileContent = (id: string, content: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, processedContent: content } : f));
  };

  const updateMultipleFiles = (updates: { id: string, content: string }[]) => {
    setFiles(prev => prev.map(f => {
      const update = updates.find(u => u.id === f.id);
      return update ? { ...f, processedContent: update.content } : f;
    }));
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleReorder = (newOrder: ProcessedSVG[]) => {
    setFiles(newOrder);
  };

  const handleAddTag = (tag: string) => {
    if (!availableTags.includes(tag)) {
      setAvailableTags(prev => [...prev, tag]);
    }
  };

  const getValidFiles = () => {
    return files.filter(f => f.status === ProcessingStatus.COMPLETED || f.status === ProcessingStatus.IDLE);
  };

  const downloadZip = async () => {
    const validFiles = getValidFiles();
    if (validFiles.length === 0) return;

    setIsProcessingDownload(true);
    setIsDropdownOpen(false);

    try {
      const zip = new JSZip();
      const imagesFolder = zip.folder("images");
      const fontsFolder = zip.folder("fonts");

      const addedAssets = new Set<string>();

      // Helper to add asset to correct folder
      const addAssetToZip = (filename: string, blob: Blob) => {
        if (addedAssets.has(filename)) return;
        
        if (isFontFile(filename)) {
            fontsFolder?.file(filename, blob);
        } else {
            imagesFolder?.file(filename, blob);
        }
        addedAssets.add(filename);
      };

      // 1. Add all globally preloaded assets
      preloadedAssets.forEach((blob, filename) => {
        addAssetToZip(filename, blob);
      });

      // 2. Add files and their specific assets
      validFiles.forEach(file => {
        if (file.processedContent) {
          // Apply Redaction Logic before zipping
          const redactedContent = svgProcessor.redact(file.processedContent);
          zip.file(file.originalFile.name, redactedContent);
        }

        // Add the assets specifically fetched for this file
        file.assets.forEach(asset => {
          addAssetToZip(asset.localFileName, asset.blob);
        });
      });

      const content = await zip.generateAsync({ type: "blob" });
      FileSaver.saveAs(content, "photo_book_tagged.zip");
    } catch (err) {
      console.error("Failed to generate zip", err);
      alert("Failed to create ZIP file.");
    } finally {
      setIsProcessingDownload(false);
    }
  };

  const downloadPdf = async () => {
    const validFiles = getValidFiles();
    if (validFiles.length === 0) return;

    setIsProcessingDownload(true);
    setIsDropdownOpen(false);

    try {
      await pdfGenerator.generate(validFiles, preloadedAssets);
    } catch (err) {
      console.error("Failed to generate PDF", err);
      alert("Failed to generate PDF.");
    } finally {
      setIsProcessingDownload(false);
    }
  };

  const hasFiles = files.length > 0;
  const readyToTag = hasFiles; 
  const unbundledCount = files.filter(f => f.status === ProcessingStatus.IDLE).length;

  return (
    <div className="min-h-screen p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-200">
              <Book className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">LivreMêlé Remêleur</h1>
              <p className="text-gray-500">Offline conversion and content tagging for multipage svgs</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
             {/* Tabs */}
            <div className="bg-white p-1 rounded-lg border border-gray-200 flex shadow-sm">
              <button
                onClick={() => setActiveTab('upload')}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-md flex items-center gap-2 transition-all",
                  activeTab === 'upload' 
                    ? "bg-blue-50 text-blue-700 shadow-sm" 
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <Upload className="w-4 h-4" />
                Upload
              </button>
              <button
                onClick={() => setActiveTab('reorder')}
                disabled={!readyToTag}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-md flex items-center gap-2 transition-all",
                  activeTab === 'reorder' 
                    ? "bg-blue-50 text-blue-700 shadow-sm" 
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                  !readyToTag && "opacity-50 cursor-not-allowed hover:bg-transparent"
                )}
              >
                <Layers className="w-4 h-4" />
                Reorder
              </button>
              <button
                onClick={() => setActiveTab('tag')}
                disabled={!readyToTag}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-md flex items-center gap-2 transition-all",
                  activeTab === 'tag' 
                    ? "bg-blue-50 text-blue-700 shadow-sm" 
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                  !readyToTag && "opacity-50 cursor-not-allowed hover:bg-transparent"
                )}
              >
                <Tag className="w-4 h-4" />
                Tag Content
              </button>
            </div>

            {hasFiles && (
              <div className="relative" ref={dropdownRef}>
                <div className="flex rounded-lg shadow-md hover:shadow-lg transition-shadow bg-blue-600 text-white">
                    <button
                        onClick={downloadZip}
                        disabled={isProcessingDownload}
                        className={cn(
                        "flex items-center gap-2 px-4 py-2.5 rounded-l-lg font-semibold transition-all active:bg-blue-800 border-r border-blue-500",
                        isProcessingDownload && "cursor-wait bg-blue-500"
                        )}
                    >
                        {isProcessingDownload ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Archive className="w-5 h-5" />}
                        Download
                    </button>
                    <button 
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        disabled={isProcessingDownload}
                        className="px-2 rounded-r-lg hover:bg-blue-700 transition-colors"
                    >
                        <ChevronDown className="w-4 h-4" />
                    </button>
                </div>

                {isDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-200">
                        <button 
                            onClick={downloadZip}
                            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                        >
                            <Archive className="w-4 h-4 text-blue-500" />
                            <div>
                                <p className="font-medium">Download ZIP</p>
                                <p className="text-xs text-gray-400">Tagged SVGs + Images</p>
                            </div>
                        </button>
                        <button 
                            onClick={downloadPdf}
                            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 border-t border-gray-100"
                        >
                            <FileText className="w-4 h-4 text-red-500" />
                            <div>
                                <p className="font-medium">Export PDF</p>
                                <p className="text-xs text-gray-400">Redactions Baked-in</p>
                            </div>
                        </button>
                    </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content Area */}
        {activeTab === 'upload' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Left Column: Upload */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Upload Content</h2>
                <Dropzone onFilesAdded={handleFilesAdded} disabled={isProcessingDownload} />
                
                <div className="mt-4 p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
                  <p className="font-medium mb-1">Workflow:</p>
                  <ol className="list-decimal list-inside space-y-1 opacity-80">
                    <li>Drop SVGs or Folder with SVGs+Images</li>
                    <li>(Optional) Click "Bundle Resources" to bundle external images</li>
                    <li>Reorder pages if needed</li>
                    <li>Tag content and Export</li>
                  </ol>
                </div>
              </div>

               {/* Bulk Actions */}
               {unbundledCount > 0 && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <h3 className="font-semibold text-gray-800 mb-2">Actions</h3>
                  <p className="text-sm text-gray-500 mb-4">You have {unbundledCount} files with unbundled resources.</p>
                  <button
                    onClick={handleBundleAll}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 font-medium rounded-lg hover:bg-blue-200 transition-colors"
                  >
                    <Globe className="w-4 h-4" />
                    Bundle All Resources
                  </button>
                </div>
               )}
            </div>

            {/* Right Column: List */}
            <div className="lg:col-span-2">
              {hasFiles ? (
                <FileList 
                  files={files} 
                  onRemove={removeFile} 
                  onBundle={(id) => {
                    const file = files.find(f => f.id === id);
                    if (file) bundleFile(file);
                  }}
                />
              ) : (
                 <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-gray-400 bg-white rounded-2xl border border-gray-200 border-dashed">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                      <Download className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="text-lg font-medium">No files in queue</p>
                    <p className="text-sm">Upload SVGs or directories to start</p>
                 </div>
              )}
            </div>
          </div>
        ) : activeTab === 'reorder' ? (
          <ReorderEditor files={files} onReorder={handleReorder} />
        ) : (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
             <TaggingEditor 
                files={files} // Pass all files, IDLE or COMPLETED
                initialIndex={0}
                availableTags={availableTags}
                onAddTag={handleAddTag}
                onUpdateFile={updateFileContent}
                onUpdateMultipleFiles={updateMultipleFiles}
                preloadedAssets={preloadedAssets}
             />
          </div>
        )}

      </div>
    </div>
  );
};

export default App;