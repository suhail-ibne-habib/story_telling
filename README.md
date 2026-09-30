# AI Movie Recap Engine

An automated, cross-modal video processing and story generation pipeline that converts full-length feature films into synchronized, multi-angle recap videos.

By decoupling story script generation from visual frame selection through a **4-stage decoupled architecture**, this engine eliminates timestamp hallucinations, duplicate clip errors, and visual-story mismatches.

---

## 💡 Key Architectural Highlights

* **Decoupled Script & Retrieval:** The LLM focuses purely on narrative structure while a local vision engine handles precise clip selection.
* **Timeline-Constrained Matching:** Uses chronological weighting and used-clip tracking to prevent out-of-order scene usage.
* **Multi-Angle Generation & Prompt Caching:** Leveraging DeepSeek's context caching, a single processed movie context (transcript + visual captions) can generate up to 5 unique video perspectives (Standard, Villain Arc, Fast-Paced Shorts, Lore Analysis) for cents per run.
* **Deterministic Video Cuts:** Uses actual scene boundary detection instead of arbitrary fixed-interval slicing.

---

## 🏗 System Architecture

```
                                    ┌──────────────────────────────────────────────────┐
                                    │               STAGE 1 & STAGE 2                  │
[ Full Movie File (.mp4) ] ────────►│ Scene Segmentation & Multimodal Indexing         │
                                    │ - PySceneDetect (Scene Boundaries)               │
                                    │ - Moondream2/BLIP-2 (Local Keyframe Captions)    │
                                    │ - ChromaDB + CLIP (Vector Embedding Storage)     │
                                    └────────────────────────┬─────────────────────────┘
                                                             │
                                                             ▼
                                                    [ Indexed Vector DB ]
                                                             │
                                                             ▼
                                    ┌──────────────────────────────────────────────────┐
                                    │                   STAGE 3                        │
[ Transcripts + Visual Captions ] ─►│ Multi-Angle Script Generation                    │
                                    │ - DeepSeek V3/Reasoner via API                   │
                                    │ - Prompt Caching enabled for 5+ script variants  │
                                    └────────────────────────┬─────────────────────────┘
                                                             │
                                                             ▼
                                                    [ Structured JSON Script ]
                                                             │
                                                             ▼
                                    ┌──────────────────────────────────────────────────┐
                                    │                   STAGE 4                        │
                                    │ Timeline Matching & Automated Assembly           │
                                    │ - Cosine Similarity + Timeline Range Filters     │
                                    │ - MoviePy / FFmpeg Stitching                     │
                                    │ - TTS Audio Sync                                 │
                                    └────────────────────────┬─────────────────────────┘
                                                             │
                                                             ▼
                                                [ Final Video Recap Output ]

```

---

## ⚙️ How It Works (The 4 Stages)

### Stage 1: Semantic Scene Segmentation

Instead of slicing fixed 5-second intervals, the system runs `PySceneDetect` to identify exact camera cuts, transitions, and scene changes, extracting discrete `.mp4` chunks with zero frame overlap.

### Stage 2: Local Vision Captioning & Vector Indexing

Each detected scene is sampled for keyframes, which are converted into detailed visual descriptions using a local vision-language model (e.g., Moondream2 or BLIP-2). These captions, along with dialogue transcript segments, are encoded into 512-dimensional vector embeddings via **CLIP** and stored locally in **ChromaDB**.

### Stage 3: LLM Storyboard Generation (DeepSeek)

The complete dialogue transcript and indexed visual descriptions are fed into DeepSeek. The model outputs a structured JSON array containing narration lines alongside target search queries and target timeline percentage constraints.

### Stage 4: Timeline-Constrained Cross-Modal Search & Assembly

A hybrid vector query matches narration visual requests against the ChromaDB collection using:


$$\text{Composite Score} = (\text{Visual Similarity} \times 0.6) + (\text{Subtitle Similarity} \times 0.4)$$


The matched video clips are trimmed to match the exact duration of the generated TTS voiceover and assembled automatically into the final `.mp4` file.

---

## 📦 Tech Stack

* **Language:** Python 3.10+
* **Scene Detection:** `PySceneDetect`
* **Vector Database:** `chromadb`
* **Embeddings:** `open_clip_torch` (CLIP ViT-B/32)
* **Vision Models:** `moondream` / `transformers` (BLIP-2)
* **LLM Engine:** DeepSeek V3 / DeepSeek Reasoner API
* **Video Assembly:** `moviepy` / `ffmpeg-python`
* **Voice Generation:** `edge-tts` / `coqui-tts` / ElevenLabs

---

## 🚀 Quickstart

### Prerequisites

Ensure you have `ffmpeg` installed on your system:

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

```

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/your-username/ai-movie-recap-engine.git
cd ai-movie-recap-engine

```


2. **Create a virtual environment and install dependencies:**
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

```


3. **Set up environment variables:**
Create a `.env` file in the root directory:
```env
DEEPSEEK_API_KEY=your_deepseek_api_key_here

```



---

## 💻 Usage

### 1. Index the Movie

Run the segmentation, captioning, and vector embedding pipeline on your input video file:

```bash
python index_movie.py --input data/movie.mp4 --subtitles data/subtitles.srt

```

### 2. Generate Story Scripts

Generate multi-angle recap scripts using DeepSeek's context-cached prompt pipeline:

```bash
python generate_script.py --angle standard   # Options: standard, villain, shorts, lore

```

### 3. Assemble Final Video

Match scripts to vector embeddings, generate voiceovers, and compile the final recap:

```bash
python assemble_video.py --script outputs/script_standard.json --output recap_final.mp4

```

---

## 📊 Performance & Cost Efficiency

| Metric | Average Value |
| --- | --- |
| **Input Context per Movie** | ~85,000 – 100,000 Tokens |
| **First Script Generation Cost** | ~$0.03 USD |
| **Cached Script Cost (Per Additional Angle)** | ~$0.005 USD |
| **Local Indexing Time (GPU)** | ~10–15 mins for a 2-hour 1080p film |

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://www.google.com/search?q=../../issues).

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.