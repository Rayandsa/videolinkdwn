'use client';

import { useState, useEffect } from 'react';
import { Link, Clipboard } from 'lucide-react';

interface UrlInputProps {
    platform: string;
    onUrlSubmit: (url: string) => void;
    isLoading: boolean;
}

export default function UrlInput({ platform, onUrlSubmit, isLoading }: UrlInputProps) {
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');

    const validateUrl = (value: string) => {
        // Basic validation, can be enhanced
        if (!value) return true; // Empty is not error until submit
        if (platform === 'youtube' && !value.includes('youtube') && !value.includes('youtu.be')) {
            return "Looks like this isn't a YouTube link.";
        }
        if (platform === 'instagram' && !value.includes('instagram')) {
            return "Looks like this isn't an Instagram link.";
        }
        if (platform === 'tiktok' && !value.includes('tiktok')) {
            return "Looks like this isn't a TikTok link.";
        }
        return '';
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setUrl(val);
        const validationMsg = validateUrl(val);
        if (validationMsg !== true) {
            // Only show error if meaningful content
            if (val.length > 10) setError(validationMsg as string);
        } else {
            setError('');
        }
    };

    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            setUrl(text);
            // Optional: Auto submit on paste?
            // onUrlSubmit(text);
        } catch (err) {
            console.error('Failed to read clipboard', err);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!url) return;
        const msg = validateUrl(url);
        if (msg && typeof msg === 'string') {
            setError(msg);
            return;
        }
        onUrlSubmit(url);
    };

    return (
        <div className="w-full max-w-2xl mx-auto">
            <form onSubmit={handleSubmit} className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Link className="h-5 w-5 text-gray-400 group-focus-within:text-primary transition-colors" />
                </div>
                <input
                    type="text"
                    value={url}
                    onChange={handleChange}
                    placeholder={`Paste your ${platform} link here...`}
                    className="w-full bg-surface text-white pl-12 pr-24 py-4 rounded-xl border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-lg text-lg placeholder-gray-500"
                    disabled={isLoading}
                />
                <div className="absolute inset-y-0 right-2 flex items-center">
                    <button
                        type="button"
                        onClick={handlePaste}
                        className="p-2 text-gray-400 hover:text-white transition-colors mr-1"
                        title="Paste from clipboard"
                    >
                        <Clipboard size={20} />
                    </button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? '...' : 'Go'}
                    </button>
                </div>
            </form>
            {error && (
                <p className="mt-2 text-red-400 text-sm ml-4 animate-pulse">
                    {error}
                </p>
            )}
        </div>
    );
}
