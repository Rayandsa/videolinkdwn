'use client';

import { useState } from 'react';
import TabSwitcher, { PlatformId } from '@/components/TabSwitcher';
import UrlInput from '@/components/UrlInput';
import VideoCard from '@/components/VideoCard';
import axios from 'axios';

export default function Home() {
  const [activeTab, setActiveTab] = useState<PlatformId>('youtube');
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadType, setDownloadType] = useState<'video' | 'audio' | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [metadata, setMetadata] = useState<any>(null);
  const [error, setError] = useState('');

  const handleTabChange = (id: PlatformId) => {
    setActiveTab(id);
    setMetadata(null);
    setError('');
  };

  const handleUrlSubmit = async (url: string) => {
    setIsLoading(true);
    setError('');
    setMetadata(null);

    try {
      const response = await axios.post('/api/info', {
        url,
        platform: activeTab
      });
      setMetadata(response.data);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch video information. Please check the link.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (format: 'mp4' | 'mp3') => {
    if (!metadata || isDownloading) return;

    setIsDownloading(true);
    setDownloadType(format === 'mp3' ? 'audio' : 'video');
    setDownloadProgress(0);
    setError('');

    try {
      console.log('[DOWNLOAD] Starting download request...');

      // Fake progress for UX initially (jump to 10%)
      setDownloadProgress(10);

      const response = await axios.post('/api/download', {
        url: metadata.originalUrl,
        platform: activeTab,
        format: format,
        title: metadata.title
      }, {
        responseType: 'blob',
        timeout: 600000, // 10 minutes timeout
        onDownloadProgress: (progressEvent) => {
          const total = progressEvent.total || 0;
          if (total > 0) {
            const percent = Math.round((progressEvent.loaded * 100) / total);
            setDownloadProgress(percent);
          } else {
            // If total size unknown, simulate progress slowly
            setDownloadProgress((prev) => Math.min(prev + 5, 95));
          }
        }
      });

      setDownloadProgress(100);
      console.log('[DOWNLOAD] Response received, creating blob...');

      // Create a blob URL and invoke download
      const blob = new Blob([response.data], {
        type: format === 'mp3' ? 'audio/mpeg' : 'video/mp4'
      });
      const downloadUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = downloadUrl;

      // Use a clean filename with extension
      const safeTitle = metadata.title
        ? metadata.title.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100)
        : 'video';
      link.download = `${safeTitle}.${format}`;

      console.log(`[DOWNLOAD] Triggering download: ${link.download}`);

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(downloadUrl);
      console.log('[DOWNLOAD] Complete!');

    } catch (err: any) {
      console.error('[DOWNLOAD] Failed:', err);
      setError(`Download failed: ${err.message || 'Unknown error'}`);
    } finally {
      // Delay resetting the loader slightly so user sees 100%
      setTimeout(() => {
        setIsDownloading(false);
        setDownloadType(null);
        setDownloadProgress(0);
      }, 1000);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-background text-foreground flex flex-col items-center">
      <header className="mb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500 mb-4 tracking-tight">
          Video Link Downloader
        </h1>
        <p className="text-gray-400">
          Download high-quality videos/audio from your favorite platforms.
        </p>
      </header>

      <main className="w-full max-w-4xl z-10">
        <TabSwitcher activeTab={activeTab} onTabChange={handleTabChange} />

        <div className="mt-8">
          <UrlInput
            platform={activeTab}
            onUrlSubmit={handleUrlSubmit}
            isLoading={isLoading}
          />
        </div>

        {error && (
          <div className="text-center mt-8 text-red-400 bg-red-400/10 p-4 rounded-xl border border-red-400/20">
            {error}
          </div>
        )}

        {metadata && (
          <VideoCard
            metadata={metadata}
            onDownload={handleDownload}
            isDownloading={isDownloading}
            downloadType={downloadType}
            progress={downloadProgress}
          />
        )}
      </main>

      {/* Decorative background elements */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[50%] rounded-full bg-purple-900/10 blur-[120px]" />
      </div>

      {/* Footer */}
      <footer className="mt-auto pt-16 pb-6 text-center text-gray-500 text-sm">
        <p>© 2026 · Made with ❤️ by <span className="text-primary font-medium">NIYA. Z</span></p>
      </footer>
    </div>
  );
}
