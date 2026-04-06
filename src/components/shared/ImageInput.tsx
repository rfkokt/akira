import { useState, useRef, useCallback } from 'react';
import { X, Upload, Image as ImageIcon, Loader2 } from 'lucide-react';

export interface ImageAttachment {
  id: string;
  file: File;
  preview: string;
  base64: string;
}

interface ImageInputProps {
  images: ImageAttachment[];
  onImagesChange: (images: ImageAttachment[]) => void;
  maxImages?: number;
  disabled?: boolean;
}

export function ImageInput({ 
  images, 
  onImagesChange, 
  maxImages = 5, 
  disabled = false 
}: ImageInputProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<ImageAttachment[]>(images);
  
  imagesRef.current = images;

  const processFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(file => {
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      return validTypes.includes(file.type);
    });

    if (validFiles.length === 0) return false;

    const remainingSlots = maxImages - imagesRef.current.length;
    const filesToProcess = validFiles.slice(0, remainingSlots);

    filesToProcess.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        const newImage: ImageAttachment = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file,
          preview: base64,
          base64,
        };
        const updatedImages = [...imagesRef.current, newImage];
        console.log('[ImageInput] Adding image, new count:', updatedImages.length);
        onImagesChange(updatedImages);
      };
      reader.onerror = () => {
        console.error('[ImageInput] FileReader error');
      };
      reader.readAsDataURL(file);
    });

    return filesToProcess.length > 0;
  }, [maxImages, onImagesChange]);

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;
    processFiles(files);
  }, [processFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    processFiles(e.dataTransfer.files);
  }, [disabled, processFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleRemoveImage = useCallback((id: string) => {
    onImagesChange(images.filter(img => img.id !== id));
  }, [images, onImagesChange]);

  const handleClick = useCallback(() => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled]);

  if (images.length === 0) {
    return (
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all
          ${disabled 
            ? 'opacity-50 cursor-not-allowed bg-app-bg/30' 
            : 'hover:bg-app-accent/10 bg-app-bg/50'
          }
          ${isDragging ? 'bg-app-accent/20 border-app-accent' : 'border border-transparent'}
        `}
      >
        <ImageIcon className={`w-3.5 h-3.5 ${disabled ? 'text-neutral-600' : 'text-neutral-400'}`} />
        <span className={`text-xs font-medium ${disabled ? 'text-neutral-600' : 'text-neutral-300'}`}>
          Add image
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {images.map((image) => (
          <div
            key={image.id}
            className="relative group rounded-lg overflow-hidden border border-app-border"
          >
            <img
              src={image.preview}
              alt="Attached"
              className="w-16 h-16 object-cover"
            />
            <button
              onClick={() => handleRemoveImage(image.id)}
              disabled={disabled}
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500/80 
                        flex items-center justify-center opacity-0 group-hover:opacity-100 
                        transition-opacity hover:bg-red-500 disabled:opacity-50"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}
      </div>
      
      {images.length < maxImages && !disabled && (
        <button
          onClick={handleClick}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-all text-neutral-400 hover:text-neutral-300 hover:bg-white/5"
        >
          <Upload className="w-3 h-3" />
          <span>Add more ({maxImages - images.length} remaining)</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
            disabled={disabled}
          />
        </button>
      )}
    </div>
  );
}

export function processPastedImages(
  event: ClipboardEvent,
  images: ImageAttachment[],
  onImagesChange: (images: ImageAttachment[] | ((prev: ImageAttachment[]) => ImageAttachment[])) => void,
  maxImages: number = 5
): boolean {
  const items = event.clipboardData?.items;
  console.log('[processPastedImages] Clipboard items:', items?.length);
  if (!items) return false;

  const files: File[] = [];
  const seenFiles = new Set<string>(); // Track unique files by name+size
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    // Handle image data copied to clipboard
    if (item.type.indexOf('image') !== -1) {
      const file = item.getAsFile();
      if (file) {
        const fileKey = `${file.name}-${file.size}`;
        if (!seenFiles.has(fileKey)) {
          console.log('[processPastedImages] Found image data:', item.type);
          seenFiles.add(fileKey);
          files.push(file);
        }
      }
    }
    // Handle file items (e.g., from Finder/Explorer) - only if not already added as image data
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        const fileKey = `${file.name}-${file.size}`;
        if (!seenFiles.has(fileKey)) {
          // Check if it's an image file by extension
          const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
          const fileName = file.name.toLowerCase();
          const isImageFile = validExtensions.some(ext => fileName.endsWith(ext));
          const isImageType = file.type && file.type.indexOf('image') !== -1;
          if (isImageFile || isImageType) {
            console.log('[processPastedImages] Found image file:', file.name, file.type);
            seenFiles.add(fileKey);
            files.push(file);
          }
        }
      }
    }
  }

  console.log('[processPastedImages] Files to process:', files.length);
  if (files.length === 0) return false;

  const remainingSlots = maxImages - images.length;
  const filesToProcess = files.slice(0, remainingSlots);
  
  let completedCount = 0;
  const newImages: ImageAttachment[] = [];

  filesToProcess.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      newImages[index] = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        preview: base64,
        base64,
      };
      completedCount++;
      console.log('[processPastedImages] File processed:', completedCount, '/', filesToProcess.length);
      
      if (completedCount === filesToProcess.length) {
        console.log('[processPastedImages] All files processed, updating state with', newImages.filter(Boolean).length, 'images');
        onImagesChange(prev => [...prev, ...newImages.filter(Boolean)]);
      }
    };
    reader.onerror = () => {
      console.error('[processPastedImages] FileReader error');
    };
    reader.readAsDataURL(file);
  });

  return filesToProcess.length > 0;
}

interface ImagePreviewProps {
  image: ImageAttachment;
  onRemove?: () => void;
}

export function ImagePreview({ image, onRemove }: ImagePreviewProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="relative inline-block rounded-lg overflow-hidden border border-app-border bg-app-bg">
      <img
        src={image.preview}
        alt="Preview"
        className="max-w-xs max-h-48 object-contain"
        onLoad={() => setIsLoaded(true)}
      />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-app-accent" />
        </div>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500/80 
                    flex items-center justify-center hover:bg-red-500 transition-colors"
        >
          <X className="w-3 h-3 text-white" />
        </button>
      )}
    </div>
  );
}