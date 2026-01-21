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


def download_video(url: str, output_dir: str, filename_base: str, 
                   format_type: str = "mp4", po_token: str = None, 
                   visitor_data: str = None):
    """
    Download YouTube video using pytubefix with PO_TOKEN authentication
    """
    try:
        print(f"[PYTUBEFIX] Starting download for: {url}")
        print(f"[PYTUBEFIX] Output: {output_dir}/{filename_base}.{format_type}")
        
        # Create YouTube object with authentication
        yt_kwargs = {
            'on_progress_callback': on_progress,
            'use_po_token': True  # Enable PO Token mode
        }
        
        if po_token:
            yt_kwargs['po_token'] = po_token
            print(f"[PYTUBEFIX] Using PO_TOKEN: {po_token[:15]}...")
        
        if visitor_data:
            yt_kwargs['visitor_data'] = visitor_data
            print(f"[PYTUBEFIX] Using VISITOR_DATA")
        
        yt = YouTube(url, **yt_kwargs)
        
        print(f"[PYTUBEFIX] Title: {yt.title}")
        print(f"[PYTUBEFIX] Author: {yt.author}")
        print(f"[PYTUBEFIX] Length: {yt.length} seconds")
        
        # Ensure output directory exists
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        if format_type == "mp3":
            # Audio only - download and convert
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
            result = subprocess.run([
                'ffmpeg', '-i', temp_audio,
                '-vn', '-acodec', 'libmp3lame', '-q:a', '0',
                final_path, '-y'
            ], capture_output=True, text=True)
            
            if result.returncode != 0:
                print(f"[FFMPEG] Error: {result.stderr}")
            
            # Cleanup
            if os.path.exists(temp_audio):
                os.remove(temp_audio)
                print(f"[CLEANUP] Removed temp audio")
            
            return {
                "success": True,
                "path": final_path,
                "title": yt.title
            }
        
        else:
            # Video with audio - HD quality
            print("[PYTUBEFIX] Mode: Video (MP4 HD)")
            
            # Get best video stream (adaptive)
            video_stream = yt.streams.filter(
                adaptive=True, 
                file_extension='mp4',
                only_video=True
            ).order_by('resolution').desc().first()
            
            # Fallback to webm if no mp4
            if not video_stream:
                video_stream = yt.streams.filter(
                    adaptive=True,
                    only_video=True
                ).order_by('resolution').desc().first()
            
            # Get best audio stream
            audio_stream = yt.streams.get_audio_only()
            
            if not video_stream or not audio_stream:
                # Fallback to progressive (has both but lower quality)
                print("[PYTUBEFIX] Fallback: Using progressive stream")
                progressive = yt.streams.get_highest_resolution()
                if progressive:
                    final_path = os.path.join(output_dir, f"{filename_base}.mp4")
                    progressive.download(output_path=output_dir, filename=f"{filename_base}.mp4")
                    return {
                        "success": True,
                        "path": final_path,
                        "title": yt.title,
                        "quality": progressive.resolution
                    }
                return {"success": False, "error": "No streams available"}
            
            print(f"[PYTUBEFIX] Video: {video_stream.resolution} ({video_stream.mime_type})")
            print(f"[PYTUBEFIX] Audio: {audio_stream.abr}")
            
            # Download video
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
                '-movflags', '+faststart',
                final_path, '-y'
            ], capture_output=True, text=True)
            
            if result.returncode != 0:
                print(f"[FFMPEG] Warning: {result.stderr[:500]}")
                # Try re-encoding if copy fails
                print("[FFMPEG] Trying re-encode...")
                subprocess.run([
                    'ffmpeg',
                    '-i', temp_video,
                    '-i', temp_audio,
                    '-c:v', 'libx264', '-preset', 'fast',
                    '-c:a', 'aac',
                    final_path, '-y'
                ], capture_output=True)
            
            # Cleanup temp files
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
        print(traceback.format_exc())
        return {
            "success": False,
            "error": str(e)
        }


def get_info(url: str, po_token: str = None, visitor_data: str = None):
    """Get video metadata"""
    try:
        yt_kwargs = {'use_po_token': True}
        if po_token:
            yt_kwargs['po_token'] = po_token
        if visitor_data:
            yt_kwargs['visitor_data'] = visitor_data
        
        yt = YouTube(url, **yt_kwargs)
        
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
    po_token = os.environ.get('PO_TOKEN', '')
    visitor_data = os.environ.get('VISITOR_DATA', '')
    
    if action == "info":
        url = sys.argv[2] if len(sys.argv) > 2 else ''
        result = get_info(url, po_token, visitor_data)
        print(json.dumps(result))
    
    elif action == "download":
        if len(sys.argv) < 5:
            print(json.dumps({"success": False, "error": "Usage: download <url> <output_dir> <filename> [format]"}))
            sys.exit(1)
        
        url = sys.argv[2]
        output_dir = sys.argv[3]
        filename = sys.argv[4]
        fmt = sys.argv[5] if len(sys.argv) > 5 else 'mp4'
        
        result = download_video(url, output_dir, filename, fmt, po_token, visitor_data)
        print(json.dumps(result))
    
    else:
        print(json.dumps({"success": False, "error": f"Unknown action: {action}"}))
