#!/usr/bin/env python3
"""
YouTube Downloader - pytubefix ONLY
Simple comme le code Colab qui fonctionne
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
        yt = YouTube(url, on_progress_callback=on_progress)
        
        # Récupérer les streams vidéo disponibles
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
        yt = YouTube(url, on_progress_callback=on_progress)
        
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
        
        yt = YouTube(url, on_progress_callback=on_progress)
        
        print(f"[PYTUBEFIX] Title: {yt.title}")
        
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        if format_type == "mp3":
            # === AUDIO UNIQUEMENT (MP3) ===
            print("[PYTUBEFIX] Mode: Audio (MP3)")
            
            audio_stream = yt.streams.get_audio_only()
            if not audio_stream:
                return {"success": False, "error": "Aucun flux audio disponible"}
            
            temp_file = os.path.join(output_dir, f"{filename_base}_temp.m4a")
            final_file = os.path.join(output_dir, f"{filename_base}.mp3")
            
            print(f"[PYTUBEFIX] Téléchargement audio: {audio_stream.abr}")
            audio_stream.download(output_path=output_dir, filename=f"{filename_base}_temp.m4a")
            
            # Conversion en MP3 avec FFmpeg
            print("[FFMPEG] Conversion en MP3...")
            result = subprocess.run([
                'ffmpeg', '-i', temp_file,
                '-vn', '-acodec', 'libmp3lame', '-q:a', '0',
                final_file, '-y'
            ], capture_output=True, text=True)
            
            if result.returncode != 0:
                print(f"[FFMPEG] Erreur: {result.stderr[:200]}")
            
            # Nettoyage
            if os.path.exists(temp_file):
                os.remove(temp_file)
            
            return {
                "success": True,
                "path": final_file,
                "title": yt.title
            }
        
        else:
            # === VIDEO + AUDIO (MP4) ===
            print("[PYTUBEFIX] Mode: Video (MP4)")
            
            # Sélection du flux vidéo selon la qualité demandée
            if quality == "highest":
                video_stream = yt.streams.filter(
                    adaptive=True, only_video=True
                ).order_by('resolution').desc().first()
            else:
                # Qualité spécifique (ex: "1080p", "720p")
                video_stream = yt.streams.filter(
                    adaptive=True, only_video=True, resolution=quality
                ).first()
                
                # Fallback si qualité non disponible
                if not video_stream:
                    print(f"[PYTUBEFIX] Qualité {quality} non disponible, utilisation de la meilleure")
                    video_stream = yt.streams.filter(
                        adaptive=True, only_video=True
                    ).order_by('resolution').desc().first()
            
            audio_stream = yt.streams.get_audio_only()
            
            if not video_stream or not audio_stream:
                # Fallback: stream progressif (qualité moindre mais garanti)
                print("[PYTUBEFIX] Fallback: stream progressif")
                progressive = yt.streams.get_highest_resolution()
                if progressive:
                    final_file = os.path.join(output_dir, f"{filename_base}.mp4")
                    progressive.download(output_path=output_dir, filename=f"{filename_base}.mp4")
                    return {
                        "success": True,
                        "path": final_file,
                        "title": yt.title,
                        "quality": progressive.resolution
                    }
                return {"success": False, "error": "Aucun flux disponible"}
            
            print(f"[PYTUBEFIX] Vidéo: {video_stream.resolution} | Audio: {audio_stream.abr}")
            
            # Téléchargement des flux séparés
            video_ext = video_stream.subtype or 'mp4'
            audio_ext = audio_stream.subtype or 'm4a'
            
            temp_video = os.path.join(output_dir, f"{filename_base}_video.{video_ext}")
            temp_audio = os.path.join(output_dir, f"{filename_base}_audio.{audio_ext}")
            final_file = os.path.join(output_dir, f"{filename_base}.mp4")
            
            print("[PYTUBEFIX] Téléchargement vidéo...")
            video_stream.download(output_path=output_dir, filename=f"{filename_base}_video.{video_ext}")
            
            print("[PYTUBEFIX] Téléchargement audio...")
            audio_stream.download(output_path=output_dir, filename=f"{filename_base}_audio.{audio_ext}")
            
            # Fusion avec FFmpeg
            print("[FFMPEG] Fusion vidéo + audio...")
            result = subprocess.run([
                'ffmpeg',
                '-i', temp_video,
                '-i', temp_audio,
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-strict', 'experimental',
                final_file, '-y'
            ], capture_output=True, text=True)
            
            if result.returncode != 0:
                print("[FFMPEG] Tentative avec réencodage...")
                subprocess.run([
                    'ffmpeg',
                    '-i', temp_video,
                    '-i', temp_audio,
                    '-c:v', 'libx264', '-preset', 'fast',
                    '-c:a', 'aac',
                    final_file, '-y'
                ], capture_output=True)
            
            # Nettoyage des fichiers temporaires
            for temp in [temp_video, temp_audio]:
                if os.path.exists(temp):
                    os.remove(temp)
                    print(f"[CLEANUP] Supprimé: {os.path.basename(temp)}")
            
            return {
                "success": True,
                "path": final_file,
                "title": yt.title,
                "quality": video_stream.resolution
            }
    
    except Exception as e:
        import traceback
        print(f"[ERREUR] {str(e)}")
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
