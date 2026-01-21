#!/usr/bin/env python3
"""
YouTube Downloader using pytubefix
Supports PO_TOKEN and VISITOR_DATA for authentication
"""

import sys
import os
import json
import subprocess
from pathlib import Path

try:
    from pytubefix import YouTube
    from pytubefix.cli import on_progress
except ImportError:
    print(json.dumps({"error": "pytubefix not installed", "success": False}))
    sys.exit(1)


def get_video_info(url: str, po_token: str = None, visitor_data: str = None) -> dict:
    """Get video metadata"""
    try:
        yt_kwargs = {}
        if po_token:
            yt_kwargs['po_token'] = po_token
        if visitor_data:
            yt_kwargs['visitor_data'] = visitor_data
        
        yt = YouTube(url, on_progress_callback=on_progress, **yt_kwargs)
        
        return {
            "success": True,
            "title": yt.title,
            "author": yt.author,
            "length": yt.length,
            "thumbnail": yt.thumbnail_url,
            "views": yt.views,
            "description": yt.description[:200] if yt.description else None
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def download_video(url: str, output_dir: str, filename_base: str, 
                   format_type: str = "mp4", po_token: str = None, 
                   visitor_data: str = None) -> dict:
    """
    Download video with best quality, merge audio+video with FFmpeg
    """
    try:
        yt_kwargs = {}
        if po_token:
            yt_kwargs['po_token'] = po_token
            print(f"[PYTUBEFIX] Using PO_TOKEN: {po_token[:10]}...")
        if visitor_data:
            yt_kwargs['visitor_data'] = visitor_data
            print(f"[PYTUBEFIX] Using VISITOR_DATA")
        
        yt = YouTube(url, on_progress_callback=on_progress, **yt_kwargs)
        
        print(f"[PYTUBEFIX] Video: {yt.title}")
        
        # Ensure output directory exists
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        if format_type == "mp3":
            # Audio only
            print("[PYTUBEFIX] Downloading audio stream...")
            audio_stream = yt.streams.get_audio_only()
            if not audio_stream:
                return {"success": False, "error": "No audio stream available"}
            
            temp_audio = os.path.join(output_dir, f"{filename_base}_temp.m4a")
            final_path = os.path.join(output_dir, f"{filename_base}.mp3")
            
            audio_stream.download(output_path=output_dir, filename=f"{filename_base}_temp.m4a")
            
            # Convert to MP3 with FFmpeg
            print("[FFMPEG] Converting to MP3...")
            subprocess.run([
                'ffmpeg', '-i', temp_audio,
                '-vn', '-acodec', 'libmp3lame', '-q:a', '0',
                final_path, '-y'
            ], check=True, capture_output=True)
            
            # Cleanup temp file
            if os.path.exists(temp_audio):
                os.remove(temp_audio)
            
            return {
                "success": True,
                "path": final_path,
                "title": yt.title
            }
        
        else:
            # Video + Audio (HD quality)
            print("[PYTUBEFIX] Getting best streams...")
            
            # Get best video stream (prefer mp4, then webm)
            video_stream = (
                yt.streams.filter(adaptive=True, file_extension='mp4', only_video=True)
                .order_by('resolution').desc().first()
            )
            
            if not video_stream:
                video_stream = (
                    yt.streams.filter(adaptive=True, only_video=True)
                    .order_by('resolution').desc().first()
                )
            
            # Get best audio stream
            audio_stream = yt.streams.get_audio_only()
            
            if not video_stream or not audio_stream:
                # Fallback to progressive stream (lower quality but has both)
                print("[PYTUBEFIX] Using progressive stream (fallback)...")
                progressive = yt.streams.get_highest_resolution()
                if progressive:
                    final_path = os.path.join(output_dir, f"{filename_base}.mp4")
                    progressive.download(output_path=output_dir, filename=f"{filename_base}.mp4")
                    return {
                        "success": True,
                        "path": final_path,
                        "title": yt.title
                    }
                return {"success": False, "error": "No suitable streams found"}
            
            print(f"[PYTUBEFIX] Video: {video_stream.resolution} | Audio: {audio_stream.abr}")
            
            # Download video stream
            temp_video = os.path.join(output_dir, f"{filename_base}_video.{video_stream.subtype}")
            temp_audio = os.path.join(output_dir, f"{filename_base}_audio.{audio_stream.subtype}")
            final_path = os.path.join(output_dir, f"{filename_base}.mp4")
            
            print("[PYTUBEFIX] Downloading video stream...")
            video_stream.download(output_path=output_dir, filename=f"{filename_base}_video.{video_stream.subtype}")
            
            print("[PYTUBEFIX] Downloading audio stream...")
            audio_stream.download(output_path=output_dir, filename=f"{filename_base}_audio.{audio_stream.subtype}")
            
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
                print(f"[FFMPEG] Error: {result.stderr}")
                # Try alternative encoding
                print("[FFMPEG] Trying alternative encoding...")
                subprocess.run([
                    'ffmpeg',
                    '-i', temp_video,
                    '-i', temp_audio,
                    '-c:v', 'libx264',
                    '-c:a', 'aac',
                    '-preset', 'fast',
                    final_path, '-y'
                ], check=True, capture_output=True)
            
            # Cleanup temp files
            for temp_file in [temp_video, temp_audio]:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
                    print(f"[CLEANUP] Removed: {os.path.basename(temp_file)}")
            
            return {
                "success": True,
                "path": final_path,
                "title": yt.title,
                "resolution": video_stream.resolution
            }
    
    except Exception as e:
        import traceback
        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }


def main():
    """Main entry point - parse arguments and execute"""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: youtube_download.py <action> <args...>", "success": False}))
        sys.exit(1)
    
    action = sys.argv[1]
    
    # Get environment variables
    po_token = os.environ.get('PO_TOKEN', '')
    visitor_data = os.environ.get('VISITOR_DATA', '')
    
    if action == "info":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "URL required", "success": False}))
            sys.exit(1)
        
        url = sys.argv[2]
        result = get_video_info(url, po_token, visitor_data)
        print(json.dumps(result))
    
    elif action == "download":
        if len(sys.argv) < 5:
            print(json.dumps({"error": "Usage: download <url> <output_dir> <filename_base> [format]", "success": False}))
            sys.exit(1)
        
        url = sys.argv[2]
        output_dir = sys.argv[3]
        filename_base = sys.argv[4]
        format_type = sys.argv[5] if len(sys.argv) > 5 else "mp4"
        
        result = download_video(url, output_dir, filename_base, format_type, po_token, visitor_data)
        print(json.dumps(result))
    
    else:
        print(json.dumps({"error": f"Unknown action: {action}", "success": False}))
        sys.exit(1)


if __name__ == "__main__":
    main()
