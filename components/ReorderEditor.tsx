import React, { useState, useRef } from 'react';
import { ProcessedSVG } from '../types';
import { GripVertical, ChevronRight, ChevronDown, ArrowUpDown, CheckSquare, Square } from 'lucide-react';
import { cn } from '../utils/helpers';

interface ReorderEditorProps {
  files: ProcessedSVG[];
  onReorder: (files: ProcessedSVG[]) => void;
}

const ReorderEditor: React.FC<ReorderEditorProps> = ({ files, onReorder }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragItemRef = useRef<number | null>(null);

  // Selection Logic
  const handleSelect = (e: React.MouseEvent, id: string, index: number) => {
    // If clicking the drag handle or expand button, don't trigger selection logic unless needed
    if ((e.target as HTMLElement).closest('.no-select')) return;

    const newSelected = new Set(selectedIds);
    
    if (e.ctrlKey || e.metaKey) {
      if (newSelected.has(id)) newSelected.delete(id);
      else newSelected.add(id);
    } else if (e.shiftKey && selectedIds.size > 0) {
      // Range selection
      const allIds = files.map(f => f.id);
      const lastIndex = allIds.indexOf(Array.from(selectedIds).pop()!);
      const start = Math.min(lastIndex, index);
      const end = Math.max(lastIndex, index);
      
      for (let i = start; i <= end; i++) {
        newSelected.add(allIds[i]);
      }
    } else {
      // Simple click - unless dragging (handled elsewhere) or specific toggle
      // If simply clicking a row that is not selected, select only it
      // If clicking a row that IS selected, keep it selected (prep for drag) unless it's a simple click-up
      if (!newSelected.has(id)) {
        newSelected.clear();
        newSelected.add(id);
      }
    }
    
    setSelectedIds(newSelected);
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  }

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedIds(newExpanded);
  };

  const handleSort = () => {
    const sorted = [...files].sort((a, b) => {
      return a.originalFile.name.localeCompare(b.originalFile.name, undefined, { numeric: true, sensitivity: 'base' });
    });
    onReorder(sorted);
  };

  // Drag & Drop
  const handleDragStart = (e: React.DragEvent, index: number) => {
    const file = files[index];
    
    // If dragging an unselected item, select it exclusively
    if (!selectedIds.has(file.id)) {
      setSelectedIds(new Set([file.id]));
    }
    
    dragItemRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    // Set a transparent image or similar if needed, but default ghost is usually fine
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (dragItemRef.current === null) return;

    const itemsToMoveIds = selectedIds.size > 0 
      ? selectedIds 
      : new Set([files[dragItemRef.current].id]);

    const itemsToMove = files.filter(f => itemsToMoveIds.has(f.id));
    const remainingFiles = files.filter(f => !itemsToMoveIds.has(f.id));

    // Calculate insertion index
    // Note: dropIndex is based on the current list.
    // We need to adjust if we are dropping 'after' or 'before' conceptually
    // But simple insertion into the remaining array is easier.
    
    // Find the item currently at dropIndex to determine where to insert relative to remaining
    // This is tricky because indices shift.
    // Strategy: Determine the ID of the target drop item
    const targetId = files[dropIndex].id;
    
    // If target is part of moving group, do nothing
    if (itemsToMoveIds.has(targetId)) return;

    const targetIndexInRemaining = remainingFiles.findIndex(f => f.id === targetId);
    
    // Insert before the target
    const insertionIndex = targetIndexInRemaining === -1 ? remainingFiles.length : targetIndexInRemaining;

    // However, if we drop strictly "on" an item, user expects it to be around there. 
    // Let's assume insert BEFORE by default.
    // If dragging downwards, user often expects insert AFTER.
    // For simplicity: Insert at the specific index calculated.
    
    const newOrder = [...remainingFiles];
    newOrder.splice(insertionIndex, 0, ...itemsToMove);

    onReorder(newOrder);
    dragItemRef.current = null;
  };

  return (
    <div className="flex flex-col gap-4 pb-10 max-w-4xl mx-auto animate-in fade-in slide-in-from-right-4 duration-500">
      
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              if (selectedIds.size === files.length) setSelectedIds(new Set());
              else setSelectedIds(new Set(files.map(f => f.id)));
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            {selectedIds.size === files.length ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
            Select All
          </button>
          <span className="text-sm text-gray-400 border-l border-gray-200 pl-2">
            {selectedIds.size} selected
          </span>
        </div>

        <button 
          onClick={handleSort}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
        >
          <ArrowUpDown className="w-4 h-4" />
          Smart Sort (A-Z)
        </button>
      </div>

      {/* List */}
      <ul className="space-y-1">
        {files.map((file, index) => {
          const isSelected = selectedIds.has(file.id);
          const isExpanded = expandedIds.has(file.id);
          const isDragTarget = dragOverIndex === index;

          return (
            <li
              key={file.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onClick={(e) => handleSelect(e, file.id, index)}
              className={cn(
                "group relative bg-white border rounded-lg transition-all duration-200 select-none",
                isSelected ? "border-blue-400 bg-blue-50/30 z-10 ring-1 ring-blue-200" : "border-gray-200 hover:border-gray-300",
                isDragTarget && "border-t-4 border-t-blue-500 mt-1" // Visual indicator for drop target
              )}
            >
              <div className="flex items-center p-3 gap-3">
                {/* Drag Handle */}
                <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1">
                  <GripVertical className="w-5 h-5" />
                </div>

                {/* Checkbox */}
                <button 
                   onClick={(e) => { e.stopPropagation(); toggleSelect(file.id); }}
                   className="no-select text-gray-400 hover:text-blue-600"
                >
                   {isSelected ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                </button>

                {/* File Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                   <span className="font-medium text-gray-900 truncate">{file.originalFile.name}</span>
                   <span className="text-xs text-gray-500">Page {index + 1}</span>
                </div>

                {/* Expand Toggle */}
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleExpand(file.id); }}
                  className="no-select p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>

              {/* Preview Content */}
              {isExpanded && (
                <div className="border-t border-gray-100 bg-gray-50 p-4 animate-in slide-in-from-top-2 duration-200">
                  <div className="bg-white border border-gray-200 shadow-sm rounded max-w-md mx-auto aspect-[3/4] flex items-center justify-center overflow-hidden">
                     {file.processedContent ? (
                        <div dangerouslySetInnerHTML={{ __html: file.processedContent }} className="w-full h-full scale-75 origin-center" />
                     ) : (
                        <span className="text-gray-300 font-bold">Preview Unavailable</span>
                     )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      
      <div className="text-center text-xs text-gray-400 mt-4">
        Hold Shift to select range • Hold Ctrl/Cmd to toggle multiple • Drag to reorder
      </div>
    </div>
  );
};
export default ReorderEditor;
