'use client';

import { motion } from 'framer-motion';

interface PixelLoaderProps {
    type: 'video' | 'audio';
    progress: number;
}

export default function PixelLoader({ type, progress }: PixelLoaderProps) {
    const text = type === 'video' ? 'MP4' : 'MP3';
    const color = type === 'video' ? 'bg-blue-600' : 'bg-orange-500'; // Bleu pour vidéo, Orange pour MP3

    return (
        <div className="flex flex-col items-center justify-center py-8 overflow-hidden">
            <div className="relative w-64 h-56 flex flex-col items-center">

                {/* OVNI (UFO) */}
                <motion.div
                    animate={{ y: [-5, 5, -5] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="relative z-30 flex flex-col items-center"
                >
                    {/* Tête du martien content */}
                    <motion.div
                        initial={{ y: 10 }}
                        animate={{ y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="absolute -top-6 z-10"
                    >
                        <div className="w-8 h-8 bg-green-500 rounded-full border-2 border-black relative">
                            {/* Yeux */}
                            <div className="absolute top-2 left-1.5 w-1.5 h-1.5 bg-black rounded-full" />
                            <div className="absolute top-2 right-1.5 w-1.5 h-1.5 bg-black rounded-full" />
                            {/* Sourire (Content) */}
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-4 h-2 border-b-2 border-black rounded-full" />
                            {/* Antenne */}
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-green-500 border border-black" />
                            <motion.div
                                animate={{ backgroundColor: ["#22c55e", "#ef4444", "#22c55e"] }} // Clignote
                                transition={{ duration: 1, repeat: Infinity }}
                                className="absolute -top-4 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full border border-black bg-green-500"
                            />
                        </div>
                    </motion.div>

                    {/* Dôme en verre */}
                    <div className="w-20 h-10 bg-cyan-200/50 rounded-t-full border-2 border-black backdrop-blur-sm relative z-20" />

                    {/* Corps de la soucoupe */}
                    <div className="w-40 h-10 bg-gray-300 rounded-full border-2 border-black relative flex items-center justify-center shadow-lg -mt-4 z-30">
                        {/* Lumières rotatives */}
                        <div className="flex justify-between w-32 px-2">
                            {[0, 1, 2, 3].map(i => (
                                <motion.div
                                    key={i}
                                    animate={{ opacity: [0.3, 1, 0.3] }}
                                    transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.15 }}
                                    className="w-3 h-3 rounded-full bg-yellow-400 border border-black shadow-[0_0_5px_#facc15]"
                                />
                            ))}
                        </div>
                    </div>
                </motion.div>

                {/* Rayon Tracteur */}
                <div className="relative flex justify-center -mt-2 z-10">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0.4, 0.7, 0.4] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="w-24 h-32 bg-gradient-to-b from-green-400/60 to-transparent"
                        style={{ clipPath: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)' }}
                    >
                        {/* Particules qui montent */}
                        {[...Array(6)].map((_, i) => (
                            <motion.div
                                key={i}
                                animate={{ y: [120, 0], opacity: [0, 1, 0] }}
                                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2, ease: "linear" }}
                                className="absolute left-1/2 w-1 h-1 bg-white rounded-full"
                                style={{ marginLeft: (Math.random() * 40 - 20) + 'px' }}
                            />
                        ))}
                    </motion.div>

                    {/* DOCUMENT MP4/MP3 ASPIRÉ */}
                    <motion.div
                        animate={{
                            y: [100, 20], // Monte
                            rotate: [-10, 10, -5, 5], // Tourbillonne
                            scale: [1, 0.6] // Rétrécit en montant
                        }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute top-4"
                    >
                        <div className={`w-12 h-16 ${color} border-2 border-white rounded shadow-lg flex flex-col items-center justify-center relative`}>
                            {/* Pliure coin */}
                            <div className="absolute top-0 right-0 w-3 h-3 bg-white/50" style={{ clipPath: 'polygon(0 0, 100% 100%, 0 100%)' }} />

                            {/* Texte du format */}
                            <span className="text-white font-bold font-mono text-sm tracking-tighter">{text}</span>
                            <div className="w-8 h-0.5 bg-white/50 mt-1" />
                            <div className="w-6 h-0.5 bg-white/50 mt-1" />
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Barre de progression & Pourcentage */}
            <div className="w-full max-w-xs mt-2 relative">
                <div className="flex justify-between text-xs font-mono text-gray-400 mb-1">
                    <span>ABDUCTING...</span>
                    <span className="text-primary font-bold">{progress}%</span>
                </div>
                <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ type: "spring", stiffness: 50 }}
                        className="h-full bg-gradient-to-r from-green-500 to-primary relative"
                    >
                        {/* Effet brillant sur la barre */}
                        <div className="absolute inset-0 bg-white/20 animate-pulse" />
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
