export enum ProcessingStatus {
  IDLE = 'IDLE',
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface LocalAsset {
  originalUrl: string;
  localFileName: string;
  blob: Blob;
}

export interface ProcessedSVG {
  id: string;
  originalFile: File;
  processedContent: string | null;
  status: ProcessingStatus;
  assets: LocalAsset[];
  errors: string[];
  progress: number; // 0 to 100
}

export interface WorkerMessage {
  type: 'PROGRESS' | 'COMPLETE' | 'ERROR';
  fileId: string;
  payload?: any;
}
