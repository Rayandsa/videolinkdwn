'use client';

import { motion } from 'framer-motion';
import { Music, Video } from 'lucide-react';
import PixelLoader from './PixelLoader';

interface VideoCardProps {
    metadata: {
        title: string;
        thumbnail: string;
        duration: string;
        platform: string;
    };
    onDownload: (format: 'mp4' | 'mp3') => void;
    isDownloading: boolean;
    downloadType?: 'video' | 'audio' | null;
    progress?: number;
}

export default function VideoCard({ metadata, onDownload, isDownloading, downloadType, progress = 0 }: VideoCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface rounded-2xl overflow-hidden shadow-2xl max-w-3xl mx-auto mt-12 border border-gray-800"
        >
            {/* Show pixel art loader when downloading */}
            {isDownloading && downloadType && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-background/50 backdrop-blur-sm border-b border-gray-800"
                >
                    <PixelLoader type={downloadType} progress={progress} />
                </motion.div>
            )}

            <div className="md:flex">
                <div className="md:w-1/3 relative group">
                    <img
                        src={metadata.thumbnail}
                        alt={metadata.title}
                        className="w-full h-full object-cover min-h-[200px]"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="bg-black/60 text-white px-2 py-1 rounded text-sm backdrop-blur-sm">
                            {metadata.duration}
                        </span>
                    </div>
                </div>
                <div className="p-6 md:w-2/3 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs uppercase font-bold tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                                {metadata.platform}
                            </span>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2 line-clamp-2">
                            {metadata.title}
                        </h3>
                    </div>

                    <div className="mt-6 flex flex-col sm:flex-row gap-4">
                        <button
                            onClick={() => onDownload('mp4')}
                            disabled={isDownloading}
                            className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-wait text-white py-3 px-4 rounded-xl font-semibold transition-all active:scale-95"
                        >
                            <Video size={20} />
                            {isDownloading && downloadType === 'video' ? 'Downloading...' : 'Download Video'}
                        </button>
                        <button
                            onClick={() => onDownload('mp3')}
                            disabled={isDownloading}
                            className="flex-1 flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-wait text-white py-3 px-4 rounded-xl font-semibold transition-all active:scale-95"
                        >
                            <Music size={20} />
                            {isDownloading && downloadType === 'audio' ? 'Downloading...' : 'Audio Only'}
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
