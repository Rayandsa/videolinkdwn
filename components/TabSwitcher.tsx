'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const platforms = [
    { id: 'youtube', label: 'YouTube' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'tiktok', label: 'TikTok' },
] as const;

export type PlatformId = (typeof platforms)[number]['id'];

interface TabSwitcherProps {
    activeTab: PlatformId;
    onTabChange: (id: PlatformId) => void;
}

export default function TabSwitcher({ activeTab, onTabChange }: TabSwitcherProps) {
    return (
        <div className="flex justify-center w-full mb-8">
            <div className="flex space-x-1 bg-surface p-1 rounded-full relative">
                {platforms.map((platform) => (
                    <button
                        key={platform.id}
                        onClick={() => onTabChange(platform.id)}
                        className={twMerge(
                            "relative px-6 py-2 rounded-full text-sm font-medium transition-colors z-10 focus-visible:outline-2",
                            activeTab === platform.id ? "text-white" : "text-gray-400 hover:text-white"
                        )}
                        style={{
                            WebkitTapHighlightColor: "transparent",
                        }}
                    >
                        {activeTab === platform.id && (
                            <motion.span
                                layoutId="active-pill"
                                className="absolute inset-0 bg-gradient-to-r from-primary to-primary-dark rounded-full -z-10 shadow-[0_0_15px_rgba(108,93,211,0.5)]"
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            />
                        )}
                        {platform.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
