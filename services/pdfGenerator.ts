import { jsPDF } from 'jspdf';
import { ProcessedSVG } from '../types';
import { svgProcessor } from './svgProcessor';
import { getFilename, isFontFile } from '../utils/helpers';

export class PdfGenerator {
  async generate(files: ProcessedSVG[], preloadedAssets: Map<string, Blob>): Promise<void> {
    let doc: jsPDF | null = null;
    const pdfWidth = 210; 
    const pixelScale = 12;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (file.processedContent) {
        try {
            // 1. Redact
            const redactedContent = svgProcessor.redact(file.processedContent);
            
            // 2. Embed Images & Fonts for Rasterization
            const embeddedSvg = await this.embedAssets(redactedContent, file, preloadedAssets);

            // 3. Get Dimensions
            const { width: svgW, height: svgH } = this.getSvgDimensions(embeddedSvg);
            const aspectRatio = svgW / svgH;

            // 4. Page Config
            const pdfHeight = pdfWidth / aspectRatio;
            const orientation = pdfWidth > pdfHeight ? 'l' : 'p';

            // Initialize or Add Page
            if (!doc) {
              doc = new jsPDF({
                orientation,
                unit: 'mm',
                format: [pdfWidth, pdfHeight]
              });
            } else {
              doc.addPage([pdfWidth, pdfHeight], orientation);
            }

            // 5. Rasterize
            const pixelW = pdfWidth * pixelScale;
            const pixelH = pdfHeight * pixelScale;
            
            const dataUrl = await this.svgToDataUrl(embeddedSvg, pixelW, pixelH); 

            // 6. Add to PDF
            doc.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);

            // --- INSIDE COVER LOGIC ---
            // If this is the first page (Cover), and we have more pages, insert a blank "Inside Cover"
            if (i === 0 && files.length > 1) {
                // Get the next file to determine the background color for the inside cover
                const nextFile = files[1];
                let bgColor = '#FFFFFF';
                if (nextFile && nextFile.processedContent) {
                    bgColor = this.detectBackgroundColor(nextFile.processedContent) || '#FFFFFF';
                }

                doc.addPage([pdfWidth, pdfHeight], orientation);
                
                // If distinct color, fill it
                if (bgColor.toLowerCase() !== '#ffffff' && bgColor.toLowerCase() !== 'white') {
                    doc.setFillColor(bgColor);
                    doc.rect(0, 0, pdfWidth, pdfHeight, 'F');
                }
            }
            
        } catch (err) {
            console.error(`Failed to process page ${i + 1}`, err);
            if (!doc) {
                doc = new jsPDF();
            } else {
                doc.addPage();
            }
            doc.text(`Error processing page: ${file.originalFile.name}`, 10, 10);
        }
      }
    }

    if (doc) {
        doc.save('photo_book.pdf');
    }
  }

  private detectBackgroundColor(svgContent: string): string | null {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgContent, 'image/svg+xml');
        const svg = doc.querySelector('svg');
        if (!svg) return null;

        // 1. Check style on SVG element
        if (svg.style.backgroundColor) return svg.style.backgroundColor;
        
        // 2. Check for a full-size rect that looks like a background
        // We look for the first rect that matches width/height 100% or equal to viewBox
        const width = svg.getAttribute('width');
        const height = svg.getAttribute('height');
        
        const rects = Array.from(doc.getElementsByTagName('rect'));
        for (const rect of rects) {
            const rW = rect.getAttribute('width');
            const rH = rect.getAttribute('height');
            
            // Heuristic: If rect matches SVG dimensions or is 100%
            if ((rW === '100%' && rH === '100%') || (rW === width && rH === height)) {
                return rect.getAttribute('fill');
            }
        }
    } catch (e) {
        return null;
    }
    return null;
  }

  private getSvgDimensions(svgContent: string): { width: number, height: number } {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svg = doc.querySelector('svg');

    if (!svg) return { width: 100, height: 100 }; 

    const widthAttr = svg.getAttribute('width');
    const heightAttr = svg.getAttribute('height');
    const viewBoxAttr = svg.getAttribute('viewBox');

    let w = 0;
    let h = 0;

    if (viewBoxAttr) {
        const parts = viewBoxAttr.split(/[\s,]+/).map(parseFloat);
        if (parts.length === 4) {
            w = parts[2];
            h = parts[3];
        }
    }

    if ((!w || !h) && widthAttr && heightAttr) {
        w = parseFloat(widthAttr) || 0;
        h = parseFloat(heightAttr) || 0;
    }

    if (!w || !h) return { width: 210, height: 297 };

    return { width: w, height: h };
  }

  private async embedAssets(svgContent: string, file: ProcessedSVG, preloadedAssets: Map<string, Blob>): Promise<string> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    
    if (doc.getElementsByTagName('parsererror').length > 0) {
        console.error("XML parse error in embedAssets");
        return svgContent;
    }

    // Helper to find blob
    const findBlob = (path: string): Blob | undefined => {
        const name = getFilename(path);
        const localAsset = file.assets.find(a => a.localFileName === name);
        if (localAsset) return localAsset.blob;
        return preloadedAssets.get(name);
    }

    // 1. Embed Images
    const images = Array.from(doc.getElementsByTagName('image'));
    for (const img of images) {
      const href = img.getAttribute('href') || img.getAttribute('xlink:href');
      if (!href) continue;

      const blob = findBlob(href);
      if (blob) {
        const base64 = await this.blobToBase64(blob);
        img.setAttribute('href', base64);
        if (img.hasAttribute('xlink:href')) img.removeAttribute('xlink:href');
      }
    }

    // 2. Embed Fonts (scan Styles)
    const styles = Array.from(doc.getElementsByTagName('style'));
    for (const style of styles) {
      let css = style.textContent || '';
      const urlRegex = /url\s*\((?:'|")?([^'")]+)(?:'|")?\)/g;
      const matches = [...css.matchAll(urlRegex)];

      for (const match of matches) {
        const url = match[1];
        if (isFontFile(url)) {
            const blob = findBlob(url);
            if (blob) {
                // Get raw base64 data
                const rawDataUri = await this.blobToBase64(blob);
                const base64Content = rawDataUri.split(',')[1];
                
                // Construct proper MIME type for the font to ensure Canvas/PDF acceptance
                let mime = 'application/octet-stream';
                const lowerUrl = url.toLowerCase();
                
                if (lowerUrl.endsWith('.woff2')) mime = 'font/woff2';
                else if (lowerUrl.endsWith('.woff')) mime = 'font/woff';
                else if (lowerUrl.endsWith('.ttf')) mime = 'font/ttf'; 
                else if (lowerUrl.endsWith('.otf')) mime = 'application/font-sfnt'; // Standard MIME for OTF
                else if (lowerUrl.endsWith('.eot')) mime = 'application/vnd.ms-fontobject';
                
                const correctDataUri = `data:${mime};base64,${base64Content}`;
                
                // Replace the URL with the robust Data URI
                css = css.replace(url, correctDataUri);
            }
        }
      }
      style.textContent = css;
    }

    return new XMLSerializer().serializeToString(doc);
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }

  private svgToDataUrl(svgString: string, width: number, height: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        // Delay removed for performance
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject('No ctx'); return; }
        
        // Fill background white to avoid transparent PDF issues
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.drawImage(img, 0, 0, width, height);
        
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 1.0));
      };
      
      img.onerror = (e) => {
        console.error("Image load failed", e);
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#f0f0f0';
          ctx.fillRect(0,0,width,height);
        }
        resolve(canvas.toDataURL('image/jpeg'));
      };
      
      img.src = url;
    });
  }
}

export const pdfGenerator = new PdfGenerator();