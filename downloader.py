#!/usr/bin/env python3
"""
YouTube Downloader using pytubefix
Based on working Colab implementation
"""

import sys
import os
import json
import subprocess
from pathlib import Path

from pytubefix import YouTube
from pytubefix.cli import on_progress


def download_video(url: str, output_dir: str, filename_base: str, format_type: str = "mp4"):
    """
    Download YouTube video using pytubefix
    Exactly like the working Colab code
    """
    try:
        print(f"[PYTUBEFIX] Starting download for: {url}")
        print(f"[PYTUBEFIX] Output: {output_dir}/{filename_base}.{format_type}")
        
        # Create YouTube object - simple like Colab
        yt = YouTube(url, on_progress_callback=on_progress)
        
        print(f"[PYTUBEFIX] Title: {yt.title}")
        print(f"[PYTUBEFIX] Author: {yt.author}")
        print(f"[PYTUBEFIX] Length: {yt.length} seconds")
        
        # Ensure output directory exists
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        if format_type == "mp3":
            # Audio only
            print("[PYTUBEFIX] Mode: Audio (MP3)")
            
            audio_stream = yt.streams.get_audio_only()
            if not audio_stream:
                return {"success": False, "error": "No audio stream available"}
            
            temp_audio = os.path.join(output_dir, f"{filename_base}_temp.m4a")
            final_path = os.path.join(output_dir, f"{filename_base}.mp3")
            
            print(f"[PYTUBEFIX] Downloading audio: {audio_stream.abr}")
            audio_stream.download(output_path=output_dir, filename=f"{filename_base}_temp.m4a")
            
            # Convert to MP3
            print("[FFMPEG] Converting to MP3...")
            subprocess.run([
                'ffmpeg', '-i', temp_audio,
                '-vn', '-acodec', 'libmp3lame', '-q:a', '0',
                final_path, '-y'
            ], capture_output=True)
            
            # Cleanup
            if os.path.exists(temp_audio):
                os.remove(temp_audio)
            
            return {
                "success": True,
                "path": final_path,
                "title": yt.title
            }
        
        else:
            # Video - get highest resolution (like Colab)
            print("[PYTUBEFIX] Mode: Video (MP4)")
            
            # First try: get_highest_resolution (progressive - has audio included)
            ys = yt.streams.get_highest_resolution()
            
            if ys:
                print(f"[PYTUBEFIX] Using progressive stream: {ys.resolution}")
                final_path = os.path.join(output_dir, f"{filename_base}.mp4")
                ys.download(output_path=output_dir, filename=f"{filename_base}.mp4")
                
                return {
                    "success": True,
                    "path": final_path,
                    "title": yt.title,
                    "quality": ys.resolution
                }
            
            # Fallback: adaptive streams (separate video + audio)
            print("[PYTUBEFIX] Fallback: adaptive streams")
            
            video_stream = yt.streams.filter(
                adaptive=True,
                file_extension='mp4',
                only_video=True
            ).order_by('resolution').desc().first()
            
            if not video_stream:
                video_stream = yt.streams.filter(
                    adaptive=True,
                    only_video=True
                ).order_by('resolution').desc().first()
            
            audio_stream = yt.streams.get_audio_only()
            
            if not video_stream or not audio_stream:
                return {"success": False, "error": "No suitable streams found"}
            
            print(f"[PYTUBEFIX] Video: {video_stream.resolution}")
            print(f"[PYTUBEFIX] Audio: {audio_stream.abr}")
            
            video_ext = video_stream.subtype or 'mp4'
            audio_ext = audio_stream.subtype or 'm4a'
            
            temp_video = os.path.join(output_dir, f"{filename_base}_video.{video_ext}")
            temp_audio = os.path.join(output_dir, f"{filename_base}_audio.{audio_ext}")
            final_path = os.path.join(output_dir, f"{filename_base}.mp4")
            
            print("[PYTUBEFIX] Downloading video stream...")
            video_stream.download(output_path=output_dir, filename=f"{filename_base}_video.{video_ext}")
            
            print("[PYTUBEFIX] Downloading audio stream...")
            audio_stream.download(output_path=output_dir, filename=f"{filename_base}_audio.{audio_ext}")
            
            # Merge with FFmpeg
            print("[FFMPEG] Merging video and audio...")
            result = subprocess.run([
                'ffmpeg',
                '-i', temp_video,
                '-i', temp_audio,
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-strict', 'experimental',
                final_path, '-y'
            ], capture_output=True, text=True)
            
            if result.returncode != 0:
                print(f"[FFMPEG] Trying re-encode...")
                subprocess.run([
                    'ffmpeg',
                    '-i', temp_video,
                    '-i', temp_audio,
                    '-c:v', 'libx264', '-preset', 'fast',
                    '-c:a', 'aac',
                    final_path, '-y'
                ], capture_output=True)
            
            # Cleanup
            for temp in [temp_video, temp_audio]:
                if os.path.exists(temp):
                    os.remove(temp)
                    print(f"[CLEANUP] Removed: {os.path.basename(temp)}")
            
            return {
                "success": True,
                "path": final_path,
                "title": yt.title,
                "quality": video_stream.resolution
            }
    
    except Exception as e:
        import traceback
        print(f"[ERROR] {str(e)}")
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e)
        }


def get_info(url: str):
    """Get video metadata"""
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
        return {
            "success": False,
            "error": str(e)
        }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Usage: downloader.py <action> <args>"}))
        sys.exit(1)
    
    action = sys.argv[1]
    
    if action == "info":
        url = sys.argv[2] if len(sys.argv) > 2 else ''
        result = get_info(url)
        print(json.dumps(result))
    
    elif action == "download":
        if len(sys.argv) < 5:
            print(json.dumps({"success": False, "error": "Usage: download <url> <output_dir> <filename> [format]"}))
            sys.exit(1)
        
        url = sys.argv[2]
        output_dir = sys.argv[3]
        filename = sys.argv[4]
        fmt = sys.argv[5] if len(sys.argv) > 5 else 'mp4'
        
        result = download_video(url, output_dir, filename, fmt)
        print(json.dumps(result))
    
    else:
        print(json.dumps({"success": False, "error": f"Unknown action: {action}"}))
