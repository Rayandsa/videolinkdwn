#!/usr/bin/env python3
"""
YouTube Downloader - pytubefix SIMPLE
Pas d'OAuth (bloque le serveur), méthode simple comme Colab
"""

import sys
import os
import json
import subprocess
from pathlib import Path

from pytubefix import YouTube
from pytubefix.cli import on_progress


def list_qualities(url: str):
    """Liste les qualités disponibles"""
    try:
        # SIMPLE - pas d'OAuth qui bloque
        yt = YouTube(url, on_progress_callback=on_progress)
        
        streams = yt.streams.filter(adaptive=True, only_video=True).order_by('resolution').desc()
        
        qualities = []
        seen = set()
        for stream in streams:
            if stream.resolution and stream.resolution not in seen:
                seen.add(stream.resolution)
                qualities.append({
                    "resolution": stream.resolution,
                    "fps": stream.fps
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
    """Récupère les métadonnées"""
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
    """Télécharge une vidéo YouTube - méthode simple"""
    try:
        print(f"[PYTUBEFIX] URL: {url}")
        print(f"[PYTUBEFIX] Format: {format_type}, Quality: {quality}")
        
        # SIMPLE comme Colab - pas d'OAuth
        yt = YouTube(url, on_progress_callback=on_progress)
        
        print(f"[PYTUBEFIX] Title: {yt.title}")
        
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        if format_type == "mp3":
            # === AUDIO (MP3) ===
            print("[PYTUBEFIX] Mode: Audio")
            
            audio_stream = yt.streams.get_audio_only()
            if not audio_stream:
                return {"success": False, "error": "No audio stream"}
            
            print(f"[PYTUBEFIX] Audio: {audio_stream.abr}")
            
            temp_file = audio_stream.download(output_path=output_dir, filename=f"{filename_base}_temp")
            final_file = os.path.join(output_dir, f"{filename_base}.mp3")
            
            print("[FFMPEG] Converting to MP3...")
            subprocess.run([
                'ffmpeg', '-i', temp_file,
                '-vn', '-acodec', 'libmp3lame', '-q:a', '0',
                final_file, '-y'
            ], capture_output=True)
            
            if os.path.exists(temp_file):
                os.remove(temp_file)
            
            return {"success": True, "path": final_file, "title": yt.title}
        
        else:
            # === VIDEO (MP4) ===
            print("[PYTUBEFIX] Mode: Video")
            
            # Méthode Colab: get_highest_resolution()
            ys = yt.streams.get_highest_resolution()
            
            if ys:
                print(f"[PYTUBEFIX] Stream: {ys.resolution}")
                final_file = os.path.join(output_dir, f"{filename_base}.mp4")
                ys.download(output_path=output_dir, filename=f"{filename_base}.mp4")
                return {
                    "success": True,
                    "path": final_file,
                    "title": yt.title,
                    "quality": ys.resolution
                }
            
            # Fallback: streams adaptatifs
            print("[PYTUBEFIX] Trying adaptive streams...")
            
            video_stream = yt.streams.filter(
                adaptive=True, only_video=True
            ).order_by('resolution').desc().first()
            
            audio_stream = yt.streams.get_audio_only()
            
            if not video_stream or not audio_stream:
                return {"success": False, "error": "No streams available"}
            
            print(f"[PYTUBEFIX] Video: {video_stream.resolution}, Audio: {audio_stream.abr}")
            
            video_file = video_stream.download(output_path=output_dir, filename=f"{filename_base}_v")
            audio_file = audio_stream.download(output_path=output_dir, filename=f"{filename_base}_a")
            final_file = os.path.join(output_dir, f"{filename_base}.mp4")
            
            print("[FFMPEG] Merging...")
            subprocess.run([
                'ffmpeg', '-i', video_file, '-i', audio_file,
                '-c:v', 'copy', '-c:a', 'aac',
                final_file, '-y'
            ], capture_output=True)
            
            for f in [video_file, audio_file]:
                if os.path.exists(f):
                    os.remove(f)
            
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
        print(json.dumps({"success": False, "error": "Usage: downloader.py <action> --url <url>"}))
        sys.exit(1)
    
    action = sys.argv[1]
    
    # Parse args
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
        print(json.dumps({"success": False, "error": f"Unknown action: {action}"}))
