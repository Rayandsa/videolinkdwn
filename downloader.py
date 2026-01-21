#!/usr/bin/env python3
"""
YouTube Downloader using pytubefix with anti-detection features
- OAuth authentication
- Proxy rotation
- Dynamic User-Agent
- Persistent session
"""

import sys
import os
import json
import subprocess
import random
import pickle
from pathlib import Path
from typing import Optional, List

import requests
from pytubefix import YouTube
from pytubefix.cli import on_progress


# === CONFIGURATION ===

# User-Agent pool (recent browsers)
USER_AGENTS = [
    # Chrome Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    # Chrome macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    # Firefox Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
    # Firefox macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
    # Safari
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    # Edge
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
]

# Proxy list (format: http://user:pass@host:port or http://host:port)
# Set via environment variable PROXY_LIST (comma-separated)
PROXY_LIST = os.environ.get('PROXY_LIST', '').split(',') if os.environ.get('PROXY_LIST') else []

# Session file for persistence
SESSION_FILE = os.environ.get('SESSION_FILE', '/app/__cache__/session.pkl')
COOKIES_FILE = os.environ.get('COOKIES_FILE', '/app/__cache__/cookies.pkl')


def get_random_user_agent() -> str:
    """Get a random User-Agent from the pool"""
    return random.choice(USER_AGENTS)


def get_random_proxy() -> Optional[dict]:
    """Get a random proxy from the list"""
    if not PROXY_LIST or PROXY_LIST == ['']:
        return None
    
    proxy = random.choice([p for p in PROXY_LIST if p.strip()])
    if not proxy:
        return None
    
    return {
        'http': proxy.strip(),
        'https': proxy.strip()
    }


def load_session() -> requests.Session:
    """Load or create a persistent session"""
    session = requests.Session()
    
    # Set default headers to look like a real browser
    session.headers.update({
        'User-Agent': get_random_user_agent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
    })
    
    # Load saved cookies if available
    if os.path.exists(COOKIES_FILE):
        try:
            with open(COOKIES_FILE, 'rb') as f:
                session.cookies.update(pickle.load(f))
            print(f"[SESSION] Loaded cookies from {COOKIES_FILE}")
        except Exception as e:
            print(f"[SESSION] Could not load cookies: {e}")
    
    return session


def save_session_cookies(session: requests.Session):
    """Save session cookies for persistence"""
    try:
        Path(os.path.dirname(COOKIES_FILE)).mkdir(parents=True, exist_ok=True)
        with open(COOKIES_FILE, 'wb') as f:
            pickle.dump(session.cookies, f)
        print(f"[SESSION] Saved cookies to {COOKIES_FILE}")
    except Exception as e:
        print(f"[SESSION] Could not save cookies: {e}")


def create_youtube_client(url: str) -> YouTube:
    """Create YouTube client with anti-detection features"""
    user_agent = get_random_user_agent()
    proxy = get_random_proxy()
    
    print(f"[ANTI-DETECT] User-Agent: {user_agent[:50]}...")
    if proxy:
        print(f"[ANTI-DETECT] Using proxy: {list(proxy.values())[0][:30]}...")
    
    # Create YouTube object with OAuth
    yt = YouTube(
        url,
        on_progress_callback=on_progress,
        use_oauth=True,
        allow_oauth_cache=True,
        proxies=proxy  # pytubefix supports proxies
    )
    
    return yt


def warm_up_session(session: requests.Session):
    """Warm up the session by visiting YouTube homepage first"""
    try:
        proxy = get_random_proxy()
        headers = {'User-Agent': get_random_user_agent()}
        
        print("[SESSION] Warming up - visiting YouTube...")
        response = session.get(
            'https://www.youtube.com/',
            headers=headers,
            proxies=proxy,
            timeout=10
        )
        print(f"[SESSION] Warm-up status: {response.status_code}")
        
        # Save any cookies received
        save_session_cookies(session)
        
    except Exception as e:
        print(f"[SESSION] Warm-up failed: {e}")


def download_video(url: str, output_dir: str, filename_base: str, format_type: str = "mp4"):
    """Download YouTube video with anti-detection"""
    try:
        print(f"[PYTUBEFIX] Starting download for: {url}")
        print(f"[PYTUBEFIX] Output: {output_dir}/{filename_base}.{format_type}")
        
        # Load persistent session
        session = load_session()
        
        # Warm up session (simulate real user)
        warm_up_session(session)
        
        # Create YouTube client with anti-detection
        yt = create_youtube_client(url)
        
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
            # Video - get highest resolution
            print("[PYTUBEFIX] Mode: Video (MP4)")
            
            # First try: progressive stream (has audio included)
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
    """Get video metadata with anti-detection"""
    try:
        # Load session and warm up
        session = load_session()
        warm_up_session(session)
        
        # Create YouTube client
        yt = create_youtube_client(url)
        
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
