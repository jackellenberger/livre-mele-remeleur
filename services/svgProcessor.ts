import { LocalAsset } from '../types';
import { getFilename, isFontFile } from '../utils/helpers';

export class SvgProcessor {
  private parser: DOMParser;
  private serializer: XMLSerializer;

  constructor() {
    this.parser = new DOMParser();
    this.serializer = new XMLSerializer();
  }

  /**
   * Parse the SVG file to get initial content.
   */
  async parse(file: File): Promise<string> {
    return await file.text();
  }

  /**
   * Bundle Resources for the SVG: Find images and fonts, check preloaded assets, or fetch from URL.
   */
  async bundleResources(
    svgContent: string,
    preloadedAssets: Map<string, Blob>,
    onProgress: (percent: number) => void
  ): Promise<{ content: string; assets: LocalAsset[]; errors: string[] }> {
    const doc = this.parser.parseFromString(svgContent, 'image/svg+xml');
    
    const parserError = doc.getElementsByTagName('parsererror')[0];
    if (parserError) {
      throw new Error('Invalid SVG file format');
    }

    const assets: LocalAsset[] = [];
    const errors: string[] = [];
    const urlToFilenameMap = new Map<string, string>();

    // 1. Identify all resources to process
    const imageElements = Array.from(doc.getElementsByTagName('image'));
    const styleElements = Array.from(doc.getElementsByTagName('style'));

    // Extract URLs from styles
    const fontReplacements: { style: HTMLStyleElement, matches: { url: string, matchStr: string }[] }[] = [];
    let totalItems = imageElements.length;

    // Scan styles for URLs
    for (const style of styleElements) {
       const css = style.textContent || '';
       const urlRegex = /url\s*\((?:'|")?([^'")]+)(?:'|")?\)/g;
       const matches = [...css.matchAll(urlRegex)];
       if (matches.length > 0) {
         fontReplacements.push({
           style,
           matches: matches.map(m => ({ url: m[1], matchStr: m[0] }))
         });
         totalItems += matches.length;
       }
    }

    let processedCount = 0;
    const updateProgress = () => {
      processedCount++;
      if (totalItems > 0) onProgress(Math.floor((processedCount / totalItems) * 100));
    };

    // Helper to process a single asset URL
    const processAsset = async (href: string, isFont: boolean): Promise<string | null> => {
      if (!href || href.startsWith('data:') || href.startsWith('#')) return null;

      try {
        let localName = urlToFilenameMap.get(href);
        
        if (!localName) {
           const targetFilename = getFilename(href);
           let blob: Blob | null = null;

           // Check preloaded (local upload)
           if (preloadedAssets.has(targetFilename)) {
             blob = preloadedAssets.get(targetFilename)!;
             localName = targetFilename;
           }
           // Fetch remote
           else if (href.startsWith('http')) {
             const response = await fetch(href);
             if (!response.ok) throw new Error(`Failed to fetch ${href}`);
             blob = await response.blob();
             
             // If we don't have a good local name yet, generate one
             if (!localName) {
                const contentType = response.headers.get('content-type') || '';
                // Fallback extension logic
                let ext = targetFilename.split('.').pop() || 'bin';
                if (isFont && !isFontFile(targetFilename)) {
                   if (contentType.includes('woff2')) ext = 'woff2';
                   else if (contentType.includes('woff')) ext = 'woff';
                   else if (contentType.includes('ttf')) ext = 'ttf';
                }
                const hash = Math.random().toString(36).substring(2, 8);
                localName = `asset_${hash}.${ext}`;
             }
           }
           else {
             // Relative path but not found locally
             return null;
           }

           if (blob) {
              assets.push({ originalUrl: href, localFileName: localName!, blob });
              urlToFilenameMap.set(href, localName!);
           }
        }
        return localName || null;
      } catch (e: any) {
        errors.push(`Failed to load ${href}: ${e.message}`);
        return null;
      }
    };

    // 2. Process Images
    for (const img of imageElements) {
      const href = img.getAttribute('href') || img.getAttribute('xlink:href');
      if (href) {
        const localName = await processAsset(href, false);
        if (localName) {
          const relativePath = `images/${localName}`;
          img.setAttribute('href', relativePath);
          if (img.hasAttribute('xlink:href')) img.setAttribute('xlink:href', relativePath);
        }
      }
      updateProgress();
    }

    // 3. Process Fonts/Styles
    for (const item of fontReplacements) {
       let css = item.style.textContent || '';
       for (const { url, matchStr } of item.matches) {
          if (isFontFile(url)) {
             const localName = await processAsset(url, true);
             if (localName) {
               // Global replace might be risky if same URL matches multiple times but logic holds
               // We replace the specific url string instance if possible, but replaceAll is safer for CSS text
               css = css.replace(url, `fonts/${localName}`); 
             }
          }
          updateProgress();
       }
       item.style.textContent = css;
    }

    return {
      content: this.serializer.serializeToString(doc),
      assets,
      errors
    };
  }

  private shouldRedact(element: Element): boolean {
    const tags = element.getAttribute('data-tags');
    if (!tags) return false;
    return tags.toLowerCase().includes('redact');
  }

  redact(svgContent: string): string {
    const doc = this.parser.parseFromString(svgContent, 'image/svg+xml');
    const FILTER_ID = 'redact-blur';

    // 1. Redact Images
    const images = Array.from(doc.getElementsByTagName('image'));
    const imagesToRedact = images.filter(img => this.shouldRedact(img));

    if (imagesToRedact.length > 0) {
      let defs = doc.getElementsByTagName('defs')[0];
      if (!defs) {
        defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
        doc.documentElement.insertBefore(defs, doc.documentElement.firstChild);
      }

      if (!doc.getElementById(FILTER_ID)) {
        const filter = doc.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.setAttribute('id', FILTER_ID);
        filter.setAttribute('x', '-50%');
        filter.setAttribute('y', '-50%');
        filter.setAttribute('width', '200%');
        filter.setAttribute('height', '200%');
        
        const feGaussianBlur = doc.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
        // Increased from 15 to 150 for stronger blur
        feGaussianBlur.setAttribute('stdDeviation', '150');
        
        filter.appendChild(feGaussianBlur);
        defs.appendChild(filter);
      }

      imagesToRedact.forEach(img => {
        img.setAttribute('filter', `url(#${FILTER_ID})`);
      });
    }

    // 2. Redact Text
    const textElements = Array.from(doc.getElementsByTagName('text'));
    const tspanElements = Array.from(doc.getElementsByTagName('tspan'));
    const allTextContainers = [...textElements, ...tspanElements];
    
    const redactTextNodes = (element: Element) => {
       const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
       let node;
       const nodesToReplace: { node: Node, text: string }[] = [];
       
       while(node = walker.nextNode()) {
          if (node.textContent && node.textContent.trim().length > 0) {
             nodesToReplace.push({ 
               node, 
               text: node.textContent.replace(/[^\s]/g, '▮') 
             });
          }
       }

       nodesToReplace.forEach(item => {
         item.node.textContent = item.text;
       });
    };

    allTextContainers.forEach(el => {
       if (this.shouldRedact(el)) {
         redactTextNodes(el);
       }
    });

    return this.serializer.serializeToString(doc);
  }
}

export const svgProcessor = new SvgProcessor();