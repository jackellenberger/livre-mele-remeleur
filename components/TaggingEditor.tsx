import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { ProcessedSVG } from '../types';
import { Tag, Plus, Check, ChevronLeft, ChevronRight, Type, Image as ImageIcon, Save, RotateCcw, Copy, Info } from 'lucide-react';
import { cn, getFilename } from '../utils/helpers';

interface TaggingEditorProps {
  files: ProcessedSVG[];
  initialIndex: number;
  availableTags: string[];
  onAddTag: (tag: string) => void;
  onUpdateFile: (id: string, content: string) => void;
  onUpdateMultipleFiles: (updates: { id: string, content: string }[]) => void;
  preloadedAssets: Map<string, Blob>;
}

interface OverlayItem {
  rect: DOMRect;
  tags: string[];
  type: 'image' | 'text';
}

const TaggingEditor: React.FC<TaggingEditorProps> = ({
  files,
  initialIndex,
  availableTags,
  onAddTag,
  onUpdateFile,
  onUpdateMultipleFiles,
  preloadedAssets
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [newTagInput, setNewTagInput] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const svgContentRef = useRef<HTMLDivElement>(null);
  const [currentSvgContent, setCurrentSvgContent] = useState<string>('');
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  
  // Visual Overlays State
  const [overlays, setOverlays] = useState<OverlayItem[]>([]);

  const currentFile = files[currentIndex];

  // Initialize content when switching files
  useEffect(() => {
    if (currentFile && currentFile.processedContent) {
      setCurrentSvgContent(currentFile.processedContent);
      setIsDirty(false);
    }
  }, [currentIndex, currentFile]);

  // Generate preview URLs
  useEffect(() => {
    const urls: Record<string, string> = {};
    
    // 1. Add global preloaded assets (supports directory upload use case)
    preloadedAssets.forEach((blob, filename) => {
        urls[filename] = URL.createObjectURL(blob);
    });

    // 2. Add specific file assets (overwrites global if duplicate)
    if (currentFile) {
      currentFile.assets.forEach(asset => {
        urls[asset.localFileName] = URL.createObjectURL(asset.blob);
      });
    }

    setPreviewUrls(urls);
    return () => {
      Object.values(urls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [currentFile?.id, currentFile?.assets, preloadedAssets]);

  // Calculate Overlays for Tagged Elements
  const updateOverlays = useCallback(() => {
    if (!svgContentRef.current || !svgContainerRef.current) return;

    const containerRect = svgContainerRef.current.getBoundingClientRect();
    const elements = svgContentRef.current.querySelectorAll('[data-tags]');
    const newOverlays: OverlayItem[] = [];

    elements.forEach(el => {
      const tags = el.getAttribute('data-tags');
      if (tags) {
        const rect = el.getBoundingClientRect();
        
        // Calculate relative position to container
        const relativeRect = new DOMRect(
          rect.left - containerRect.left,
          rect.top - containerRect.top,
          rect.width,
          rect.height
        );

        // Filter out elements that might be hidden or have 0 size
        if (relativeRect.width > 0 && relativeRect.height > 0) {
           newOverlays.push({
             rect: relativeRect,
             tags: tags.split(','),
             type: el.tagName.toLowerCase() === 'image' ? 'image' : 'text'
           });
        }
      }
    });

    setOverlays(newOverlays);
  }, []);

  // Use ResizeObserver to keep overlays in sync
  useEffect(() => {
    if (!svgContainerRef.current) return;
    
    const resizeObserver = new ResizeObserver(() => {
      updateOverlays();
    });
    
    resizeObserver.observe(svgContainerRef.current);
    
    return () => resizeObserver.disconnect();
  }, [updateOverlays]);

  // Helper to revert blob paths back to relative paths for saving
  const getCleanSvgContent = useCallback(() => {
    if (!svgContentRef.current) return null;

    const svgElement = svgContentRef.current.querySelector('svg');
    if (!svgElement) return null;

    const clone = svgElement.cloneNode(true) as SVGElement;
    
    const images = clone.querySelectorAll('image');
    images.forEach(img => {
       const href = img.getAttribute('href');
       if (href && href.startsWith('blob:')) {
          // Find which filename this blob url corresponds to
          const entry = Object.entries(previewUrls).find(([_, url]) => url === href);
          if (entry) img.setAttribute('href', `images/${entry[0]}`);
       }
       const xlink = img.getAttribute('xlink:href');
       if (xlink && xlink.startsWith('blob:')) {
          const entry = Object.entries(previewUrls).find(([_, url]) => url === xlink);
          if (entry) img.setAttribute('xlink:href', `images/${entry[0]}`);
       }
    });

    const serializer = new XMLSerializer();
    return serializer.serializeToString(clone);
  }, [previewUrls]);

  const handleSave = useCallback(() => {
    const content = getCleanSvgContent();
    if (content && currentFile) {
      onUpdateFile(currentFile.id, content);
      setIsDirty(false);
    }
  }, [currentFile, onUpdateFile, getCleanSvgContent]);

  // Hydrate DOM
  useLayoutEffect(() => {
    if (svgContentRef.current && currentSvgContent) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(currentSvgContent, 'image/svg+xml');
      
      const images = doc.querySelectorAll('image');
      images.forEach(img => {
        const href = img.getAttribute('href');
        const xlink = img.getAttribute('xlink:href');

        const tryResolve = (src: string | null) => {
             if (!src) return null;
             
             // 1. Exact match in keys (e.g. "foo.jpg")
             if (previewUrls[src]) return previewUrls[src];

             // 2. Resolve filename from path (e.g. "images/foo.jpg" -> "foo.jpg" or "http://.../foo.jpg" -> "foo.jpg")
             const filename = getFilename(src);
             if (previewUrls[filename]) return previewUrls[filename];
             
             return null;
        }

        const replacement = tryResolve(href) || tryResolve(xlink);
        
        if (replacement) {
             if (href) img.setAttribute('href', replacement);
             if (xlink) img.setAttribute('xlink:href', replacement);
        }
      });

      const serializer = new XMLSerializer();
      svgContentRef.current.innerHTML = serializer.serializeToString(doc.documentElement);
      
      // Update overlays after render
      setTimeout(updateOverlays, 0);
    }
  }, [currentSvgContent, previewUrls, updateOverlays]);

  const handleSvgClick = (e: React.MouseEvent) => {
    let target = e.target as Element;
    let tagName = target.tagName.toLowerCase();

    // If clicking a tspan, traverse up to text
    if (tagName === 'tspan') {
      const parentText = target.closest('text');
      if (parentText) {
        target = parentText;
        tagName = 'text';
      }
    }

    if (['image', 'text'].includes(tagName)) {
      e.stopPropagation();

      if (activeTags.size === 0) return;

      const currentTagsStr = target.getAttribute('data-tags') || '';
      const currentTags = new Set(currentTagsStr ? currentTagsStr.split(',') : []);
      
      // Toggle logic: If active tag exists, remove it. If not, add it.
      activeTags.forEach(tag => {
        if (currentTags.has(tag)) {
          currentTags.delete(tag);
        } else {
          currentTags.add(tag);
        }
      });

      const newTags = Array.from(currentTags).join(',');
      
      if (newTags) {
        target.setAttribute('data-tags', newTags);
      } else {
        target.removeAttribute('data-tags');
      }

      setIsDirty(true);
      updateOverlays();
    }
  };

  const toggleActiveTag = (tag: string) => {
    const newSet = new Set(activeTags);
    if (newSet.has(tag)) newSet.delete(tag);
    else newSet.add(tag);
    setActiveTags(newSet);
  };

  const handleCreateTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTagInput.trim()) {
      onAddTag(newTagInput.trim());
      const newSet = new Set(activeTags);
      newSet.add(newTagInput.trim());
      setActiveTags(newSet);
      setNewTagInput('');
    }
  };

  const applyTagsToElements = (root: Document | Element, tagName: string, tagsToAdd: Set<string>) => {
    // Use getElementsByTagName instead of querySelectorAll for better XML compatibility
    const elements = root.getElementsByTagName(tagName);
    let modified = false;

    Array.from(elements).forEach(el => {
       const currentTagsStr = el.getAttribute('data-tags') || '';
       const currentTags = new Set(currentTagsStr ? currentTagsStr.split(',') : []);
       
       tagsToAdd.forEach(tag => currentTags.add(tag));
       
       const newTags = Array.from(currentTags).join(',');
       if (newTags !== currentTagsStr) {
         el.setAttribute('data-tags', newTags);
         modified = true;
       }
    });
    return modified;
  };

  const applyToPage = (tagName: string) => {
    if (!svgContentRef.current || activeTags.size === 0) return;
    const modified = applyTagsToElements(svgContentRef.current, tagName, activeTags);

    if (modified) {
      setIsDirty(true);
      updateOverlays();
    }
  };

  const applyToBook = (tagName: string) => {
    if (activeTags.size === 0) return;
    if (!confirm(`Apply selected tags to ALL ${tagName.includes('image') ? 'images' : 'text'} in the book?`)) return;

    const updates: { id: string, content: string }[] = [];
    const parser = new DOMParser();
    const serializer = new XMLSerializer();

    // 1. Current Page
    // Use getCleanSvgContent to get the current state with relative paths
    let currentPageContent = getCleanSvgContent();
    if (currentPageContent) {
       const doc = parser.parseFromString(currentPageContent, 'image/svg+xml');
       if (applyTagsToElements(doc, tagName, activeTags)) {
         currentPageContent = serializer.serializeToString(doc);
       }
       updates.push({ id: currentFile.id, content: currentPageContent });
    }

    // 2. Other Files
    files.forEach(file => {
      if (file.id === currentFile.id) return;

      if (file.processedContent) {
        const doc = parser.parseFromString(file.processedContent, 'image/svg+xml');
        if (applyTagsToElements(doc, tagName, activeTags)) {
          updates.push({
            id: file.id,
            content: serializer.serializeToString(doc)
          });
        }
      }
    });

    if (updates.length > 0) {
      onUpdateMultipleFiles(updates);
      setIsDirty(false); 
    }
  };

  const clearAllTags = () => {
    if (!svgContentRef.current) return;
    if (confirm("Remove ALL tags from this page?")) {
        const elements = svgContentRef.current.querySelectorAll('[data-tags]');
        elements.forEach(el => el.removeAttribute('data-tags'));
        setIsDirty(true);
        updateOverlays();
    }
  };

  useEffect(() => {
    return () => {
      if (isDirty) handleSave();
    };
  }, [currentIndex, handleSave, isDirty]);

  const handleNext = () => {
    if (isDirty) handleSave();
    if (currentIndex < files.length - 1) setCurrentIndex(prev => prev + 1);
  };

  const handlePrev = () => {
    if (isDirty) handleSave();
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  };

  if (!currentFile) return <div className="p-8 text-center text-gray-500">No file selected</div>;

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)] min-h-[600px]">
      
      {/* Canvas Area */}
      <div className="flex-1 flex flex-col bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden shadow-inner relative">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 z-10 shadow-sm">
           <div className="flex items-center gap-3">
             <div className="p-1.5 bg-blue-50 rounded text-blue-600">
               <ImageIcon className="w-4 h-4" />
             </div>
             <span className="text-sm font-semibold text-gray-800">
               {currentFile.originalFile.name}
             </span>
             {isDirty && (
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Unsaved
                </span>
             )}
           </div>
           
           <div className="text-xs text-gray-400 font-medium">
             Page {currentIndex + 1} of {files.length}
           </div>
        </div>

        {/* SVG Container & Overlay */}
        <div className="flex-1 overflow-auto p-8 flex items-center justify-center bg-slate-100 relative">
          <div className="svg-editor-container bg-white shadow-sm" ref={svgContainerRef}>
            {/* The Actual SVG Content */}
            <div 
              ref={svgContentRef}
              onClick={handleSvgClick}
              className="interactive-mode w-full h-full"
            />
            
            {/* Visual Overlay Layer (Pills & Scrims) */}
            {overlays.map((overlay, idx) => (
              <div
                key={idx}
                className="absolute pointer-events-none flex items-center justify-center animate-in fade-in duration-200"
                style={{
                  top: overlay.rect.top,
                  left: overlay.rect.left,
                  width: overlay.rect.width,
                  height: overlay.rect.height,
                  zIndex: 20
                }}
              >
                {/* Scrim */}
                <div className="absolute inset-0 bg-blue-600/10 border border-blue-400/30" />
                
                {/* Pill */}
                <div className="relative z-30 bg-white/95 backdrop-blur-md text-blue-700 border border-blue-100 text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm flex items-center gap-1.5 max-w-[140px] hover:scale-105 transition-transform">
                  <Tag className="w-3 h-3 flex-shrink-0 text-blue-500" />
                  <span className="truncate">
                    {overlay.tags.length > 2 
                      ? `${overlay.tags.length} tags` 
                      : overlay.tags.join(', ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Pagination Footer */}
        <div className="flex items-center justify-between p-4 bg-white border-t border-gray-200 z-10">
           <button 
             onClick={handlePrev} 
             disabled={currentIndex === 0} 
             className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
           >
             <ChevronLeft className="w-4 h-4" />
             Previous Page
           </button>

           <div className="text-xs text-gray-400">
             Click items to tag/untag
           </div>

           <button 
             onClick={handleNext} 
             disabled={currentIndex === files.length - 1} 
             className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
           >
             Next Page
             <ChevronRight className="w-4 h-4" />
           </button>
        </div>
      </div>

      {/* Sidebar Controls */}
      <div className="w-full lg:w-80 flex flex-col gap-4">
        
        {/* Active Tags Pool */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col flex-1">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-800">Tag Selection</h3>
          </div>

          <form onSubmit={handleCreateTag} className="flex gap-2 mb-4">
            <input
              type="text"
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              placeholder="New tag name..."
              className="flex-1 px-3 py-2 text-sm bg-white text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button 
              type="submit"
              disabled={!newTagInput.trim()}
              className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>

          <div className="flex-1 overflow-y-auto mb-4 min-h-[100px] max-h-[30vh]">
             <div className="flex flex-wrap gap-2">
                {availableTags.length === 0 && (
                  <p className="text-sm text-gray-400 italic w-full text-center py-4">Create tags to start</p>
                )}
                {availableTags.map(tag => {
                  const isActive = activeTags.has(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleActiveTag(tag)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-1.5",
                        isActive 
                          ? "bg-blue-100 text-blue-700 ring-2 ring-blue-500 ring-offset-1" 
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      )}
                    >
                      {tag}
                      {isActive && <Check className="w-3 h-3" />}
                    </button>
                  );
                })}
             </div>
          </div>
          
          <div className="space-y-2 pt-4 border-t border-gray-100">
             <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Apply To Page:</p>
             <button
               onClick={() => applyToPage('image')}
               disabled={activeTags.size === 0}
               className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors disabled:opacity-50"
             >
               <ImageIcon className="w-4 h-4" />
               Tag All Images
             </button>
             <button
               onClick={() => applyToPage('text')}
               disabled={activeTags.size === 0}
               className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors disabled:opacity-50"
             >
               <Type className="w-4 h-4" />
               Tag All Text
             </button>
          </div>

          <div className="space-y-2 pt-4 border-t border-gray-100">
             <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Apply To Book:</p>
             <button
               onClick={() => applyToBook('image')}
               disabled={activeTags.size === 0}
               className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg transition-colors disabled:opacity-50"
             >
               <Copy className="w-4 h-4" />
               All Images in Book
             </button>
             <button
               onClick={() => applyToBook('text')}
               disabled={activeTags.size === 0}
               className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg transition-colors disabled:opacity-50"
             >
               <Copy className="w-4 h-4" />
               All Text in Book
             </button>
          </div>

           <div className="space-y-2 pt-4 mt-auto border-t border-gray-100">
             <button
               onClick={clearAllTags}
               className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
             >
               <RotateCcw className="w-4 h-4" />
               Clear Tags on Page
             </button>
             
             {isDirty && (
                <button
                onClick={handleSave}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm transition-colors"
                >
                <Save className="w-4 h-4" />
                Save Changes
                </button>
             )}
          </div>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-800 space-y-2">
            <h4 className="font-semibold flex items-center gap-2">
               <Info className="w-4 h-4" />
               Technical Detail
            </h4>
            <p className="opacity-80 leading-relaxed">
               Tags are injected directly into the SVG code as <code className="bg-white/50 px-1 py-0.5 rounded text-blue-900 border border-blue-200 font-mono">data-tags</code> attributes (comma-separated). This ensures compatibility with other XML/SVG parsers.
            </p>
       </div>

      </div>
    </div>
  );
};

export default TaggingEditor;