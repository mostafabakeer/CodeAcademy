#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Stickman 9:16 video generator - 60 seconds
No desktop dependencies, pure Python + Pillow + FFmpeg
"""
import os
import math
from pathlib import Path
from PIL import Image, ImageDraw

# Config
WIDTH, HEIGHT = 1080, 1920  # 9:16
FPS = 30
DURATION = 60  # seconds
OUTPUT_DIR = Path("D:/CodeAcademy/stickman_output")
FRAMES_DIR = OUTPUT_DIR / "frames"
VIDEO_PATH = OUTPUT_DIR / "stickman_916.mp4"

BG_COLOR = (10, 10, 20)
STICK_COLOR = (255, 255, 255)
LINE_WIDTH = 6

def ensure_dirs():
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def draw_frame(t):
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Walking stickman
    cx = WIDTH // 2
    base_y = HEIGHT - 300
    # Bobbing
    bob = math.sin(t * 2) * 10
    # Arm swing
    arm_angle = math.sin(t * 3) * 0.6
    # Leg swing
    leg_angle = math.sin(t * 3) * 0.5

    # Head
    head_r = 40
    head_x = cx
    head_y = base_y - 300 + bob
    draw.ellipse([head_x-head_r, head_y-head_r, head_x+head_r, head_y+head_r], outline=STICK_COLOR, width=LINE_WIDTH)
    # Eyes
    eye_offset = 12
    draw.ellipse([head_x-eye_offset-6, head_y-10, head_x-eye_offset+6, head_y+10], outline=STICK_COLOR, width=3)
    draw.ellipse([head_x+eye_offset-6, head_y-10, head_x+eye_offset+6, head_y+10], outline=STICK_COLOR, width=3)

    # Body
    shoulder_y = head_y + head_r
    hip_y = shoulder_y + 140
    # Torso
    draw.line([cx, shoulder_y, cx, hip_y], fill=STICK_COLOR, width=LINE_WIDTH)

    # Arms
    arm_len = 100
    left_arm_x = cx - 60 + int(arm_len*math.sin(arm_angle))
    left_arm_y = shoulder_y + int(arm_len*math.cos(arm_angle))
    right_arm_x = cx + 60 - int(arm_len*math.sin(arm_angle))
    right_arm_y = shoulder_y + int(arm_len*math.cos(arm_angle))
    draw.line([cx-30, shoulder_y, left_arm_x, left_arm_y], fill=STICK_COLOR, width=LINE_WIDTH)
    draw.line([cx+30, shoulder_y, right_arm_x, right_arm_y], fill=STICK_COLOR, width=LINE_WIDTH)

    # Legs
    leg_len = 130
    left_leg_x = cx - 25 + int(leg_len*math.sin(leg_angle))
    left_leg_y = hip_y + leg_len
    right_leg_x = cx + 25 - int(leg_len*math.sin(leg_angle))
    right_leg_y = hip_y + leg_len
    draw.line([cx-15, hip_y, left_leg_x, left_leg_y], fill=STICK_COLOR, width=LINE_WIDTH)
    draw.line([cx+15, hip_y, right_leg_x, right_leg_y], fill=STICK_COLOR, width=LINE_WIDTH)

    # Ground line
    draw.line([50, base_y+40, WIDTH-50, base_y+40], fill=(60,60,80), width=3)

    return img

def main():
    ensure_dirs()
    total_frames = FPS * DURATION
    print(f"Generating {total_frames} frames...")
    for i in range(total_frames):
        t = i / FPS
        img = draw_frame(t)
        frame_path = FRAMES_DIR / f"frame_{i:05d}.png"
        img.save(frame_path)
        if i % 300 == 0:
            print(f"  {i}/{total_frames}")

    # Build video with FFmpeg
    ffmpeg_cmd = (
        f'ffmpeg -y -framerate {FPS} -i "{FRAMES_DIR}/frame_%05d.png" '
        f'-c:v libx264 -pix_fmt yuv420p -r {FPS} "{VIDEO_PATH}"'
    )
    print("Calling FFmpeg...")
    os.system(ffmpeg_cmd)
    print(f"Done: {VIDEO_PATH}")

if __name__ == "__main__":
    main()
