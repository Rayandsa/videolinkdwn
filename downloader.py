#!/usr/bin/env python3
"""
YouTube Downloader - pytubefix optimized
Based on official pytubefix documentation
"""

import sys
import os
import json
import subprocess
from pathlib import Path

from pytubefix import YouTube
from pytubefix.cli import on_progress


def list_qualities(url: str):
    """Liste les qualités disponibles pour une vidéo"""
    try:
        # OAuth pour gérer les vidéos avec restriction d'âge
        yt = YouTube(url, use_oauth=True, allow_oauth_cache=True, on_progress_callback=on_progress)
        
        streams = yt.streams.filter(adaptive=True, only_video=True).order_by('resolution').desc()
        
        qualities = []
        seen = set()
        for stream in streams:
            if stream.resolution and stream.resolution not in seen:
                seen.add(stream.resolution)
                qualities.append({
                    "resolution": stream.resolution,
                    "fps": stream.fps,
                    "codec": stream.video_codec
                })
        
        return {
            "success": True,
            "title": yt.title,
            "thumbnail": yt.thumbnail_url,
            "author": yt.author,
            "length": yt.length,
            "qualities": qualities
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_info(url: str):
    """Récupère les métadonnées de la vidéo"""
    try:
        yt = YouTube(url, use_oauth=True, allow_oauth_cache=True, on_progress_callback=on_progress)
        
        return {
            "success": True,
            "title": yt.title,
            "author": yt.author,
            "length": yt.length,
            "thumbnail": yt.thumbnail_url,
            "views": yt.views
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def download(url: str, output_dir: str, filename_base: str, 
             format_type: str = "mp4", quality: str = "highest"):
    """
    Télécharge une vidéo YouTube
    
    Args:
        url: URL YouTube
        output_dir: Dossier de sortie
        filename_base: Nom du fichier (sans extension)
        format_type: "mp4" ou "mp3"
        quality: "highest", "1080p", "720p", "480p", etc.
    """
    try:
        print(f"[PYTUBEFIX] URL: {url}")
        print(f"[PYTUBEFIX] Format: {format_type}, Quality: {quality}")
        
        # OAuth avec cache pour gérer les restrictions
        yt = YouTube(url, use_oauth=True, allow_oauth_cache=True, on_progress_callback=on_progress)
        
        print(f"[PYTUBEFIX] Title: {yt.title}")
        print(f"[PYTUBEFIX] Author: {yt.author}")
        
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        if format_type == "mp3":
            # === AUDIO UNIQUEMENT (MP3) ===
            print("[PYTUBEFIX] Mode: Audio (MP3)")
            
            # Méthode officielle: get_audio_only()
            audio_stream = yt.streams.get_audio_only()
            if not audio_stream:
                return {"success": False, "error": "Aucun flux audio disponible"}
            
            print(f"[PYTUBEFIX] Audio stream: {audio_stream.abr}")
            
            # Télécharger avec output_path (méthode recommandée)
            temp_filename = f"{filename_base}_temp"
            downloaded_file = audio_stream.download(output_path=output_dir, filename=temp_filename)
            print(f"[PYTUBEFIX] Downloaded: {downloaded_file}")
            
            # Conversion en MP3 avec FFmpeg
            final_file = os.path.join(output_dir, f"{filename_base}.mp3")
            print("[FFMPEG] Converting to MP3...")
            
            result = subprocess.run([
                'ffmpeg', '-i', downloaded_file,
                '-vn', '-acodec', 'libmp3lame', '-q:a', '0',
                final_file, '-y'
            ], capture_output=True, text=True)
            
            if result.returncode != 0:
                print(f"[FFMPEG] Warning: {result.stderr[:200]}")
            
            # Nettoyage du fichier temporaire
            if os.path.exists(downloaded_file):
                os.remove(downloaded_file)
                print(f"[CLEANUP] Removed temp file")
            
            return {
                "success": True,
                "path": final_file,
                "title": yt.title
            }
        
        else:
            # === VIDEO + AUDIO (MP4) ===
            print("[PYTUBEFIX] Mode: Video (MP4)")
            
            # D'abord essayer get_highest_resolution() (stream progressif = vidéo + audio)
            progressive_stream = yt.streams.get_highest_resolution()
            
            if progressive_stream:
                print(f"[PYTUBEFIX] Progressive stream available: {progressive_stream.resolution}")
                
                # Si qualité demandée est inférieure ou égale, utiliser le progressif
                if quality == "highest" or quality == progressive_stream.resolution:
                    final_file = os.path.join(output_dir, f"{filename_base}.mp4")
                    downloaded = progressive_stream.download(output_path=output_dir, filename=f"{filename_base}.mp4")
                    print(f"[PYTUBEFIX] Downloaded: {downloaded}")
                    
                    return {
                        "success": True,
                        "path": final_file,
                        "title": yt.title,
                        "quality": progressive_stream.resolution
                    }
            
            # Sinon, utiliser les streams adaptatifs (meilleure qualité possible)
            print("[PYTUBEFIX] Using adaptive streams for higher quality...")
            
            # Sélection du flux vidéo
            if quality == "highest":
                video_stream = yt.streams.filter(
                    adaptive=True, only_video=True
                ).order_by('resolution').desc().first()
            else:
                video_stream = yt.streams.filter(
                    adaptive=True, only_video=True, resolution=quality
                ).first()
                
                if not video_stream:
                    print(f"[PYTUBEFIX] Quality {quality} not available, using highest")
                    video_stream = yt.streams.filter(
                        adaptive=True, only_video=True
                    ).order_by('resolution').desc().first()
            
            audio_stream = yt.streams.get_audio_only()
            
            if not video_stream or not audio_stream:
                # Dernier recours: stream progressif
                if progressive_stream:
                    final_file = os.path.join(output_dir, f"{filename_base}.mp4")
                    progressive_stream.download(output_path=output_dir, filename=f"{filename_base}.mp4")
                    return {
                        "success": True,
                        "path": final_file,
                        "title": yt.title,
                        "quality": progressive_stream.resolution
                    }
                return {"success": False, "error": "Aucun flux disponible"}
            
            print(f"[PYTUBEFIX] Video: {video_stream.resolution} @ {video_stream.fps}fps")
            print(f"[PYTUBEFIX] Audio: {audio_stream.abr}")
            
            # Téléchargement des flux
            video_filename = f"{filename_base}_video"
            audio_filename = f"{filename_base}_audio"
            
            print("[PYTUBEFIX] Downloading video stream...")
            video_file = video_stream.download(output_path=output_dir, filename=video_filename)
            
            print("[PYTUBEFIX] Downloading audio stream...")
            audio_file = audio_stream.download(output_path=output_dir, filename=audio_filename)
            
            # Fusion avec FFmpeg
            final_file = os.path.join(output_dir, f"{filename_base}.mp4")
            print("[FFMPEG] Merging video + audio...")
            
            result = subprocess.run([
                'ffmpeg',
                '-i', video_file,
                '-i', audio_file,
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-strict', 'experimental',
                final_file, '-y'
            ], capture_output=True, text=True)
            
            if result.returncode != 0:
                print(f"[FFMPEG] Copy failed, trying re-encode...")
                subprocess.run([
                    'ffmpeg',
                    '-i', video_file,
                    '-i', audio_file,
                    '-c:v', 'libx264', '-preset', 'fast',
                    '-c:a', 'aac',
                    final_file, '-y'
                ], capture_output=True)
            
            # Nettoyage
            for f in [video_file, audio_file]:
                if os.path.exists(f):
                    os.remove(f)
                    print(f"[CLEANUP] Removed: {os.path.basename(f)}")
            
            return {
                "success": True,
                "path": final_file,
                "title": yt.title,
                "quality": video_stream.resolution
            }
    
    except Exception as e:
        import traceback
        print(f"[ERROR] {str(e)}")
        traceback.print_exc()
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({
            "success": False, 
            "error": "Usage: downloader.py <action> --url <url> [--format mp4|mp3] [--quality 1080p|720p|...]"
        }))
        sys.exit(1)
    
    action = sys.argv[1]
    
    # Parse arguments
    args = {}
    i = 2
    while i < len(sys.argv):
        if sys.argv[i].startswith('--'):
            key = sys.argv[i][2:]
            value = sys.argv[i + 1] if i + 1 < len(sys.argv) else ''
            args[key] = value
            i += 2
        else:
            i += 1
    
    if action == "info":
        result = get_info(args.get('url', ''))
        print(json.dumps(result))
    
    elif action == "qualities":
        result = list_qualities(args.get('url', ''))
        print(json.dumps(result))
    
    elif action == "download":
        result = download(
            url=args.get('url', ''),
            output_dir=args.get('output', '/tmp'),
            filename_base=args.get('filename', 'video'),
            format_type=args.get('format', 'mp4'),
            quality=args.get('quality', 'highest')
        )
        print(json.dumps(result))
    
    else:
        print(json.dumps({"success": False, "error": f"Action inconnue: {action}"}))
