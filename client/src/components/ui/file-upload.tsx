
import React, { useRef, useState } from 'react';
import { Button } from './button';
import { Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onFileRemove?: () => void;
  accept?: string;
  maxSize?: number; // in bytes
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
  preview?: string;
}

export function FileUpload({
  onFileSelect,
  onFileRemove,
  accept = "image/*",
  maxSize = 2 * 1024 * 1024, // 2MB default
  disabled = false,
  className,
  children,
  preview
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string>('');

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (disabled) return;

    const files = e.dataTransfer.files;
    handleFiles(files);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const files = e.target.files;
    if (files) {
      handleFiles(files);
    }
  };

  const handleFiles = (files: FileList) => {
    setError('');
    
    if (files.length === 0) return;
    
    const file = files[0];
    
    // Check file size
    if (file.size > maxSize) {
      setError(`File size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`);
      return;
    }
    
    // Check file type
    const acceptTypes = accept.split(',').map(type => type.trim());
    const isValidType = acceptTypes.some(type => {
      if (type.includes('*')) {
        const baseType = type.split('/')[0];
        return file.type.startsWith(baseType);
      }
      return file.type === type;
    });
    
    if (!isValidType) {
      setError('Invalid file type');
      return;
    }
    
    onFileSelect(file);
  };

  return (
    <div className={cn("relative", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
      />
      
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
          dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        {preview ? (
          <div className="relative">
            <img src={preview} alt="Preview" className="max-h-32 mx-auto rounded" />
            {onFileRemove && (
              <Button
                size="sm"
                variant="destructive"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onFileRemove();
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        ) : (
          children || (
            <div className="space-y-2">
              <Upload className="mx-auto h-8 w-8 text-gray-400" />
              <div className="text-sm text-gray-600">
                <span className="font-medium text-blue-600 hover:text-blue-500">
                  Click to upload
                </span>
                {" or drag and drop"}
              </div>
              <p className="text-xs text-gray-500">
                {accept.includes('image') ? 'PNG, JPG, WebP' : 'Files'} up to {Math.round(maxSize / 1024 / 1024)}MB
              </p>
            </div>
          )
        )}
      </div>
      
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
