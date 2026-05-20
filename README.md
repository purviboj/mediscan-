# Medi-Scan

Real-time AI-powered touchless CT navigation system using computer vision (MediaPipe) for sterile medical imaging workflows.

---

## Overview

Medi-Scan is a computer vision-based healthcare interface that enables hands-free interaction with CT scan images using real-time hand tracking and gesture recognition.

The system was built to explore how AI-powered interaction systems can improve sterile medical environments by reducing the need for physical contact with imaging devices.

Developed during Neurovation Hackathon, where the project earned Runner-Up recognition.

---

## Motivation

In sterile medical environments, physical interaction with imaging systems increases contamination risk and workflow friction.

Medi-Scan explores how computer vision and gesture recognition can enable safer, faster, and more intuitive medical image navigation.

---

## System Overview

Medi-Scan processes live webcam input and converts hand gestures into navigation commands for CT scan visualization.

Pipeline:

Webcam Input → MediaPipe Hand Tracking → Gesture Detection → Command Mapping → CT Slice Rendering

---

## Problem

Medical professionals working in sterile environments need to interact with imaging systems without breaking sterility protocols. Traditional mouse/keyboard-based navigation introduces contamination risk and interrupts workflow efficiency.

---

## Solution

Medi-Scan introduces a touchless interaction system using real-time computer vision.

The system:
- Tracks hand landmarks using MediaPipe
- Detects gesture patterns in real time
- Maps gestures to CT navigation controls
- Renders CT slices dynamically in the browser

---

## Key Features

- Real-time hand tracking using MediaPipe
- Gesture-based CT scan navigation
- Low-latency computer vision pipeline (<30ms)
- Browser-based DICOM-style image viewer
- Support for real CT slice datasets or synthetic fallback rendering
- Fully web-deployable prototype

---

## AI & Computer Vision Highlights

- Real-time computer vision pipeline using MediaPipe
- Gesture recognition for interactive medical imaging control
- Low-latency frame processing for responsive navigation
- AI-driven interaction mapping between gestures and system commands

---

## Tech Stack

- Python (for CV prototype components)
- JavaScript
- MediaPipe
- OpenCV
- HTML/CSS
- Vercel (deployment)
- Browser-based rendering engine

---

## Application Pages

- `/` → Project overview and setup instructions  
- `/prototype.html` → Interactive CT navigation demo with webcam-based hand tracking  

---

## Running Locally

```bash
cd mediscan-
npm install
npm run dev
```

Then open:
```
http://localhost:3000
```

---

## CT Slice Data (Optional Enhancement)

To use real CT scan images, place image slices in:

```
ct-slices/
```

Example naming:
- slice-01.png
- slice-02.png
- slice-03.png

If no dataset is found, the system automatically falls back to a synthetic CT-style visualization.

---

## Deployment

### Option 1: Vercel Dashboard

- Push repo to GitHub
- Import into Vercel
- Set root directory to `mediscan-`
- Deploy with default settings

### Option 2: Vercel CLI

```bash
cd mediscan-
vercel
vercel --prod
```

---

## Technical Notes

- MediaPipe model is loaded at runtime via CDN (internet required for CV features)
- Supports real-time webcam-based gesture tracking in browser
- Designed for lightweight deployment via Vercel
- CT viewer supports both real and synthetic datasets

---

## Future Improvements

- Deep learning-based gesture classification
- Expanded medical imaging modalities
- Voice + gesture hybrid control system
- Cloud-connected hospital imaging integration
- Improved gesture vocabulary for surgical workflows

---

## Results

- Achieved real-time gesture-based navigation (<30ms latency)
- Validated usability through peer feedback
- Demonstrated feasibility of touchless medical imaging interfaces
- Built fully functional browser-based prototype system

---

## Team

Built during Neurovation Hackathon by a student engineering team focused on AI-powered healthcare innovation.
